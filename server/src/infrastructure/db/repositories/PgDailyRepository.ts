import type { IDailyRepository } from '@/domain/repositories/IDailyRepository';
import type { KunFiltri, XomKunStat, XomSuhbat } from '@/domain/services/kunlikToifalar';
import { query } from '@/infrastructure/db/pool';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const iso = (v: unknown): string => new Date(v as string).toISOString();

export class PgDailyRepository implements IDailyRepository {
  /**
   * Kun raqamlari.
   *
   * "Yozilgan" — MUVAFFAQIYATLI ketgan xabar: navbatda turgani yoki
   * yiqilgani mijozga yetib bormagan va uni "yozdik" deb sanash
   * javob ulushini sun'iy pasaytirardi.
   *
   * Filtr ($4 obyekt, $5 akkaunt; NULL — filtr yo'q) `filtrgaMos` bilan bir
   * xil ma'noda: obyekt — mijozning biror tirik shartnomasi shu obyektda
   * (EXISTS — mijoz bir marta sanaladi), akkaunt — suhbat shu akkauntda.
   * Tushum shartnoma darajasida: obyekt — to'lov shartnomasining obyekti,
   * akkaunt — shu shartnoma mijozining suhbati shu akkauntda.
   */
  async kunStat(
    boshIso: string,
    oxirIso: string,
    kunIso: string,
    filtr: KunFiltri = {},
  ): Promise<XomKunStat> {
    const obyekt = filtr.obyekt || null;
    const akkaunt = filtr.akkaunt || null;
    // Mijoz/suhbat darajasidagi filtr — `cl`/`cv` taxalluslari bilan.
    const mijozFiltri = `
            AND ($4::text IS NULL OR EXISTS (
                  SELECT 1 FROM contracts fo
                   WHERE fo.client_id = cl.id AND fo.deleted_at IS NULL
                     AND trim(fo.object_name) = $4::text))
            AND ($5::uuid IS NULL OR cv.telegram_account_id = $5::uuid)`;
    const { rows } = await query<Row>(
      `WITH chiqish AS (
         -- Faqat tirik mijozlar — "suhbatlari" ro'yxati ham xuddi shu
         -- populyatsiyani ko'radi (pastda clients.deleted_at filtri bor).
         SELECT DISTINCT cv.client_id
           FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id AND cv.deleted_at IS NULL
           JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL
          WHERE m.direction = 'out'
            AND m.status IN ('sent','delivered','read')
            AND m.deleted_at IS NULL
            AND m.sent_at >= $1::timestamptz AND m.sent_at < $2::timestamptz${mijozFiltri}
       ),
       javob AS (
         SELECT DISTINCT cv.client_id
           FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id AND cv.deleted_at IS NULL
           JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL
          WHERE m.direction = 'in'
            AND m.deleted_at IS NULL
            AND m.created_at >= $1::timestamptz AND m.created_at < $2::timestamptz${mijozFiltri}
       )
       SELECT (SELECT count(*) FROM chiqish)::int AS yozilgan,
              (SELECT count(*) FROM javob j
                WHERE EXISTS (SELECT 1 FROM chiqish c WHERE c.client_id = j.client_id))::int
                AS javob_bergan,
              -- Bu yerda ham "tirik" populyatsiya: o'chirilgan mijoz/suhbatning
              -- va'dasi kartada ko'rinmasin — "suhbatlari" ro'yxati bilan mos bo'lsin.
              (SELECT count(*) FROM payment_promises p
                JOIN conversations cv ON cv.id = p.conversation_id AND cv.deleted_at IS NULL
                JOIN clients cl ON cl.id = p.client_id AND cl.deleted_at IS NULL
                WHERE p.deleted_at IS NULL
                  AND p.created_at >= $1::timestamptz AND p.created_at < $2::timestamptz${mijozFiltri})::int
                AS vada_soni,
              COALESCE((SELECT SUM(p.amount) FROM payment_promises p
                         JOIN conversations cv ON cv.id = p.conversation_id AND cv.deleted_at IS NULL
                         JOIN clients cl ON cl.id = p.client_id AND cl.deleted_at IS NULL
                         WHERE p.deleted_at IS NULL
                           AND p.created_at >= $1::timestamptz
                           AND p.created_at < $2::timestamptz${mijozFiltri}), 0)::numeric AS vada_summasi,
              -- O'chirilgan shartnomaning to'lovi hisoblanmaydi — PgReportRepository
              -- da har bir tushum raqami shu qoida bilan hisoblanadi.
              COALESCE((SELECT SUM(e.amount) FROM contract_payment_events e
                         JOIN contracts ct ON ct.id = e.contract_id AND ct.deleted_at IS NULL
                         WHERE e.is_problematic = FALSE
                           AND e.date_paid = $3::date
                           AND ($4::text IS NULL OR trim(ct.object_name) = $4::text)
                           AND ($5::uuid IS NULL OR EXISTS (
                                 SELECT 1 FROM conversations cv
                                   JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL
                                  WHERE cv.client_id = ct.client_id AND cv.deleted_at IS NULL
                                    AND cv.telegram_account_id = $5::uuid))), 0)::numeric AS tushum`,
      [boshIso, oxirIso, kunIso, obyekt, akkaunt],
    );

    const r = rows[0] ?? {};
    return {
      yozilganMijoz: Number(r.yozilgan ?? 0),
      javobBerganMijoz: Number(r.javob_bergan ?? 0),
      vadaSoni: Number(r.vada_soni ?? 0),
      vadaSummasi: Number(r.vada_summasi ?? 0),
      tushumSummasi: Number(r.tushum ?? 0),
    };
  }

