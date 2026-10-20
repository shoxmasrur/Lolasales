import type {
  AttributionReport,
  CampaignAttribution,
  ClientAttribution,
  GroupResult,
  IReportRepository,
  TushumFiltri,
  UslubQatori,
} from '@/domain/repositories/IReportRepository';
import type { AttributedPayment } from '@/domain/services/attributionBuckets';
import { sumByBucket } from '@/domain/services/attributionBuckets';
import type { GrafikQatori, XomTolov } from '@/domain/services/tushumBelgilari';
import { query } from '@/infrastructure/db/pool';

/**
 * Mijozning "biz gaplashdik" vaqti — birinchi MUVAFFAQIYATLI chiquvchi xabar.
 *
 * `conversations.created_at` ishlatilmaydi: suhbat qatori xabar
 * yuborilishidan oldin yaratiladi va Telegram qidiruvi muvaffaqiyatsiz
 * tugasa, hech qachon xabar ketmagan bo'lishi mumkin. Bunday mijozni
 * "gaplashilgan" deb sanash raqamni sun'iy oshirardi.
 */
const ANCHOR_CTE = `
  anchors AS (
    SELECT cv.client_id, min(m.sent_at) AS anchor_at
      FROM messages m
      JOIN conversations cv ON cv.id = m.conversation_id
     WHERE m.direction = 'out'
       AND m.sent_at IS NOT NULL
       AND m.deleted_at IS NULL
       AND cv.deleted_at IS NULL
     GROUP BY cv.client_id
  )
`;

