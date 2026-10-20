import type { ImportBatch } from '@/domain/entities/ImportBatch';
import type { ImportKind } from '@/domain/entities/ImportBatch';
import type {
  AuditEntry,
  DashboardStats,
  IAuditRepository,
  IImportBatchRepository,
  ImportBatchResult,
  ImportUndoSummary,
  ISettingsRepository,
  IStatsRepository,
  NewImportBatch,
} from '@/domain/repositories/ISupportRepositories';
import type { Page, Pagination } from '@/domain/repositories/types';
import { query, withTransaction, type Sql } from '@/infrastructure/db/pool';
import { mapImportBatch, toDate } from '@/infrastructure/db/mappers';
import { NotFoundError, ValidationError } from '@/shared/errors';

export class PgImportBatchRepository implements IImportBatchRepository {
  /**
   * Import boshlanishida bo'sh yozuv — id qatorlarga yoziladi.
   * Import yarim yo'lda uzilib qolsa ham yozuv qoladi va nima
   * yaratilgani ko'rinib turadi (sonlar nol bo'lsa ham).
   */
  async start(data: { filename: string; kind: ImportKind; createdBy?: string | null }): Promise<ImportBatch> {
    const { rows } = await query(
      `INSERT INTO import_batches (filename, kind, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [data.filename, data.kind, data.createdBy ?? null],
    );
    return mapImportBatch(rows[0]!);
  }

  async finalize(id: string, data: ImportBatchResult): Promise<ImportBatch> {
    const { rows } = await query(
      `UPDATE import_batches
          SET rows_total = $2, rows_ok = $3, rows_failed = $4,
              clients_created = $5, errors = $6
        WHERE id = $1 RETURNING *`,
      [
        id, data.rowsTotal, data.rowsOk, data.rowsFailed, data.clientsCreated,
        JSON.stringify(data.errors.slice(0, 500)),
      ],
    );
    if (!rows[0]) throw new NotFoundError('Import', id);
    return mapImportBatch(rows[0]);
  }

  /** Qaytarish nechta TIRIK qatorga tegishini sanaydi (o'chirmaydi). */
  async undoPreview(id: string): Promise<Pick<ImportUndoSummary, 'clients'>> {
    const { rows } = await query<{ clients: string }>(
      `SELECT COUNT(*) AS clients FROM clients
        WHERE created_import_batch_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return { clients: Number(rows[0]?.clients ?? 0) };
  }

  /**
   * Importni qaytarish.
   *
   * Faqat SHU import YARATGAN mijozlar (va ularning suhbatlari, xabarlari)
   * belgilanadi. Import yangilagan, ilgari mavjud mijozlarga tegilmaydi.
   *
   * Hamma narsa bitta tranzaksiyada va `now()` bilan belgilanadi:
   * tranzaksiya ichida `now()` o'zgarmaydi, shuning uchun mijoz,
   * suhbat, xabar va `import_batches.undone_at` — hammasida
   * AYNAN bir xil vaqt turadi. `restore` o'sha vaqt bo'yicha aynan shu
   * partiyani topib qaytaradi va boshqa sabab bilan o'chirilgan
   * yozuvlarni tirgizib yubormaydi.
   */
  async undo(id: string, actor: string): Promise<ImportUndoSummary> {
    return withTransaction(async (tx) => {
      const batch = await query<{ undone_at: Date | null }>(
        'SELECT undone_at FROM import_batches WHERE id = $1',
        [id],
        tx,
      );
      if (!batch.rows[0]) throw new NotFoundError('Import', id);
      if (batch.rows[0].undone_at) throw new ValidationError('Bu import allaqachon qaytarilgan');

      // Mijozning o'zi bilan birga hamma narsasi ketadi.
      const clients = await this.rowCount(
        tx,
        `UPDATE clients SET deleted_at = now(), deleted_by = $2
          WHERE created_import_batch_id = $1 AND deleted_at IS NULL`,
        [id, actor],
      );

      const child = (table: string): string =>
        `UPDATE ${table} SET deleted_at = now()
          WHERE deleted_at IS NULL
            AND client_id IN (SELECT id FROM clients
                               WHERE created_import_batch_id = $1 AND deleted_at = now())`;

      const messages = await this.rowCount(
        tx,
        `UPDATE messages m SET deleted_at = now()
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND m.deleted_at IS NULL
            AND cv.client_id IN (SELECT id FROM clients
                                  WHERE created_import_batch_id = $1 AND deleted_at = now())`,
        [id],
      );
      const conversations = await this.rowCount(tx, child('conversations'), [id]);
      const campaignTargets = await this.rowCount(tx, child('campaign_targets'), [id]);
      const profiles = await this.rowCount(tx, child('client_profiles'), [id]);

      await query(
        'UPDATE import_batches SET undone_at = now(), undone_by = $2 WHERE id = $1',
        [id, actor],
        tx,
      );

      return { clients, conversations, messages, campaignTargets, profiles };
    });
  }

  async restore(id: string): Promise<ImportUndoSummary> {
    return withTransaction(async (tx) => {
      const batch = await query<{ undone_at: Date | null }>(
        'SELECT undone_at FROM import_batches WHERE id = $1',
        [id],
        tx,
      );
      if (!batch.rows[0]) throw new NotFoundError('Import', id);
      if (!batch.rows[0].undone_at) throw new ValidationError('Bu import qaytarilmagan');

      // Vaqt taqqoslash bazaning o'zida — JS Date orqali o'tkazilsa
      // mikrosoniyalar kesilib, hech bir qator topilmasdi.
      const AT = '(SELECT undone_at FROM import_batches WHERE id = $1)';

      const messages = await this.rowCount(
        tx,
        `UPDATE messages m SET deleted_at = NULL
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND m.deleted_at = ${AT}`,
        [id],
      );

      const child = (table: string): string =>
        `UPDATE ${table} SET deleted_at = NULL
          WHERE deleted_at = ${AT}
            AND client_id IN (SELECT id FROM clients WHERE created_import_batch_id = $1)`;

      const conversations = await this.rowCount(tx, child('conversations'), [id]);
      const campaignTargets = await this.rowCount(tx, child('campaign_targets'), [id]);
      const profiles = await this.rowCount(tx, child('client_profiles'), [id]);
      const clients = await this.rowCount(
        tx,
        `UPDATE clients SET deleted_at = NULL, deleted_by = NULL
          WHERE created_import_batch_id = $1 AND deleted_at = ${AT}`,
        [id],
      );

      await query('UPDATE import_batches SET undone_at = NULL, undone_by = NULL WHERE id = $1', [id], tx);

      return { clients, conversations, messages, campaignTargets, profiles };
    });
  }

  private async rowCount(tx: Sql, sql: string, params: unknown[]): Promise<number> {
    const { rowCount } = await query(sql, params, tx);
    return rowCount ?? 0;
  }

  async create(data: NewImportBatch): Promise<ImportBatch> {
    const { rows } = await query(
      `INSERT INTO import_batches
         (filename, kind, rows_total, rows_ok, rows_failed, clients_created, errors, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        data.filename, data.kind, data.rowsTotal, data.rowsOk, data.rowsFailed, data.clientsCreated,
        JSON.stringify(data.errors.slice(0, 500)), data.createdBy ?? null,
      ],
    );
    return mapImportBatch(rows[0]!);
  }

  async list(pagination: Pagination = {}): Promise<Page<ImportBatch>> {
    const limit = Math.min(pagination.limit ?? 20, 100);
    const offset = pagination.offset ?? 0;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>('SELECT COUNT(*)::int AS count FROM import_batches'),
      query('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
    ]);
    return { items: rows.map(mapImportBatch), total: countRows[0]?.count ?? 0, limit, offset };
  }

  async findById(id: string): Promise<ImportBatch | null> {
    const { rows } = await query('SELECT * FROM import_batches WHERE id = $1', [id]);
    return rows[0] ? mapImportBatch(rows[0]) : null;
  }
}

export class PgSettingsRepository implements ISettingsRepository {
  async get<T = unknown>(key: string): Promise<T | null> {
    const { rows } = await query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: unknown, updatedBy?: string | null): Promise<void> {
    await query(
      `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                                       updated_by = EXCLUDED.updated_by,
                                       updated_at = now()`,
      [key, JSON.stringify(value), updatedBy ?? null],
    );
  }

  async all(): Promise<Record<string, unknown>> {
    const { rows } = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

export class PgAuditRepository implements IAuditRepository {
  async record(entry: AuditEntry): Promise<void> {
    await query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, payload) VALUES ($1,$2,$3,$4,$5)`,
      [entry.actor, entry.action, entry.entity ?? null, entry.entityId ?? null, JSON.stringify(entry.payload ?? {})],
    );
  }

  async list(q: Pagination & { entity?: string; entityId?: string }): Promise<Page<AuditEntry & { createdAt: Date }>> {
    const where: string[] = ['TRUE'];
    const params: unknown[] = [];
    if (q.entity) {
      params.push(q.entity);
      where.push(`entity = $${params.length}`);
    }
    if (q.entityId) {
      params.push(q.entityId);
      where.push(`entity_id = $${params.length}`);
    }
    const limit = Math.min(q.limit ?? 100, 500);
    const offset = q.offset ?? 0;
    const base = `FROM audit_log WHERE ${where.join(' AND ')}`;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(`SELECT * ${base} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    ]);
    return {
      items: rows.map((r) => ({
        actor: r.actor,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        payload: r.payload,
        createdAt: toDate(r.created_at) ?? new Date(0),
      })),
      total: countRows[0]?.count ?? 0,
      limit,
      offset,
    };
  }
}

/**
 * Sotuv paneli: voronka, bugungi mijozlar manbalar bo'yicha, bugun
 * tasdiqlangan to'lovlar va navbatdagi cheklar. "Bugun" — `todayIso`
 * (loyiha vaqt mintaqasi, `config.TIMEZONE`) bo'yicha.
 */
export class PgStatsRepository implements IStatsRepository {
  async dashboard(todayIso: string, timeZone: string): Promise<DashboardStats> {
    // Kun chegarasi mahalliy vaqtda: `created_at` (timestamptz) shu zonada sanaga keltiriladi.
    const bugun = (col: string): string => `(${col} AT TIME ZONE $2)::date = $1::date`;
    const p = [todayIso, timeZone];

    const [totals, funnel, sources, payments, daily] = await Promise.all([
      query<Record<string, number>>(
        `SELECT
           (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL)::int AS clients_total,
           (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL AND telegram_user_id IS NOT NULL)::int AS clients_on_telegram,
           (SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL)::int AS conversations_total,
           (SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND needs_human)::int AS conversations_needing_human,
           (SELECT COUNT(*) FROM messages
             WHERE deleted_at IS NULL AND direction = 'out' AND status IN ('sent', 'delivered', 'read')
               AND ${bugun('created_at')})::int AS messages_sent_today,
           (SELECT COUNT(*) FROM messages
             WHERE deleted_at IS NULL AND direction = 'in' AND ${bugun('created_at')})::int AS messages_received_today,
           (SELECT COUNT(*) FROM payment_checks pc
              JOIN conversations cv ON cv.id = pc.conversation_id AND cv.deleted_at IS NULL
             WHERE pc.status = 'reviewing')::int AS receipts_pending`,
        p,
      ),
      // Har bir mijozning joriy xaridi (faol, bo'lmasa oxirgisi) — `kampaniyaSharti` bilan bir xil qoida.
      query<{ stage: string; count: number }>(
        `SELECT cp.stage, COUNT(*)::int AS count
           FROM (
             SELECT DISTINCT ON (pu.client_id) pu.stage
               FROM purchases pu
               JOIN clients c ON c.id = pu.client_id AND c.deleted_at IS NULL
              ORDER BY pu.client_id, (pu.stage NOT IN ('toladi', 'rad_etdi')) DESC, pu.created_at DESC, pu.id
           ) cp
          GROUP BY cp.stage`,
      ),
      query<{ source: string; count: number }>(
        `SELECT source, COUNT(*)::int AS count
           FROM clients
          WHERE deleted_at IS NULL AND ${bugun('created_at')}
          GROUP BY source`,
        p,
      ),
      query<{ count: number; amount: string }>(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(confirmed_amount), 0) AS amount
           FROM payment_checks
          WHERE status = 'confirmed_by_operator' AND confirmed_at IS NOT NULL
            AND ${bugun('confirmed_at')}`,
        p,
      ),
      // Oxirgi 14 kun: nechta mijozga yozildi va nechtasi javob berdi (odam soni).
      query<{ day: string; written_to: number; replied: number }>(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COUNT(DISTINCT cv.client_id) FILTER (WHERE m.direction = 'out')::int AS written_to,
                COUNT(DISTINCT cv.client_id) FILTER (WHERE m.direction = 'in')::int AS replied
           FROM generate_series($1::date - 13, $1::date, interval '1 day') AS d(day)
           LEFT JOIN messages m
             ON (m.created_at AT TIME ZONE $2)::date = d.day::date
            AND m.deleted_at IS NULL AND m.direction IN ('in', 'out')
           LEFT JOIN conversations cv ON cv.id = m.conversation_id
          GROUP BY d.day
          ORDER BY d.day`,
        p,
      ),
    ]);

    const t = totals.rows[0] ?? {};
    return {
      clientsTotal: Number(t.clients_total ?? 0),
      clientsOnTelegram: Number(t.clients_on_telegram ?? 0),
      conversationsTotal: Number(t.conversations_total ?? 0),
      conversationsNeedingHuman: Number(t.conversations_needing_human ?? 0),
      messagesSentToday: Number(t.messages_sent_today ?? 0),
      messagesReceivedToday: Number(t.messages_received_today ?? 0),
      receiptsPending: Number(t.receipts_pending ?? 0),
      funnel: funnel.rows.map((r) => ({ stage: r.stage, count: r.count })),
      newClientsToday: sources.rows.map((r) => ({ source: r.source, count: r.count })),
      paymentsToday: {
        count: Number(payments.rows[0]?.count ?? 0),
        amount: Number(payments.rows[0]?.amount ?? 0),
      },
      dailyActivity: daily.rows.map((r) => ({ day: r.day, writtenTo: r.written_to, replied: r.replied })),
    };
  }
}
