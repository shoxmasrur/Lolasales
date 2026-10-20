import type { HumanKind } from '@/domain/entities/Conversation';
import { OCHIQ_VADA_HOLATLARI } from '@/domain/entities/PaymentPromise';
import { YOZILADIGAN_SQL_QIYMATLARI } from '@/domain/entities/shartnomaHolati';
import type {
  IRecontactRepository,
  RecontactItem,
} from '@/domain/repositories/IRecontactRepository';
import {
  QAYTA_ALOQA_ISH_KUNLARI,
  RECONTACT_KIND_ORDER,
  qaytaAloqaTuri,
  type QaytaAloqaQoidalari,
  type QaytaAloqaSnapshot,
  type QaytaAloqaVadasi,
} from '@/domain/services/qaytaAloqa';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { query } from '@/infrastructure/db/pool';
import { mijozQamroviSharti } from '@/infrastructure/db/qamrovSharti';
import { config } from '@/shared/config';

/** Oldindan ko'rish uzunligi — API kelishuvi (dizayn 3-bo'lim). */
const PREVIEW_MAX = 120;

/** Matnsiz xabar uchun belgi — chat ro'yxatidagi ko'rinish bilan bir ma'noda. */
const MEDIA_BELGILARI: Record<string, string> = {
  photo: '[rasm]',
  voice: '[ovozli xabar]',
  audio: '[audio]',
  video: '[video]',
  video_note: '[video xabar]',
  document: '[fayl]',
  sticker: '[stiker]',
  other: '[media]',
};

/**
 * Keng oldindan filtr + snapshot — bitta so'rov.
 *
 * SQL faqat KESADI, qaror bermaydi: tur va aniq ish kunlari
 * `qaytaAloqaTuri` da hisoblanadi. Shuning uchun bu yerdagi har bir shart
 * tasniflagichdagi shartdan KENGROQ yoki unga TENG bo'lishi shart — tor
 * bo'lsa, suhbat ro'yxatdan jimgina tushib qolardi:
 *
 *   • sukut — 3 KALENDAR kun. Ish kunlari (yakshanbasiz) hech qachon
 *     kalendar kunlardan ko'p bo'lmaydi, ya'ni bu chegara xavfsiz;
 *   • sanasi kelmagan ochiq va'da — tasniflagichdagi bilan AYNAN bir xil
 *     (sana `promised_date >= bugun`, mintaqa bo'yicha).
 *
 * Oxirgi xabar — `in`/`out`, `note` EMAS (operator topshirig'i mijoz bilan
 * yozishma emas) va `failed` EMAS: Telegramga ketmagan xabar mijozni
 * "bezovta qilgan" emas, sukutni ham yangilamaydi.
 *
 * N+1 yo'q: har suhbat uchun kerakli hamma narsa LATERAL'lar bilan shu
 * so'rovda yig'iladi. `$4` berilsa faqat o'sha suhbat (`findOne`).
 *
 * Obyekt cheklovi: cheklangan qamrovda oxiriga `AND <mijoz qamrovi>` (`$7`)
 * qo'shiladi; cheklanmaganda SQL va parametrlar aynan shu.
 */
const SQL = `
  SELECT c.id, c.client_id, cl.full_name, c.nudge_count, c.state,
         c.agent_enabled, c.needs_human, c.human_kind,
         cl.telegram_status, cl.do_not_contact,
         agg.overdue,
         lm.direction AS lm_direction, lm.created_at AS lm_at, lm.read_at AS lm_read_at,
         lm.body AS lm_body, lm.media_kind AS lm_media_kind,
         EXISTS (
           SELECT 1 FROM messages mi
            WHERE mi.conversation_id = c.id AND mi.direction = 'in' AND mi.deleted_at IS NULL
         ) AS mijoz_yozgan,
         lp.date AS lp_date, lp.status AS lp_status, lp.amount AS lp_amount,
         COALESCE(ov.items, '[]'::json) AS ochiq_vadalar
    FROM conversations c
    JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
    JOIN LATERAL (
      -- Mijozga aytiladigan summa bilan bir xil ta'rif: faqat "Сотилди",
      -- \`debt_first + debt_monthly\` (\`kechikkanSumma\`).
      SELECT COALESCE(SUM(COALESCE(ct.debt_first, 0) + COALESCE(ct.debt_monthly, 0)), 0) AS overdue
        FROM contracts ct
       WHERE ct.client_id = c.client_id AND ct.deleted_at IS NULL
         AND TRIM(ct.virtual_status) = ANY($1::text[])
    ) agg ON TRUE
    JOIN LATERAL (
      SELECT m.direction, m.created_at, m.read_at, m.body, m.media_kind
        FROM messages m
       WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
         AND m.direction IN ('in', 'out')
         AND m.status IS DISTINCT FROM 'failed'
       ORDER BY m.created_at DESC
       LIMIT 1
    ) lm ON TRUE
    LEFT JOIN LATERAL (
      SELECT to_char(p.promised_date, 'YYYY-MM-DD') AS date, p.status, p.amount
        FROM payment_promises p
       WHERE p.conversation_id = c.id AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT 1
    ) lp ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'date', to_char(p.promised_date, 'YYYY-MM-DD'),
               'status', p.status,
               'amount', p.amount)) AS items
        FROM payment_promises p
       WHERE p.conversation_id = c.id AND p.deleted_at IS NULL
         AND p.status = ANY($5::text[])
    ) ov ON TRUE
   WHERE c.deleted_at IS NULL
     AND c.agent_enabled
     AND c.state NOT IN ('closed', 'refused')
     AND (NOT c.needs_human OR c.human_kind = 'broken_promise')
     AND NOT cl.do_not_contact
     AND cl.telegram_status NOT IN ('blocked', 'deactivated')
     AND agg.overdue > $3
     AND (lm.created_at AT TIME ZONE $2)::date <= (now() AT TIME ZONE $2)::date - $6::int
     AND NOT EXISTS (
       SELECT 1 FROM payment_promises pa
        WHERE pa.conversation_id = c.id AND pa.deleted_at IS NULL
          AND pa.status = ANY($5::text[])
          AND pa.promised_date >= (now() AT TIME ZONE $2)::date
     )
     AND ($4::uuid IS NULL OR c.id = $4::uuid)
`;

