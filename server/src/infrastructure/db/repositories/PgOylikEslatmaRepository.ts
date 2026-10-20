import { OCHIQ_VADA_HOLATLARI } from '@/domain/entities/PaymentPromise';
import { YOZILADIGAN_SQL_QIYMATLARI } from '@/domain/entities/shartnomaHolati';
import type {
  IOylikEslatmaRepository,
  OylikEslatmaNomzodi,
  OylikEslatmaYozuvi,
  QatorKaliti,
} from '@/domain/repositories/IOylikEslatmaRepository';
import { query } from '@/infrastructure/db/pool';
import { CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ } from '@/infrastructure/db/repositories/chekSukutFiltri';
import { config } from '@/shared/config';

export class PgOylikEslatmaRepository implements IOylikEslatmaRepository {
  /**
   * Mijozning bir nechta suhbati bo'lishi mumkin (har akkauntga bittadan) —
   * eng oxirgi yozilgani olinadi (`LATERAL ... LIMIT 1`). Filtrlar shu
   * suhbatga qo'yiladi; `c` taxallusi `CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ`
   * uchun shart.
   */
  async nomzodlar(danIso: string, gachaIso: string, limit: number): Promise<OylikEslatmaNomzodi[]> {
    const { rows } = await query<{
      conversation_id: string; client_id: string; contract_id: string; date_payment: string;
    }>(
      `SELECT c.id AS conversation_id, ct.client_id, cp.contract_id, cp.date_payment::text AS date_payment
         FROM contract_payments cp
         JOIN contracts ct ON ct.id = cp.contract_id AND ct.deleted_at IS NULL
         JOIN clients cl ON cl.id = ct.client_id AND cl.deleted_at IS NULL
         JOIN LATERAL (
           SELECT * FROM conversations x
            WHERE x.client_id = ct.client_id AND x.deleted_at IS NULL
            ORDER BY x.last_outbound_at DESC NULLS LAST
            LIMIT 1
         ) c ON TRUE
        WHERE cp.type = 'monthly'
          AND cp.status <> 'paid'
          AND cp.amount > cp.amount_paid
          AND cp.date_payment BETWEEN $1::date AND $2::date
          AND TRIM(ct.virtual_status) = ANY($3::text[])
          AND c.state NOT IN ('new', 'closed', 'escalated', 'refused')
          AND c.last_outbound_at IS NOT NULL
          AND c.agent_enabled
          AND NOT c.needs_human
          AND NOT cl.do_not_contact
          AND cl.telegram_status NOT IN ('blocked', 'deactivated')
          AND NOT EXISTS (
            SELECT 1 FROM payment_promises p
             WHERE p.conversation_id = c.id
               AND p.status = ANY($4::text[])
               AND p.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM oylik_eslatmalar oe
             WHERE oe.contract_id = cp.contract_id AND oe.date_payment = cp.date_payment
          )${CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ}
        ORDER BY cp.date_payment ASC
        LIMIT $5`,
      [danIso, gachaIso, YOZILADIGAN_SQL_QIYMATLARI, OCHIQ_VADA_HOLATLARI, limit],
    );
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      clientId: r.client_id,
      contractId: r.contract_id,
      datePayment: String(r.date_payment).slice(0, 10),
    }));
  }

  async yoz(yozuvlar: OylikEslatmaYozuvi[]): Promise<number> {
    if (!yozuvlar.length) return 0;
    const { rowCount } = await query(
      `INSERT INTO oylik_eslatmalar (contract_id, date_payment, client_id, guruh, holat, sabab)
       SELECT * FROM UNNEST($1::uuid[], $2::date[], $3::uuid[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (contract_id, date_payment) DO NOTHING`,
      [
        yozuvlar.map((y) => y.contractId),
        yozuvlar.map((y) => y.datePayment),
        yozuvlar.map((y) => y.clientId),
        yozuvlar.map((y) => y.guruh),
        yozuvlar.map((y) => y.holat),
        yozuvlar.map((y) => y.sabab),
      ],
    );
    return rowCount ?? 0;
  }

  async holatniOzgartir(kalitlar: QatorKaliti[], holat: 'sent' | 'skipped', sabab: string | null): Promise<void> {
    if (!kalitlar.length) return;
    await query(
      `UPDATE oylik_eslatmalar oe SET holat = $3, sabab = $4
         FROM UNNEST($1::uuid[], $2::date[]) AS k(contract_id, date_payment)
        WHERE oe.contract_id = k.contract_id AND oe.date_payment = k.date_payment`,
      [kalitlar.map((k) => k.contractId), kalitlar.map((k) => k.datePayment), holat, sabab],
    );
  }

  async ochir(kalitlar: QatorKaliti[]): Promise<void> {
    if (!kalitlar.length) return;
    await query(
      `DELETE FROM oylik_eslatmalar oe
        USING UNNEST($1::uuid[], $2::date[]) AS k(contract_id, date_payment)
        WHERE oe.contract_id = k.contract_id AND oe.date_payment = k.date_payment`,
      [kalitlar.map((k) => k.contractId), kalitlar.map((k) => k.datePayment)],
    );
  }

  async bugunYuborilgan(todayIso: string): Promise<number> {
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM oylik_eslatmalar
        WHERE holat = 'sent' AND (created_at AT TIME ZONE $2)::date = $1::date`,
      [todayIso, config.TIMEZONE],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