  /**
   * Shu kuni HARAKAT bo'lgan suhbatlar.
   *
   * Uch manba: kunning xabari, shu kuni yangilangan suhbat (eskalatsiya
   * shu yerga tushadi) va muddati shu kunga to'g'ri kelgan va'da — oxirgisi
   * xabarsiz ham ro'yxatga tushishi kerak.
   */
  async kunSuhbatlari(boshIso: string, oxirIso: string, kunIso: string): Promise<XomSuhbat[]> {
    const { rows } = await query<Row>(
      `WITH tanlov AS (
         SELECT cv.id
           FROM conversations cv
          WHERE cv.deleted_at IS NULL
            AND (
              -- Faqat mijozga/mijozdan ketgan haqiqiy xabar — ichki eslatma
              -- (direction='note') va qoralama suhbatni "bugun harakat
              -- bo'ldi" deb tanlamasin (qo'shnilar: PgConversationRepository,
              -- PgSupportRepositories). Sana ham sent_at bo'yicha —
              -- chiqish_vaqtlari/kunStat bilan bitta populyatsiya.
              EXISTS (SELECT 1 FROM messages m
                       WHERE m.conversation_id = cv.id AND m.deleted_at IS NULL
                         AND m.direction IN ('in','out') AND m.status <> 'draft'
                         AND COALESCE(m.sent_at, m.created_at) >= $1::timestamptz
                         AND COALESCE(m.sent_at, m.created_at) < $2::timestamptz)
              OR (cv.updated_at >= $1::timestamptz AND cv.updated_at < $2::timestamptz)
              OR EXISTS (SELECT 1 FROM payment_promises p
                          WHERE p.conversation_id = cv.id AND p.deleted_at IS NULL
                            AND p.status = 'pending' AND p.promised_date = $3::date)
            )
       )
       SELECT cv.id                                   AS conversation_id,
              cl.full_name                            AS client_name,
              cl.telegram_status,
              cv.state, cv.needs_human, cv.human_kind, cv.human_reason,
              cv.summary                              AS eslatma,
              (cv.updated_at >= $1::timestamptz AND cv.updated_at < $2::timestamptz)
                                                      AS bugun_yangilangan,
              COALESCE(cv.last_message_at, cv.updated_at) AS oxirgi_harakat_at,
              asos.contract_no,
              NULLIF(trim(asos.object_name), '')       AS obyekt,
              asos.virtual_status,
              -- Obyekt filtri shu ro'yxat bilan ishlaydi (kunStat dagi EXISTS
              -- bilan bir xil: tirik shartnoma, trim).
              COALESCE((SELECT array_agg(DISTINCT trim(ct.object_name))
                          FROM contracts ct
                         WHERE ct.client_id = cl.id AND ct.deleted_at IS NULL
                           AND NULLIF(trim(ct.object_name), '') IS NOT NULL), '{}') AS obyektlar,
              cv.telegram_account_id                  AS akkaunt_id,
              ta.label                                AS akkaunt_nomi,
              -- tanlov dagi xabar shartiga mos: ichki eslatma va qoralama
              -- "uzoq suhbat" ga hisoblanmasin.
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = cv.id AND m.deleted_at IS NULL
                  AND m.direction IN ('in','out') AND m.status <> 'draft')::int AS jami_xabar,
              EXISTS (SELECT 1 FROM payment_promises p
                       WHERE p.conversation_id = cv.id AND p.deleted_at IS NULL) AS vada_bor,
              -- contract_no subquery kabi: o'chirilgan shartnoma hisobga olinmaydi.
              EXISTS (SELECT 1 FROM contract_payment_events e
                       JOIN contracts ct ON ct.id = e.contract_id AND ct.client_id = cl.id
                                         AND ct.deleted_at IS NULL
                      WHERE e.is_problematic = FALSE)                            AS tolov_bor,
              EXISTS (SELECT 1 FROM payment_promises p
                       WHERE p.conversation_id = cv.id AND p.deleted_at IS NULL
                         AND p.status = 'pending'
                         AND p.promised_date = $3::date)                         AS bugun_vada_muddati,
              EXISTS (SELECT 1 FROM contract_payment_events e
                       JOIN contracts ct ON ct.id = e.contract_id AND ct.client_id = cl.id
                                         AND ct.deleted_at IS NULL
                      WHERE e.is_problematic = FALSE AND e.date_paid = $3::date) AS bugun_tolov_keldi,
              -- Boshqa shu qatordagi xabar hisoblari kabi (jami_xabar,
              -- chiqish_vaqtlari, mijoz_matnlari) — o'chirilgan xabar sanalmaydi.
              EXISTS (SELECT 1 FROM messages m
                       WHERE m.conversation_id = cv.id AND m.status = 'failed'
                         AND m.deleted_at IS NULL
                         AND m.created_at >= $1::timestamptz
                         AND m.created_at < $2::timestamptz)                      AS xato_xabar,
              EXISTS (SELECT 1 FROM messages m
                       WHERE m.conversation_id = cv.id AND m.direction = 'out'
                         AND m.deleted_at IS NULL
                         AND ((m.edited_at >= $1::timestamptz AND m.edited_at < $2::timestamptz)
                              OR (m.revoked_at >= $1::timestamptz
                                  AND m.revoked_at < $2::timestamptz)))           AS tahrirlangan,
              COALESCE((SELECT array_agg(m.sent_at ORDER BY m.sent_at)
                          FROM messages m
                         WHERE m.conversation_id = cv.id AND m.direction = 'out'
                           AND m.status IN ('sent','delivered','read') AND m.deleted_at IS NULL
                           AND m.sent_at >= $1::timestamptz
                           AND m.sent_at < $2::timestamptz), '{}') AS chiqish_vaqtlari,
              COALESCE((SELECT array_agg(m.body ORDER BY m.created_at)
                          FROM messages m
                         WHERE m.conversation_id = cv.id AND m.direction = 'in'
                           AND m.deleted_at IS NULL
                           AND m.created_at >= $1::timestamptz
                           AND m.created_at < $2::timestamptz), '{}') AS mijoz_matnlari
         FROM tanlov t
         JOIN conversations cv ON cv.id = t.id
         JOIN clients cl ON cl.id = cv.client_id AND cl.deleted_at IS NULL
         -- Asosiy shartnoma: eng ko'p kechikkani (avvalgi contract_no tanlovi
         -- aynan shu) — raqam, obyekt va holat bitta shartnomadan olinadi.
         LEFT JOIN LATERAL (
           SELECT ct.contract_no, ct.object_name, ct.virtual_status
             FROM contracts ct
            WHERE ct.client_id = cl.id AND ct.deleted_at IS NULL
            ORDER BY ct.days_overdue DESC NULLS LAST, ct.contract_no
            LIMIT 1
         ) asos ON TRUE
         -- Akkaunt o'chirilgan bo'lsa ham nomi ko'rinsin (ChatPage kabi label).
         LEFT JOIN telegram_accounts ta ON ta.id = cv.telegram_account_id`,
      [boshIso, oxirIso, kunIso],
    );

    return rows.map((r) => {
      const matnlar: string[] = (r.mijoz_matnlari ?? []).map((m: unknown) => String(m));
      return {
        conversationId: String(r.conversation_id),
        clientName: String(r.client_name),
        contractNo: r.contract_no ? String(r.contract_no) : null,
        state: String(r.state),
        needsHuman: Boolean(r.needs_human),
        humanKind: r.human_kind ? String(r.human_kind) : null,
        humanReason: r.human_reason ? String(r.human_reason) : null,
        eslatma: r.eslatma ? String(r.eslatma) : null,
        bugunYangilangan: Boolean(r.bugun_yangilangan),
        telegramStatus: String(r.telegram_status),
        jamiXabar: Number(r.jami_xabar ?? 0),
        vadaBor: Boolean(r.vada_bor),
        tolovBor: Boolean(r.tolov_bor),
        bugunVadaMuddati: Boolean(r.bugun_vada_muddati),
        bugunTolovKeldi: Boolean(r.bugun_tolov_keldi),
        xatoXabar: Boolean(r.xato_xabar),
        tahrirlangan: Boolean(r.tahrirlangan),
        chiqishVaqtlari: (r.chiqish_vaqtlari ?? []).map(iso),
        mijozMatnlari: matnlar,
        oxirgiMijozGapi: matnlar.length ? matnlar[matnlar.length - 1]! : null,
        oxirgiHarakatAt: iso(r.oxirgi_harakat_at),
        obyekt: r.obyekt ? String(r.obyekt) : null,
        obyektlar: (r.obyektlar ?? []).map((o: unknown) => String(o)),
        akkauntId: r.akkaunt_id ? String(r.akkaunt_id) : null,
        akkauntNomi: r.akkaunt_nomi ? String(r.akkaunt_nomi) : null,
        virtualStatus: r.virtual_status ? String(r.virtual_status) : null,
      };
    });
  }
}