interface Qator {
  id: string;
  client_id: string;
  full_name: string;
  nudge_count: number;
  state: string;
  agent_enabled: boolean;
  needs_human: boolean;
  human_kind: string | null;
  telegram_status: string | null;
  do_not_contact: boolean;
  overdue: number | string;
  lm_direction: 'in' | 'out';
  lm_at: Date;
  lm_read_at: Date | null;
  lm_body: string | null;
  lm_media_kind: string | null;
  mijoz_yozgan: boolean;
  lp_date: string | null;
  lp_status: string | null;
  lp_amount: number | string | null;
  ochiq_vadalar: Array<{ date: string; status: string; amount: number | string }>;
}

/** Oxirgi xabarning qisqa ko'rinishi: matn bo'lsa matn, bo'lmasa media belgisi. */
export function xabarKorinishi(body: string | null, mediaKind: string | null): string {
  const matn = (body ?? '').replace(/\s+/g, ' ').trim();
  if (matn) return matn.length > PREVIEW_MAX ? `${matn.slice(0, PREVIEW_MAX - 1)}…` : matn;
  if (mediaKind) return MEDIA_BELGILARI[mediaKind] ?? '[media]';
  return '';
}

function snapshot(r: Qator): QaytaAloqaSnapshot {
  const vada = (v: { date: string; status: string; amount: number | string }): QaytaAloqaVadasi => ({
    date: v.date,
    status: v.status,
    amount: Number(v.amount),
  });
  return {
    lastMessage: { direction: r.lm_direction, at: r.lm_at, readAt: r.lm_read_at },
    mijozYozgan: r.mijoz_yozgan,
    nudgeCount: Number(r.nudge_count),
    lastPromise:
      r.lp_date && r.lp_status
        ? vada({ date: r.lp_date, status: r.lp_status, amount: r.lp_amount ?? 0 })
        : null,
    ochiqVadalar: (r.ochiq_vadalar ?? []).map(vada),
    overdue: Number(r.overdue),
    state: r.state,
    agentEnabled: r.agent_enabled,
    needsHuman: r.needs_human,
    humanKind: r.human_kind as HumanKind | null,
    telegramStatus: r.telegram_status,
    doNotContact: r.do_not_contact,
  };
}

export class PgRecontactRepository implements IRecontactRepository {
  async list(qoidalar: QaytaAloqaQoidalari, qamrov: MijozQamrovi = HAMMASI): Promise<RecontactItem[]> {
    const items = await this.hisobla(null, qoidalar, qamrov);
    return items.sort(
      (a, b) =>
        RECONTACT_KIND_ORDER.indexOf(a.kind) - RECONTACT_KIND_ORDER.indexOf(b.kind) ||
        b.overdue - a.overdue,
    );
  }

  async findOne(
    conversationId: string,
    qoidalar: QaytaAloqaQoidalari,
    qamrov: MijozQamrovi = HAMMASI,
  ): Promise<RecontactItem | null> {
    const [item] = await this.hisobla(conversationId, qoidalar, qamrov);
    return item ?? null;
  }

  private async hisobla(
    conversationId: string | null,
    qoidalar: QaytaAloqaQoidalari,
    qamrov: MijozQamrovi,
  ): Promise<RecontactItem[]> {
    const timeZone = qoidalar.timeZone ?? config.TIMEZONE;
    const params: unknown[] = [
      YOZILADIGAN_SQL_QIYMATLARI,
      timeZone,
      qoidalar.minDebt,
      conversationId,
      OCHIQ_VADA_HOLATLARI,
      QAYTA_ALOQA_ISH_KUNLARI,
    ];
    const sql = qamrov.cheklangan ? `${SQL}     AND ${mijozQamroviSharti(qamrov, 'cl', params)}\n` : SQL;
    const { rows } = await query<Qator>(sql, params);

    const hozir = new Date();
    const items: RecontactItem[] = [];
    for (const r of rows) {
      const s = snapshot(r);
      const { kind, silentWorkDays } = qaytaAloqaTuri(s, hozir, { ...qoidalar, timeZone });
      if (!kind) continue;
      items.push({
        conversationId: r.id,
        clientId: r.client_id,
        clientName: r.full_name,
        kind,
        overdue: s.overdue,
        silentWorkDays,
        lastMessageAt: r.lm_at.toISOString(),
        lastMessageDirection: r.lm_direction,
        lastMessagePreview: xabarKorinishi(r.lm_body, r.lm_media_kind),
        lastPromise: s.lastPromise,
      });
    }
    return items;
  }
}
