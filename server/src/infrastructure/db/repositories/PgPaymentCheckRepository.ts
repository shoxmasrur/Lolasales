import type { NewReceiptReview, PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { Purchase } from '@/domain/entities/Purchase';
import { query, withTransaction } from '@/infrastructure/db/pool';
import { mapPaymentCheck, mapPurchase } from '@/infrastructure/db/mappers';

/** Ochiq tekshiruv holati — `payment_checks_one_open_idx` ning bir qismi. */
const OCHIQ = `status = 'reviewing'`;

const CHEK_INSERT = `INSERT INTO payment_checks
         (conversation_id, client_id, purchase_id, message_id, kind, status, receipt_source, since_date, baseline_paid)
       VALUES ($1, $2, $3, $4, 'receipt_review', 'reviewing', $5, $6, 0)`;

export class PgPaymentCheckRepository implements IPaymentCheckRepository {
  /**
   * Qisman unique indeks ikkinchi ochiq qatorni o'tkazmaydi. `DO NOTHING`
   * bo'sh natija qaytaradi, shuning uchun mavjudini o'qib beramiz —
   * chaqiruvchi uchun farqi yo'q.
   */
  async openReceiptReview(data: NewReceiptReview): Promise<PaymentCheck> {
    const params = [data.conversationId, data.clientId, data.purchaseId, data.messageId, data.receiptSource, data.sinceIso];
    const { rows } = await query(`${CHEK_INSERT} ON CONFLICT DO NOTHING RETURNING *`, params);
    if (rows[0]) return mapPaymentCheck(rows[0]);

    const existing = await this.findOpenByConversation(data.conversationId);
    if (existing) return existing;

    // Poyga: qator qo'shilmadi, lekin ochig'i ham topilmadi — boshqa
    // jarayon shu orada yopib ulgurgan. Qayta urinamiz.
    const { rows: retry } = await query(`${CHEK_INSERT} RETURNING *`, params);
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

  async markAcknowledged(id: string, at: Date): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE payment_checks SET acknowledged_at = COALESCE(acknowledged_at, $2), updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async confirmByOperator(id: string, actor: string, amount: number, at: Date): Promise<boolean> {
    // Holat sharti ikki marta bosishdan himoya: ikkinchi so'rov hech qanday
    // qatorni o'zgartirmaydi — summa ikki marta qo'shilmaydi.
    const { rowCount } = await query(
      `UPDATE payment_checks
          SET status = 'confirmed_by_operator', confirmed_by = $2, confirmed_amount = $3,
              confirmed_at = $4, updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id, actor, amount, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async confirmWithPayment(id: string, actor: string, amount: number, purchaseId: string, at: Date): Promise<Purchase | null> {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE payment_checks
            SET status = 'confirmed_by_operator', confirmed_by = $2, confirmed_amount = $3,
                confirmed_at = $4, updated_at = now()
          WHERE id = $1 AND status = 'reviewing'`,
        [id, actor, amount, at],
      );
      if (!rowCount) return null;
      const { rows } = await client.query(
        `UPDATE purchases SET paid_amount = paid_amount + $2 WHERE id = $1 RETURNING *`,
        [purchaseId, amount],
      );
      // Xarid yo'q — tranzaksiya qaytariladi, chek ochiq qoladi.
      if (!rows[0]) throw new Error(`Xarid topilmadi: ${purchaseId}`);
      return mapPurchase(rows[0]);
    });
  }

  async reject(id: string, actor: string, reason: string, at: Date): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE payment_checks
          SET status = 'rejected', confirmed_by = $2, rejected_reason = $3,
              confirmed_at = $4, updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [id, actor, reason, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async cancel(conversationId: string): Promise<void> {
    await query(
      `UPDATE payment_checks SET status = 'cancelled', updated_at = now()
        WHERE conversation_id = $1 AND ${OCHIQ}`,
      [conversationId],
    );
  }
}
