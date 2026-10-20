import type { NewPaymentCheck, NewReceiptReview, PaymentCheck } from '@/domain/entities/PaymentCheck';
import type {
  IPaymentCheckRepository,
  PaymentCheckResult,
} from '@/domain/repositories/IPaymentCheckRepository';
import { query } from '@/infrastructure/db/pool';
import { mapPaymentCheck } from '@/infrastructure/db/mappers';

/** Ochiq tekshiruv holatlari — `payment_checks_one_open_idx` bilan bir xil. */
const OCHIQ = `status IN ('watching', 'reviewing')`;

const CRM_INSERT = `INSERT INTO payment_checks
         (conversation_id, client_id, contract_id, message_id, since_date, baseline_paid, watch_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`;

const CHEK_INSERT = `INSERT INTO payment_checks
         (conversation_id, client_id, message_id, kind, status, receipt_source, since_date, baseline_paid)
       VALUES ($1, $2, $3, 'receipt_review', 'reviewing', $4, $5, 0)`;

export class PgPaymentCheckRepository implements IPaymentCheckRepository {
  async open(data: NewPaymentCheck): Promise<PaymentCheck> {
    const params = [
      data.conversationId,
      data.clientId,
      data.contractId,
      data.messageId,
      data.sinceIso,
      data.baselinePaid,
      data.watchUntil,
    ];
    return this.insertOrExisting(CRM_INSERT, params, data.conversationId);
  }

  async openReceiptReview(data: NewReceiptReview): Promise<PaymentCheck> {
    const params = [data.conversationId, data.clientId, data.messageId, data.receiptSource, data.sinceIso];
    return this.insertOrExisting(CHEK_INSERT, params, data.conversationId);
  }

  /**
   * Qisman unique indeks (`status IN ('watching','reviewing')`) ikkinchi
   * ochiq qatorni o'tkazmaydi. `DO NOTHING` bo'sh natija qaytaradi,
   * shuning uchun mavjudini o'qib beramiz — chaqiruvchi uchun farqi yo'q.
   */
  private async insertOrExisting(insert: string, params: unknown[], conversationId: string): Promise<PaymentCheck> {
    const { rows } = await query(`${insert} ON CONFLICT DO NOTHING RETURNING *`, params);
    if (rows[0]) return mapPaymentCheck(rows[0]);

    const existing = await this.findOpenByConversation(conversationId);
    if (existing) return existing;

    // Poyga: qator qo'shilmadi, lekin ochig'i ham topilmadi — boshqa
    // jarayon shu orada yopib ulgurgan. Qayta urinamiz.
    const { rows: retry } = await query(`${insert} RETURNING *`, params);
    return mapPaymentCheck(retry[0]!);
  }

  async raiseReceiptSource(id: string): Promise<void> {
    await query(
      `UPDATE payment_checks SET receipt_source = 'tolov', updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id],
    );
  }

  async findOpenByConversation(conversationId: string): Promise<PaymentCheck | null> {
    const { rows } = await query(
      `SELECT * FROM payment_checks
        WHERE conversation_id = $1 AND ${OCHIQ} LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? mapPaymentCheck(rows[0]) : null;
  }

  async findDue(limit: number): Promise<PaymentCheck[]> {
    // Hech qachon tekshirilmaganlari birinchi (NULLS FIRST) — mijoz
    // "to'ladim" degan zahoti javob olishi kerak. Chek tekshiruvi bu
    // yerga tushmaydi: uni CRM emas, operator yopadi.
    const { rows } = await query(
      `SELECT * FROM payment_checks
        WHERE kind = 'crm_watch' AND status = 'watching'
        ORDER BY checked_at ASC NULLS FIRST
        LIMIT $1`,
      [limit],
    );
    return rows.map(mapPaymentCheck);
  }

  async touch(id: string, checkedAt: Date): Promise<void> {
    await query(
      `UPDATE payment_checks SET checked_at = $2, updated_at = now() WHERE id = $1`,
      [id, checkedAt],
    );
  }

  async close(id: string, result: PaymentCheckResult): Promise<void> {
    await query(
      `UPDATE payment_checks
          SET status = $2, found_amount = $3, found_type = $4,
              checked_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'watching'`,
      [id, result.status, result.foundAmount, result.foundType],
    );
  }

  async markAcknowledged(id: string, at: Date): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE payment_checks SET acknowledged_at = COALESCE(acknowledged_at, $2), updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async markThanksSent(conversationId: string, at: Date): Promise<void> {
    await query(
      `UPDATE payment_checks SET thanks_sent_at = COALESCE(thanks_sent_at, $2), updated_at = now()
        WHERE conversation_id = $1 AND status = 'reviewing'`,
      [conversationId, at],
    );
  }

  async confirmByOperator(id: string, actor: string, at: Date): Promise<boolean> {
    // Holat sharti ikki marta bosishdan himoya: ikkinchi so'rov hech qanday
    // qatorni o'zgartirmaydi va rahmat ikkinchi marta ketmaydi.
    const { rowCount } = await query(
      `UPDATE payment_checks
          SET status = 'confirmed_by_operator', confirmed_by = $2, confirmed_at = $3, updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id, actor, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async findOperatorConfirmedSince(conversationId: string, since: Date): Promise<PaymentCheck | null> {
    const { rows } = await query(
      `SELECT * FROM payment_checks
        WHERE conversation_id = $1 AND status = 'confirmed_by_operator' AND confirmed_at >= $2
        ORDER BY confirmed_at DESC
        LIMIT 1`,
      [conversationId, since],
    );
    return rows[0] ? mapPaymentCheck(rows[0]) : null;
  }

  async cancel(conversationId: string): Promise<void> {
    await query(
      `UPDATE payment_checks SET status = 'cancelled', updated_at = now()
        WHERE conversation_id = $1 AND ${OCHIQ}`,
      [conversationId],
    );
  }
}
