import type {
  IContractPaymentRepository,
  RecentPayment,
  SchedulePayment,
  SumPaidSinceParams,
  UnpaidMonth,
} from '@/domain/repositories/IContractPaymentRepository';
import type { TolovHodisasi } from '@/domain/services/vadaTolovi';
import { query } from '@/infrastructure/db/pool';

export class PgContractPaymentRepository implements IContractPaymentRepository {
  /**
   * `is_problematic` to'lovlar HISOBGA OLINMAYDI: ular buxgalteriyada
   * bahsli deb belgilangan. Mijozga "to'lovingiz ko'rindi, rahmat" deb
   * yozib, keyin uni qaytarib olish — eng yomon ssenariy.
   */
  async sumPaidSince({ clientId, contractId, sinceIso }: SumPaidSinceParams): Promise<number> {
    const { rows } = await query<{ total: number }>(
      `SELECT COALESCE(SUM(e.amount), 0)::numeric AS total
         FROM contract_payment_events e
         JOIN contracts c ON c.id = e.contract_id
        WHERE c.client_id = $1
          AND ($2::uuid IS NULL OR e.contract_id = $2::uuid)
          AND e.date_paid >= $3::date
          AND e.is_problematic = FALSE
          AND c.deleted_at IS NULL`,
      [clientId, contractId, sinceIso],
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Aynan `sumPaidSince` oynasi, lekin qatorlar bilan: qaysi kunga
   * yozilgani va BIZ QACHON bilganimiz (`created_at`) ham kerak — CRM
   * to'lovga mijoz to'lagan kunni qo'yadi, bizga esa u keyinroq ko'rinadi.
   */
  async listPaidSince({ clientId, contractId, sinceIso }: SumPaidSinceParams): Promise<TolovHodisasi[]> {
    const { rows } = await query<{ date_paid: string; amount: string; created_at: Date }>(
      `SELECT e.date_paid, e.amount, e.created_at
         FROM contract_payment_events e
         JOIN contracts c ON c.id = e.contract_id
        WHERE c.client_id = $1
          AND ($2::uuid IS NULL OR e.contract_id = $2::uuid)
          AND e.date_paid >= $3::date
          AND e.is_problematic = FALSE
          AND c.deleted_at IS NULL
        ORDER BY e.date_paid`,
      [clientId, contractId, sinceIso],
    );
    return rows.map((r) => ({
      datePaidIso: String(r.date_paid).slice(0, 10),
      amount: Number(r.amount),
      discoveredAt: new Date(r.created_at),
    }));
  }

  /**
   * Kechikish SANANI solishtirib aniqlanadi.
   *
   * Shartnomalar bazasidagi `is_expired` bayrog'iga tayanib bo'lmaydi:
   * real ma'lumotda muddati o'tgan va to'lanmagan qatorlarda ham u
   * `false` turadi.
   */
  async findUnpaidMonths(contractId: string, todayIso: string, limit: number): Promise<UnpaidMonth[]> {
    const { rows } = await query<{ date_payment: string; amount: number; amount_paid: number }>(
      `SELECT date_payment, amount, amount_paid
         FROM contract_payments
        WHERE contract_id = $1
          AND date_payment < $2::date
          AND status <> 'paid'
          AND amount > amount_paid
          -- Hisoblagich to'lovi "to'lanmagan oy" emas — agentga alohida qatorda boradi.
          AND type <> 'meter'
        ORDER BY date_payment ASC
        LIMIT $3`,
      [contractId, todayIso, limit],
    );
    return rows.map((r) => ({
      dateIso: String(r.date_payment),
      amount: Number(r.amount),
      paid: Number(r.amount_paid),
    }));
  }

  /**
   * `is_problematic` to'lovlar chiqarilmaydi: agent ularni "keldi" deb
   * aytsa, buxgalteriya bahsni hal qilgach mijozga qarama-qarshi gap
   * aytishga to'g'ri kelardi.
   */
  async listRecentPayments(contractId: string, limit: number): Promise<RecentPayment[]> {
    const { rows } = await query<{ date_paid: string; amount: number; payment_type: string | null }>(
      `SELECT date_paid, amount, payment_type
         FROM contract_payment_events
        WHERE contract_id = $1 AND is_problematic = FALSE
        ORDER BY date_paid DESC
        LIMIT $2`,
      [contractId, limit],
    );
    return rows.map((r) => ({
      dateIso: String(r.date_paid),
      amount: Number(r.amount),
      paymentType: r.payment_type ?? null,
    }));
  }

  async listSchedule(contractId: string): Promise<SchedulePayment[]> {
    const { rows } = await query<{
      date_payment: string; amount: number; amount_paid: number; status: string; type: string;
    }>(
      `SELECT date_payment, amount, amount_paid, status, type
         FROM contract_payments WHERE contract_id = $1 ORDER BY date_payment ASC`,
      [contractId],
    );
    return rows.map((r) => ({
      dateIso: String(r.date_payment),
      amount: Number(r.amount),
      paid: Number(r.amount_paid),
      status: r.status,
      type: r.type,
    }));
  }
}