/** Bahsli to'lovlar hisoblanmaydi — buxgalteriya ularni tasdiqlamagan. */
const PAYMENTS_JOIN = `
  JOIN contracts c ON c.client_id = a.client_id AND c.deleted_at IS NULL
  JOIN contract_payment_events e ON e.contract_id = c.id AND e.is_problematic = FALSE
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function shape(rows: Row[], clients: number): GroupResult {
  const payments: AttributedPayment[] = rows.map((r) => ({
    amount: Number(r.amount),
    daysAfter: Number(r.days_after),
  }));
  return {
    clients,
    paidClients: new Set(rows.map((r) => String(r.client_id))).size,
    amount: payments.reduce((s, p) => s + p.amount, 0),
    buckets: sumByBucket(payments),
  };
}

export class PgReportRepository implements IReportRepository {
  async attribution(fromIso: string, toIso: string): Promise<AttributionReport> {
    // ─── Gaplashilganlar ─────────────────────────────────────────────────
    const { rows: contactedRows } = await query<Row>(
      `WITH ${ANCHOR_CTE},
       cohort AS (
         SELECT a.client_id, a.anchor_at
           FROM anchors a
           JOIN clients cl ON cl.id = a.client_id AND cl.deleted_at IS NULL
          WHERE a.anchor_at::date BETWEEN $1::date AND $2::date
       )
       SELECT e.amount,
              (e.date_paid - a.anchor_at::date) AS days_after,
              a.client_id
         FROM cohort a
         ${PAYMENTS_JOIN}
        WHERE e.date_paid >= a.anchor_at::date`,
      [fromIso, toIso],
    );

    const { rows: contactedCount } = await query<{ n: number }>(
      `WITH ${ANCHOR_CTE}
       SELECT count(*)::int AS n
         FROM anchors a
         JOIN clients cl ON cl.id = a.client_id AND cl.deleted_at IS NULL
        WHERE a.anchor_at::date BETWEEN $1::date AND $2::date`,
      [fromIso, toIso],
    );

    // ─── Gaplashilmaganlar (solishtirish guruhi) ─────────────────────────
    // Anchor — davrning boshlanishi: ular bilan hech qachon
    // gaplashilmagan, shuning uchun boshqa boshlanish nuqtasi yo'q.
    const { rows: notContactedRows } = await query<Row>(
      `WITH ${ANCHOR_CTE},
       cohort AS (
         SELECT cl.id AS client_id, $1::date AS anchor_at
           FROM clients cl
           JOIN contracts ct ON ct.client_id = cl.id AND ct.deleted_at IS NULL
          WHERE cl.deleted_at IS NULL
            AND ct.debt_total > 0
            AND NOT EXISTS (SELECT 1 FROM anchors a WHERE a.client_id = cl.id)
          GROUP BY cl.id
       )
       SELECT e.amount,
              (e.date_paid - a.anchor_at) AS days_after,
              a.client_id
         FROM cohort a
         ${PAYMENTS_JOIN}
        WHERE e.date_paid >= a.anchor_at
          AND e.date_paid <= $2::date`,
      [fromIso, toIso],
    );

    const { rows: notContactedCount } = await query<{ n: number }>(
      `WITH ${ANCHOR_CTE}
       SELECT count(DISTINCT cl.id)::int AS n
         FROM clients cl
         JOIN contracts ct ON ct.client_id = cl.id AND ct.deleted_at IS NULL
        WHERE cl.deleted_at IS NULL
          AND ct.debt_total > 0
          AND NOT EXISTS (SELECT 1 FROM anchors a WHERE a.client_id = cl.id)`,
    );

    return {
      from: fromIso,
      to: toIso,
      contacted: shape(contactedRows, Number(contactedCount[0]?.n ?? 0)),
      notContacted: shape(notContactedRows, Number(notContactedCount[0]?.n ?? 0)),
    };
  }

  /**
   * Kampaniya kesimi.
   *
   * Anchor — `campaign_targets.sent_at`: mijoz bir necha kampaniyaga
   * tushgan bo'lishi mumkin va har biri o'z vaqtidan hisoblanadi.
   * Shu sabab bitta to'lov ikki kampaniyaga ham yozilishi mumkin — bu
   * ataylab: kampaniyalarni bir-biriga qo'shib bo'lmaydi, ular alohida
   * o'qiladi.
   */
  async byCampaign(limit: number): Promise<CampaignAttribution[]> {
    const { rows } = await query<Row>(
      `SELECT cp.id                               AS campaign_id,
              cp.name,
              count(DISTINCT t.client_id)::int    AS sent,
              count(DISTINCT CASE WHEN e.id IS NOT NULL THEN t.client_id END)::int AS paid_clients,
              COALESCE(SUM(e.amount), 0)::numeric AS amount
         FROM campaigns cp
         JOIN campaign_targets t
           ON t.campaign_id = cp.id AND t.sent_at IS NOT NULL AND t.deleted_at IS NULL
         LEFT JOIN contracts c
           ON c.client_id = t.client_id AND c.deleted_at IS NULL
         LEFT JOIN contract_payment_events e
           ON e.contract_id = c.id
          AND e.is_problematic = FALSE
          AND e.date_paid >= t.sent_at::date
        -- campaigns jadvalida yumshoq o'chirish YO'Q (campaign_targets da bor),
        -- shuning uchun bu yerda deleted_at filtri qo'yilmaydi.
        GROUP BY cp.id, cp.name, cp.created_at
        ORDER BY cp.created_at DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((r) => ({
      campaignId: String(r.campaign_id),
      name: String(r.name),
      sent: Number(r.sent),
      paidClients: Number(r.paid_clients),
      amount: Number(r.amount),
    }));
  }

  async forClient(clientId: string): Promise<ClientAttribution> {
    const { rows } = await query<Row>(
      `WITH ${ANCHOR_CTE}
       SELECT a.anchor_at, e.amount, (e.date_paid - a.anchor_at::date) AS days_after
         FROM anchors a
         ${PAYMENTS_JOIN}
        WHERE a.client_id = $1 AND e.date_paid >= a.anchor_at::date
        ORDER BY e.date_paid DESC`,
      [clientId],
    );

    const first = rows[0];
    if (!first) {
      // To'lov yo'q, lekin gaplashilgan bo'lishi mumkin — kartada
      // "suhbatdan keyin 0" deb ko'rsatish uchun anchor baribir kerak.
      const { rows: anchorOnly } = await query<Row>(
        `WITH ${ANCHOR_CTE} SELECT anchor_at FROM anchors WHERE client_id = $1`,
        [clientId],
      );
      const anchor = anchorOnly[0]?.anchor_at;
      return {
        anchorAt: anchor ? new Date(anchor).toISOString() : null,
        amount: 0,
        payments: [],
      };
    }

    const payments: AttributedPayment[] = rows.map((r) => ({
      amount: Number(r.amount),
      daysAfter: Number(r.days_after),
    }));

    return {
      anchorAt: new Date(first.anchor_at).toISOString(),
      amount: payments.reduce((s, p) => s + p.amount, 0),
      payments,
    };
  }

  /**
   * Eksport uchun xom to'lovlar.
   *
   * Anchor `ANCHOR_CTE` dan — ekrandagi hisobot bilan bir xil qoida.
   * `LEFT JOIN`: gaplashilmagan mijozning to'lovi ham kerak (B ko'rinishi).
   * Grafik JSON bo'lib keladi va "kechikkan" belgisi domenda hisoblanadi.
   *
   * Qidiruvdagi `%` va `_` ekranlanadi — aks holda "A_1" qidiruvi "AB1" ni
   * ham topardi.
   */
  async paymentsForExport(f: TushumFiltri): Promise<XomTolov[]> {
    const q = f.q ? `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
    const { rows } = await query<Row>(
      `WITH ${ANCHOR_CTE}
       SELECT e.id                         AS event_id,
              c.contract_no,
              cl.full_name                 AS client_name,
              c.object_name,
              e.amount,
              e.date_paid,
              e.payment_type,
              e.purpose,
              e.is_problematic,
              (a.anchor_at::date)::text    AS anchor_date,
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'datePayment', p.date_payment,
                          'datePaid',    p.date_paid,
                          'status',      p.status))
                   FROM contract_payments p
                  WHERE p.contract_id = c.id),
                '[]'::json
              )                            AS grafik
         FROM contract_payment_events e
         JOIN contracts c  ON c.id = e.contract_id AND c.deleted_at IS NULL
         JOIN clients  cl  ON cl.id = c.client_id AND cl.deleted_at IS NULL
         LEFT JOIN anchors a ON a.client_id = cl.id
        WHERE e.date_paid BETWEEN $1::date AND $2::date
          AND ($3::boolean OR e.is_problematic = FALSE)
          AND ($4::text IS NULL OR c.contract_no ILIKE $4 OR cl.full_name ILIKE $4)
        ORDER BY e.date_paid, c.contract_no, e.id`,
      [f.from, f.to, f.bahsli, q],
    );

    return rows.map((r) => ({
      eventId: String(r.event_id),
      contractNo: String(r.contract_no),
      clientName: String(r.client_name),
      objectName: r.object_name ? String(r.object_name) : null,
      amount: Number(r.amount),
      datePaid: String(r.date_paid),
      paymentType: r.payment_type ? String(r.payment_type) : null,
      purpose: r.purpose ? String(r.purpose) : null,
      isProblematic: Boolean(r.is_problematic),
      anchorDate: r.anchor_date ? String(r.anchor_date) : null,
      grafik: (r.grafik as GrafikQatori[]).map((g) => ({
        datePayment: String(g.datePayment),
        datePaid: g.datePaid ? String(g.datePaid) : null,
        status: String(g.status),
      })),
    }));
  }

  /**
   * v1/v2 uslublarini taqqoslash.
   *
   * `tagged` — davr ichida tamg'alangan (meta->>'styleVersion' bor) chiquvchi
   * agent xabarlari; eski xabarlarda tamg'a yo'q, ular shu yerda avtomatik
   * tushib qoladi. Xabar darajasidagi ko'rsatkichlar (xabarlar, javob3Kun,
   * ortachaSoz, qisqaUlush) shu jadvaldan to'g'ridan-to'g'ri hisoblanadi.
   *
   * To'lov bilan bog'liq ikkitasi (vadaOlingan, tolov14Kun) boshqacha:
   * ular `payment_promises`/`contract_payments`da to'g'ridan-to'g'ri uslub
   * ustuni yo'q, faqat suhbat va mijoz orqali bog'lanadi. Shu sababli
   * SUHBAT darajasida hisoblanadi — har suhbatning DAVR ICHIDAGI oxirgi
   * tamg'alangan xabari (`last_tagged`) o'sha suhbatning "uslubi" deb
   * olinadi, va shu vaqtdan keyin va'da/to'lov bo'lganmi tekshiriladi.
   * Bu ATAYLAB taxminiy: bitta suhbatda ikkala uslub aralash bo'lishi
   * mumkin, va natija sabab-oqibatni isbotlamaydi — faqat kuzatuv.
   */
  async uslubTaqqoslash(from: string, to: string): Promise<UslubQatori[]> {
    const { rows } = await query<Row>(
      `WITH tagged AS (
         SELECT m.id, m.conversation_id, m.created_at,
                (m.meta->>'styleVersion') AS style, m.body,
                (SELECT min(i.created_at) FROM messages i
                   WHERE i.conversation_id = m.conversation_id AND i.direction = 'in'
                     AND i.created_at > m.created_at AND i.deleted_at IS NULL) AS javob
           FROM messages m
          WHERE m.deleted_at IS NULL AND m.direction = 'out' AND m.author = 'agent'
            AND m.meta->>'styleVersion' IS NOT NULL
            -- Qoralama (qo'lda tasdiqlash rejimida AgentRunner yaratadi,
            -- lekin hali yuborilmagan) va failed (yuborish muvaffaqiyatsiz
            -- tugagan yoki operator tasdiqlagandan keyin yopilgan qoralama,
            -- SendManualMessageUseCase) hisobotga kirmasligi kerak — ular
            -- mijozga YETIB BORMAGAN. Qo'shni hisob-kitoblar
            -- (PgDailyRepository.kunSuhbatlari, PgSupportRepositories)
            -- status <> 'draft' ishlatadi; bu yerda failed ham
            -- qo'shimcha chiqariladi, chunki tamg'a qoralamada ham bor.
            AND m.status NOT IN ('draft', 'failed')
            AND m.created_at::date BETWEEN $1::date AND $2::date
       ),
       msg_stats AS (
         SELECT style,
                count(*) AS xabarlar,
                count(*) FILTER (
                  WHERE javob IS NOT NULL AND javob - created_at < interval '3 days'
                ) AS javob_3kun_n,
                -- So'z sanashda body IS NULL bo'lgan xabarlar (rasm/fayl,
                -- matnsiz) chiqarib tashlanadi: ular so'z sanog'iga
                -- aloqador emas, lekin umumiy maxrajga (xabarlar) kirib
                -- qolsa "qisqa xabar ulushi"ni sun'iy pasaytiradi — rasm
                -- hech qachon qisqa deb sanalmaydi, lekin maxrajni
                -- kattalashtiradi. Shuning uchun qisqa_ulush alohida
                -- maxraj (soz_n) bilan hisoblanadi.
                count(*) FILTER (WHERE body IS NOT NULL) AS soz_n,
                -- Bo'sh joy EMAS, balki so'z chegarasi bo'yicha sanaladi:
                -- ko'p qatorli xabar (qoidalarda "2-3 qator" deyilgan)
                -- yangi qatorni ajratuvchi deb hisoblamasa, so'z soni
                -- sun'iy kamayib, v1/v2 taqqoslashini buzardi. btrim —
                -- boshi/oxiridagi bo'sh joy regexp_split_to_array'da
                -- qo'shimcha bo'sh elementga aylanib ketmasligi uchun.
                avg(array_length(regexp_split_to_array(btrim(body), '\s+'), 1))
                  FILTER (WHERE body IS NOT NULL) AS ortacha_soz,
                -- 3 so'z — 2026-09-28 auditidagi "qisqa javob" ta'rifi bilan
                -- bir xil (jamoada 47,4%, agentda 2,4%); boshqa son bo'lsa
                -- bu ustunni o'sha audit raqamlari bilan solishtirib
                -- bo'lmaydi.
                count(*) FILTER (
                  WHERE body IS NOT NULL
                    AND array_length(regexp_split_to_array(btrim(body), '\s+'), 1) <= 3
                ) AS qisqa_n
           FROM tagged
          GROUP BY style
       ),
       last_tagged AS (
         SELECT DISTINCT ON (conversation_id) conversation_id, style, created_at
           FROM tagged
          ORDER BY conversation_id, created_at DESC
       ),
       conv_client AS (
         SELECT lt.conversation_id, lt.style, lt.created_at, c.client_id
           FROM last_tagged lt
           JOIN conversations c ON c.id = lt.conversation_id
       ),
       conv_outcomes AS (
         SELECT cc.style,
                cc.conversation_id,
                EXISTS (
                  SELECT 1 FROM payment_promises p
                   WHERE p.conversation_id = cc.conversation_id
                     AND p.deleted_at IS NULL
                     AND p.created_at >= cc.created_at
                ) AS got_promise,
                EXISTS (
                  SELECT 1
                    FROM contract_payments cp
                    JOIN contracts ct ON ct.id = cp.contract_id AND ct.deleted_at IS NULL
                   WHERE ct.client_id = cc.client_id
                     AND cp.date_paid IS NOT NULL
                     AND cp.date_paid BETWEEN cc.created_at::date AND (cc.created_at::date + 14)
                ) AS got_payment
           FROM conv_client cc
       ),
       conv_stats AS (
         SELECT style,
                count(*) AS convs,
                count(*) FILTER (WHERE got_promise) AS vada_n,
                count(*) FILTER (WHERE got_payment) AS tolov_n
           FROM conv_outcomes
          GROUP BY style
       )
       SELECT ms.style,
              ms.xabarlar,
              round(100.0 * ms.javob_3kun_n / NULLIF(ms.xabarlar, 0), 1) AS javob_3kun,
              round(100.0 * cs.vada_n / NULLIF(cs.convs, 0), 1)          AS vada_olingan,
              round(100.0 * cs.tolov_n / NULLIF(cs.convs, 0), 1)         AS tolov_14kun,
              round(ms.ortacha_soz, 1)                                  AS ortacha_soz,
              round(100.0 * ms.qisqa_n / NULLIF(ms.soz_n, 0), 1)         AS qisqa_ulush
         FROM msg_stats ms
         LEFT JOIN conv_stats cs ON cs.style = ms.style
        ORDER BY ms.style`,
      [from, to],
    );

    return rows.map((r) => ({
      styleVersion: r.style === 'v2' ? 'v2' : 'v1',
      xabarlar: Number(r.xabarlar),
      javob3Kun: Number(r.javob_3kun ?? 0),
      vadaOlingan: Number(r.vada_olingan ?? 0),
      tolov14Kun: Number(r.tolov_14kun ?? 0),
      ortachaSoz: Number(r.ortacha_soz ?? 0),
      qisqaUlush: Number(r.qisqa_ulush ?? 0),
    }));
  }
}
