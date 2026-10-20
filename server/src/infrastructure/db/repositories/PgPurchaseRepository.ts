import { XARID_BOSQICHLARI, type Purchase, type XaridBosqichi } from '@/domain/entities/Purchase';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import { query } from '@/infrastructure/db/pool';
import { mapPurchase } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

const FAOL = `stage NOT IN ('toladi', 'rad_etdi')`;

export class PgPurchaseRepository implements IPurchaseRepository {
  async findActiveByClient(clientId: string): Promise<Purchase | null> {
    const { rows } = await query(`SELECT * FROM purchases WHERE client_id = $1 AND ${FAOL} LIMIT 1`, [clientId]);
    return rows[0] ? mapPurchase(rows[0]) : null;
  }

  async findLatestByClient(clientId: string): Promise<Purchase | null> {
    const { rows } = await query(
      `SELECT * FROM purchases WHERE client_id = $1 ORDER BY created_at DESC, id LIMIT 1`,
      [clientId],
    );
    return rows[0] ? mapPurchase(rows[0]) : null;
  }

  async findCurrentByClients(clientIds: string[]): Promise<Map<string, Purchase>> {
    const out = new Map<string, Purchase>();
    if (clientIds.length === 0) return out;
    // Faol xarid birinchi, bo'lmasa eng oxirgisi.
    const { rows } = await query(
      `SELECT DISTINCT ON (client_id) * FROM purchases
        WHERE client_id = ANY($1::uuid[])
        ORDER BY client_id, (${FAOL}) DESC, created_at DESC, id`,
      [clientIds],
    );
    for (const r of rows) out.set(r.client_id, mapPurchase(r));
    return out;
  }

  async create(data: { clientId: string; courseId: string | null; totalAmount: number | null }): Promise<Purchase> {
    const { rows } = await query(
      `INSERT INTO purchases (client_id, course_id, total_amount) VALUES ($1, $2, $3) RETURNING *`,
      [data.clientId, data.courseId, data.totalAmount],
    );
    return mapPurchase(rows[0]!);
  }

  async setStage(id: string, stage: XaridBosqichi): Promise<Purchase> {
    const { rows } = await query(
      `UPDATE purchases
          SET stage = $2,
              stage_changed_at = CASE WHEN stage = $2 THEN stage_changed_at ELSE now() END
        WHERE id = $1 RETURNING *`,
      [id, stage],
    );
    return this.must(rows[0], id);
  }

  async setCourse(id: string, courseId: string, totalAmount: number): Promise<Purchase> {
    const { rows } = await query(
      `UPDATE purchases SET course_id = $2, total_amount = $3 WHERE id = $1 RETURNING *`,
      [id, courseId, totalAmount],
    );
    return this.must(rows[0], id);
  }

  async setInstallment(id: string, installment: boolean): Promise<void> {
    await query(`UPDATE purchases SET installment = $2 WHERE id = $1`, [id, installment]);
  }

  async addPaid(id: string, amount: number): Promise<Purchase> {
    const { rows } = await query(
      `UPDATE purchases SET paid_amount = paid_amount + $2 WHERE id = $1 RETURNING *`,
      [id, amount],
    );
    return this.must(rows[0], id);
  }

  async markLinkSent(id: string, at: Date): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE purchases SET link_sent_at = $2 WHERE id = $1 AND link_sent_at IS NULL`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async addRemindedStage(id: string, stage: XaridBosqichi): Promise<void> {
    await query(
      `UPDATE purchases SET reminded_stages = array_append(reminded_stages, $2)
        WHERE id = $1 AND NOT ($2 = ANY(reminded_stages))`,
      [id, stage],
    );
  }

  async countByStage(): Promise<Record<XaridBosqichi, number>> {
    const out = Object.fromEntries(XARID_BOSQICHLARI.map((s) => [s, 0])) as Record<XaridBosqichi, number>;
    const { rows } = await query<{ stage: XaridBosqichi; n: number }>(
      `SELECT stage, COUNT(*)::int AS n FROM purchases GROUP BY stage`,
    );
    for (const r of rows) out[r.stage] = r.n;
    return out;
  }

  private must(row: Record<string, unknown> | undefined, id: string): Purchase {
    if (!row) throw new NotFoundError('Xarid', id);
    return mapPurchase(row);
  }
}
