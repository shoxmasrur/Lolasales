import { query } from '@/infrastructure/db/pool';
import type { ReceiptDetails } from '@/domain/services/IImageClassifier';

/** Hamyoncha bo'yicha hali hal bo'lmagan chek. */
export interface HamyonChek {
  readonly id: string;
  readonly conversationId: string;
  readonly clientId: string;
  readonly purchaseId: string | null;
  readonly createdAt: Date;
  /** Chek rasmidan o'qilgan ma'lumot; `null` — o'qilmagan (vision ishlamagan yoki chek emas). */
  readonly receiptInfo: ReceiptDetails | null;
}

/** Hamyoncha tushumlarini cheklarga biriktirish (`hamyoncha_tushumlar`, `payment_checks`). */
export class PgHamyonRepository {
  /** Ochiq, to'lov cheki deb tanilgan va Hamyoncha bo'yicha hali hal bo'lmagan cheklar. */
  async kutayotganCheklar(): Promise<HamyonChek[]> {
    const { rows } = await query(
      `SELECT id, conversation_id, client_id, purchase_id, created_at, receipt_info
         FROM payment_checks
        WHERE status = 'reviewing' AND receipt_source = 'tolov' AND hamyon_holati IS NULL
        ORDER BY created_at`,
    );
    return rows.map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      clientId: r.client_id as string,
      purchaseId: (r.purchase_id as string | null) ?? null,
      createdAt: r.created_at as Date,
      receiptInfo: (r.receipt_info as ReceiptDetails | null) ?? null,
    }));
  }

  /** Chekdan o'qilgan summa, vaqt va karta oxirgi 4 raqamini tekshiruvga yozadi. */
  async chekMalumotiniSaqla(checkId: string, info: ReceiptDetails): Promise<void> {
    await query(`UPDATE payment_checks SET receipt_info = $2::jsonb, updated_at = now() WHERE id = $1`, [
      checkId,
      JSON.stringify(info),
    ]);
  }

  /** Berilganlar orasidan allaqachon biriktirilgan tushum id'lari. */
  async bandIdlar(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const { rows } = await query(`SELECT tx_id FROM hamyoncha_tushumlar WHERE tx_id = ANY($1::text[])`, [ids]);
    return new Set(rows.map((r) => r.tx_id as string));
  }

  /** Tushumni chekka biriktiradi. `false` — u allaqachon boshqa chekka biriktirilgan. */
  async egalla(txId: string, checkId: string, amount: number, date: Date): Promise<boolean> {
    const { rowCount } = await query(
      `INSERT INTO hamyoncha_tushumlar (tx_id, check_id, amount, tx_date)
       VALUES ($1, $2, $3, $4) ON CONFLICT (tx_id) DO NOTHING`,
      [txId, checkId, amount, date],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Biriktirishni bekor qiladi (chek boshqa yo'l bilan yopilgan bo'lsa). */
  async bosh(txId: string): Promise<void> {
    await query(`DELETE FROM hamyoncha_tushumlar WHERE tx_id = $1`, [txId]);
  }

  async holat(checkId: string, holat: 'mos' | 'shubha', sabab: string | null): Promise<void> {
    await query(
      `UPDATE payment_checks SET hamyon_holati = $2, hamyon_sabab = $3, updated_at = now() WHERE id = $1`,
      [checkId, holat, sabab],
    );
  }
}
