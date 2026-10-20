import type {
  ContractSyncPatch,
  IContractSyncRepository,
  SyncableContract,
  SyncErrorRow,
} from '@/domain/repositories/IContractSyncRepository';
import type { ExternalPayment, ExternalPaymentEvent } from '@/domain/services/IContractGateway';
import { tolovKaliti, yetimKalitlar } from '@/domain/services/tolovKaliti';
import { query, withTransaction } from '@/infrastructure/db/pool';
import { toDate } from '@/infrastructure/db/mappers';

const SELECT_SYNCABLE = `
  SELECT c.id, c.client_id, c.contract_no, c.external_id, c.external_order_id
    FROM contracts c
    JOIN clients cl ON cl.id = c.client_id
   WHERE c.deleted_at IS NULL AND cl.deleted_at IS NULL
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapRow = (r: Record<string, any>): SyncableContract => ({
  id: String(r.id),
  clientId: String(r.client_id),
  contractNo: String(r.contract_no),
  externalId: r.external_id ?? null,
  externalOrderId: r.external_order_id ?? null,
});

export class PgContractSyncRepository implements IContractSyncRepository {
  async findSyncable(limit: number, offset: number): Promise<SyncableContract[]> {
    const { rows } = await query(
      `${SELECT_SYNCABLE} ORDER BY c.synced_at ASC NULLS FIRST, c.id LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(mapRow);
  }

  async countSyncable(): Promise<number> {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM contracts c
         JOIN clients cl ON cl.id = c.client_id
        WHERE c.deleted_at IS NULL AND cl.deleted_at IS NULL`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async getById(contractId: string): Promise<SyncableContract | null> {
    const { rows } = await query(`${SELECT_SYNCABLE} AND c.id = $1`, [contractId]);
    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  async getSyncedAt(contractId: string): Promise<Date | null> {
    const { rows } = await query<{ synced_at: unknown }>(
      'SELECT synced_at FROM contracts WHERE id = $1',
      [contractId],
    );
    const row = rows[0];
    return row ? toDate(row.synced_at) : null;
  }

  /**
   * `COALESCE` ishlatiladi: API biror maydonni bermasa, bazadagi
   * (Excel importidan kelgan) qiymat saqlanib qoladi. Kechikish raqamlari esa
   * har doim yangisi bilan almashtiriladi — ular hisoblangan va aynan
   * shu narsa uchun sinxronizatsiya qilinyapti.
   */
  async applySync(contractId: string, p: ContractSyncPatch): Promise<void> {
    await query(
      `UPDATE contracts SET
         external_order_id = $2,
         object_name       = COALESCE($3, object_name),
         status            = COALESCE($4, status),
         virtual_status    = COALESCE($5, virtual_status),
         contract_date     = COALESCE($6, contract_date),
         months            = COALESCE($7, months),
         total_price       = COALESCE($8, total_price),
         first_payment     = COALESCE($9, first_payment),
         monthly_payment   = COALESCE($10, monthly_payment),
         paid_total        = COALESCE($11, paid_total),
         remaining_total   = COALESCE($12, remaining_total),
         next_payment_date = $13,
         days_overdue      = $14,
         debt_first        = $15,
         debt_monthly      = $16,
         debt_total        = $17,
         apartment_number   = COALESCE($18, apartment_number),
         apartment_floor    = COALESCE($19, apartment_floor),
         apartment_rooms    = COALESCE($20, apartment_rooms),
         apartment_entrance = COALESCE($21, apartment_entrance),
         apartment_block    = COALESCE($22, apartment_block),
         apartment_area     = COALESCE($23, apartment_area),
         missed_months      = $24,
         completion_date    = COALESCE($25, completion_date),
         debt_meter         = $26,
         object_address     = COALESCE($27, object_address),
         company_inn        = COALESCE($28, company_inn),
         synced_at         = now(),
         sync_error        = NULL,
         updated_at        = now()
       WHERE id = $1`,
      [
        contractId,
        p.externalOrderId,
        p.objectName,
        p.status,
        p.virtualStatus,
        p.contractDate,
        p.months,
        p.totalPrice,
        p.firstPayment,
        p.monthlyPayment,
        p.paidTotal,
        p.remainingTotal,
        p.nextPaymentDate,
        p.daysOverdue,
        p.debtFirst,
        p.debtMonthly,
        p.debtTotal,
        p.apartment?.number ?? null,
        p.apartment?.floor ?? null,
        p.apartment?.rooms ?? null,
        p.apartment?.entrance ?? null,
        p.apartment?.block ?? null,
        p.apartment?.area ?? null,
        p.missedMonths,
        p.completionDate,
        p.debtMeter,
        p.objectAddress,
        p.companyInn,
      ],
    );
  }

  async markError(contractId: string, error: string): Promise<void> {
    await query('UPDATE contracts SET sync_error = $2, updated_at = now() WHERE id = $1', [
      contractId,
      error.slice(0, 500),
    ]);
  }

  async replaceSchedule(contractId: string, rows: readonly ExternalPayment[]): Promise<void> {
    await withTransaction(async (client) => {
      const keep = rows.map((r) => r.externalId);
      await client.query(
        'DELETE FROM contract_payments WHERE contract_id = $1 AND NOT (external_id = ANY($2::int[]))',
        [contractId, keep],
      );

      for (const r of rows) {
        await client.query(
          `INSERT INTO contract_payments
             (contract_id, external_id, type, amount, amount_paid, date_payment, date_paid, status, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
           ON CONFLICT (contract_id, external_id) DO UPDATE SET
             type         = EXCLUDED.type,
             amount       = EXCLUDED.amount,
             amount_paid  = EXCLUDED.amount_paid,
             date_payment = EXCLUDED.date_payment,
             date_paid    = EXCLUDED.date_paid,
             status       = EXCLUDED.status,
             updated_at   = now()`,
          [contractId, r.externalId, r.type, r.amount, r.amountPaid, r.datePayment, r.datePaid, r.status],
        );
      }
    });
  }

  /**
   * To'lov tarixini CRM ro'yxatiga tenglashtiradi.
   *
   * Kalit — `source_uuid` (`tolovKaliti`), `external_id` emas: ikkinchisi
   * bank ko'chirmasi kelganda almashadi va o'sha pul ikkinchi qator bo'lib
   * qo'shilib ketardi.
   *
   * Uch qadam, bittasi ham tushib qolmasligi kerak, shuning uchun bitta
   * tranzaksiyada:
   *
   *   1. BACKFILL — kalit ko'chgunga qadar yozilgan qatorni eski kaliti
   *      bo'yicha topib, `source_uuid` ni JOYIDA to'ldiramiz. Shu tufayli
   *      `created_at` ("qachon bilganimiz") saqlanadi — `PromiseWatcher`
   *      unga tayanadi.
   *   2. UPSERT — endi barqaror kalit bo'yicha.
   *   3. YETIMLARNI O'CHIRISH — kaliti almashib ulgurgan eski qatorlar
   *      CRM ro'yxatida yo'q; ular qolsa pul ikki marta sanaladi.
   */
  async upsertHistory(contractId: string, rows: readonly ExternalPaymentEvent[]): Promise<void> {
    await withTransaction(async (client) => {
      const kalitlar: string[] = [];

      for (const r of rows) {
        const kalit = tolovKaliti(r);
        // Kalitsiz yozuvni saqlash — uni har sinxronda qayta qo'shish
        // demak. Bunday javob hali uchramadi.
        if (!kalit) continue;
        kalitlar.push(kalit);

        // 1. Eski kalit bilan yotgan qatorni tanib olamiz. `external_id`
        //    hali almashmagan qatorlar (ko'pchilik) shu yerda mos keladi.
        await client.query(
          `UPDATE contract_payment_events
              SET source_uuid = $3
            WHERE contract_id = $1 AND external_id = $2 AND source_uuid IS NULL`,
          [contractId, r.externalId, kalit],
        );

        // 2. Endi kalit barqaror.
        await client.query(
          `INSERT INTO contract_payment_events
             (contract_id, source_uuid, external_id, amount, date_paid, payment_type, purpose, is_problematic)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           -- Indeks QISMAN, shuning uchun uning sharti bu yerda ham
           -- takrorlanadi: aks holda Postgres arbitr indeksni topa olmay
           -- "no unique or exclusion constraint" deb yiqiladi.
           ON CONFLICT (contract_id, source_uuid) WHERE source_uuid IS NOT NULL DO UPDATE SET
             external_id    = EXCLUDED.external_id,
             amount         = EXCLUDED.amount,
             date_paid      = EXCLUDED.date_paid,
             payment_type   = EXCLUDED.payment_type,
             purpose        = EXCLUDED.purpose,
             is_problematic = EXCLUDED.is_problematic`,
          [
            contractId,
            kalit,
            r.externalId,
            r.amount,
            r.datePaid,
            r.paymentType,
            r.purpose,
            r.isProblematic,
          ],
        );
      }

      // 3. Bazadagi qatorlar CRM ro'yxatidan oshib ketgan bo'lsa —
      //    o'chiramiz. `yetimKalitlar` bo'sh ro'yxatda hech narsa
      //    qaytarmaydi: API `payment_histories` ni bermay qo'ysa butun
      //    tarix o'chib ketmasligi kerak.
      const { rows: saqlangan } = await client.query<{ kalit: string }>(
        `SELECT coalesce(source_uuid, external_id) AS kalit
           FROM contract_payment_events WHERE contract_id = $1`,
        [contractId],
      );

      const yetim = yetimKalitlar(
        saqlangan.map((s) => s.kalit),
        kalitlar,
      );
      if (yetim.length) {
        await client.query(
          `DELETE FROM contract_payment_events
            WHERE contract_id = $1 AND coalesce(source_uuid, external_id) = ANY($2::text[])`,
          [contractId, yetim],
        );
      }
    });
  }

  async listSyncErrors(limit: number): Promise<SyncErrorRow[]> {
    const { rows } = await query<{
      id: string;
      contract_no: string;
      full_name: string;
      sync_error: string;
    }>(
      `SELECT c.id, c.contract_no, cl.full_name, c.sync_error
         FROM contracts c
         JOIN clients cl ON cl.id = c.client_id
        WHERE c.sync_error IS NOT NULL
          AND c.deleted_at IS NULL AND cl.deleted_at IS NULL
        ORDER BY c.updated_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      contractId: r.id,
      contractNo: r.contract_no,
      clientName: r.full_name,
      error: r.sync_error,
    }));
  }

  async countSynced(): Promise<{ total: number; synced: number; failed: number }> {
    const { rows } = await query<{ total: number; synced: number; failed: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE c.synced_at IS NOT NULL)::int AS synced,
              count(*) FILTER (WHERE c.sync_error IS NOT NULL)::int AS failed
         FROM contracts c
         JOIN clients cl ON cl.id = c.client_id
        WHERE c.deleted_at IS NULL AND cl.deleted_at IS NULL`,
    );
    return {
      total: Number(rows[0]?.total ?? 0),
      synced: Number(rows[0]?.synced ?? 0),
      failed: Number(rows[0]?.failed ?? 0),
    };
  }
}
