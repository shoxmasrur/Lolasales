import type {
  Campaign,
  CampaignStats,
  CampaignStatus,
  CampaignTarget,
  CampaignTargetState,
} from '@/domain/entities/Campaign';
import type { ICampaignRepository, NewCampaign } from '@/domain/repositories/ICampaignRepository';
import type { Page, Pagination } from '@/domain/repositories/types';
import { query, withTransaction } from '@/infrastructure/db/pool';
import { mapCampaign, mapCampaignTarget } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

export class PgCampaignRepository implements ICampaignRepository {
  async create(data: NewCampaign): Promise<Campaign> {
    const { rows } = await query(
      `INSERT INTO campaigns (name, description, filters, daily_limit, window_start, window_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.name,
        data.description ?? null,
        JSON.stringify(data.filters ?? {}),
        data.dailyLimit,
        data.windowStart,
        data.windowEnd,
        data.createdBy ?? null,
      ],
    );
    return mapCampaign(rows[0]!);
  }

  async findById(id: string): Promise<Campaign | null> {
    const { rows } = await query('SELECT * FROM campaigns WHERE id = $1', [id]);
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  async list(pagination: Pagination = {}): Promise<Page<Campaign>> {
    const limit = Math.min(pagination.limit ?? 50, 200);
    const offset = pagination.offset ?? 0;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>('SELECT COUNT(*)::int AS count FROM campaigns'),
      query('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
    ]);
    return { items: rows.map(mapCampaign), total: countRows[0]?.count ?? 0, limit, offset };
  }

  async findRunning(): Promise<Campaign[]> {
    const { rows } = await query(`SELECT * FROM campaigns WHERE status = 'running' ORDER BY created_at ASC`);
    return rows.map(mapCampaign);
  }

  async setStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    const { rows } = await query(
      `UPDATE campaigns
          SET status = $2,
              started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
              completed_at = CASE WHEN $2 IN ('completed','cancelled') THEN now() ELSE completed_at END
        WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (!rows[0]) throw new NotFoundError('Kampaniya', id);
    return mapCampaign(rows[0]);
  }

  async addTargets(
    campaignId: string,
    clientIds: string[],
  ): Promise<number> {
    if (!clientIds.length) return 0;

    return withTransaction(async (client) => {
      let inserted = 0;
      // Katta ro'yxatlarni bo'lib yozamiz (parametr limiti 65535).
      const CHUNK = 500;
      for (let i = 0; i < clientIds.length; i += CHUNK) {
        const chunk = clientIds.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: unknown[] = [campaignId];
        chunk.forEach((clientId) => {
          params.push(clientId);
          values.push(`($1, $${params.length})`);
        });
        const res = await client.query(
          `INSERT INTO campaign_targets (campaign_id, client_id)
           VALUES ${values.join(', ')}
           -- Unique indeks qisman (faqat tirik nishonlar) — 032-migratsiya.
           ON CONFLICT (campaign_id, client_id) WHERE deleted_at IS NULL DO NOTHING`,
          params as never[],
        );
        inserted += res.rowCount ?? 0;
      }
      return inserted;
    });
  }

  async listTargets(campaignId: string, pagination: Pagination = {}): Promise<Page<CampaignTarget>> {
    const limit = Math.min(pagination.limit ?? 100, 500);
    const offset = pagination.offset ?? 0;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM campaign_targets
          WHERE campaign_id = $1 AND deleted_at IS NULL`,
        [campaignId],
      ),
      query(
        `SELECT * FROM campaign_targets WHERE campaign_id = $1 AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
        [campaignId, limit, offset],
      ),
    ]);
    return { items: rows.map(mapCampaignTarget), total: countRows[0]?.count ?? 0, limit, offset };
  }

  /**
   * Bir nechta worker parallel ishlashi mumkin — SKIP LOCKED bilan
   * bitta nishon ikki marta olinmaydi.
   */
  async claimNextTargets(campaignId: string, limit: number): Promise<CampaignTarget[]> {
    const { rows } = await query(
      `UPDATE campaign_targets t
          SET state = 'resolving'
        WHERE t.id IN (
          SELECT id FROM campaign_targets
           WHERE campaign_id = $1 AND state = 'pending' AND deleted_at IS NULL
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $2
        )
        RETURNING t.*`,
      [campaignId, limit],
    );
    return rows.map(mapCampaignTarget);
  }

  async updateTarget(
    id: string,
    patch: {
      state?: CampaignTargetState;
      skipReason?: string | null;
      lastError?: string | null;
      conversationId?: string | null;
      sentAt?: Date | null;
      incrementAttempts?: boolean;
    },
  ): Promise<CampaignTarget> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.state !== undefined) push('state', patch.state);
    if (patch.skipReason !== undefined) push('skip_reason', patch.skipReason);
    if (patch.lastError !== undefined) push('last_error', patch.lastError);
    if (patch.conversationId !== undefined) push('conversation_id', patch.conversationId);
    if (patch.sentAt !== undefined) push('sent_at', patch.sentAt);
    if (patch.incrementAttempts) sets.push('attempts = attempts + 1');

    if (!sets.length) {
      const { rows } = await query(
        'SELECT * FROM campaign_targets WHERE id = $1 AND deleted_at IS NULL',
        [id],
      );
      if (!rows[0]) throw new NotFoundError('Kampaniya nishoni', id);
      return mapCampaignTarget(rows[0]);
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE campaign_targets SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Kampaniya nishoni', id);
    return mapCampaignTarget(rows[0]);
  }

  async stats(campaignId: string): Promise<CampaignStats> {
    const { rows } = await query<{ state: string; count: number }>(
      `SELECT state, COUNT(*)::int AS count FROM campaign_targets
        WHERE campaign_id = $1 AND deleted_at IS NULL GROUP BY state`,
      [campaignId],
    );
    const by = Object.fromEntries(rows.map((r) => [r.state, r.count]));
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      total,
      pending: (by.pending ?? 0) + (by.resolving ?? 0) + (by.ready ?? 0) + (by.sending ?? 0),
      sent: by.sent ?? 0,
      skipped: by.skipped ?? 0,
      failed: by.failed ?? 0,
    };
  }

  async countSentToday(campaignId: string, todayIso: string): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM campaign_targets
        WHERE campaign_id = $1 AND state = 'sent' AND sent_at::date = $2::date
          AND deleted_at IS NULL`,
      [campaignId, todayIso],
    );
    return rows[0]?.count ?? 0;
  }
}
