import type {
  BulkJobKind,
  BulkJobRow,
  BulkJobStatus,
  IBulkJobRepository,
} from '@/domain/repositories/IBulkJobRepository';
import { query } from '@/infrastructure/db/pool';
import { ConflictError } from '@/shared/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function mapRow(r: Row): BulkJobRow {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    input: r.input,
    plan: r.plan ?? null,
    snapshot: r.snapshot,
    processedIds: Array.isArray(r.processed_ids) ? r.processed_ids.map(String) : [],
    cleanStop: Boolean(r.clean_stop),
    crashResumes: Number(r.crash_resumes),
    resumedCount: Number(r.resumed_count),
    // DATE ustuni satr bo'lib keladi (`pool.ts` da 1082 tipi uchun parser).
    startedDay: String(r.started_day).slice(0, 10),
  };
}

/** PostgreSQL: unique_violation. */
const UNIQUE_VIOLATION = '23505';

export class PgBulkJobRepository implements IBulkJobRepository {
  async insert(row: {
    id: string; kind: BulkJobKind; input: unknown; snapshot: unknown; startedDay: string;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO bulk_jobs (id, kind, status, input, snapshot, started_day)
         VALUES ($1, $2, 'running', $3::jsonb, $4::jsonb, $5::date)`,
        [row.id, row.kind, JSON.stringify(row.input), JSON.stringify(row.snapshot), row.startedDay],
      );
    } catch (err) {
      // `bulk_jobs_one_running`: shu turda vazifa ketyapti yoki tiklanishni kutyapti.
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictError(
          'Oldingi vazifa hali yopilmagan yoki server yangilangach tiklanmoqda — bir daqiqadan keyin urinib ko\'ring',
        );
      }
      throw err;
    }
  }

  async savePlan(id: string, plan: unknown): Promise<void> {
    await query('UPDATE bulk_jobs SET plan = $2::jsonb, updated_at = now() WHERE id = $1', [
      id,
      JSON.stringify(plan),
    ]);
  }

  async save(id: string, snapshot: unknown, processedId: string | null): Promise<void> {
    await query(
      `UPDATE bulk_jobs
          SET snapshot      = $2::jsonb,
              processed_ids = CASE WHEN $3::text IS NULL THEN processed_ids
                                   ELSE processed_ids || to_jsonb($3::text) END,
              crash_resumes = CASE WHEN $3::text IS NULL THEN crash_resumes ELSE 0 END,
              updated_at    = now()
        WHERE id = $1 AND status = 'running'`,
      [id, JSON.stringify(snapshot), processedId],
    );
  }

  async finish(
    id: string,
    status: BulkJobStatus,
    snapshot: unknown,
    opts: { onlyIfRunning?: boolean } = {},
  ): Promise<void> {
    // `onlyIfRunning` — yetim qatorni yopish uchun: shu oraliqda o'z egasi
    // yozgan yakuniy holat (masalan `done`) `failed` bilan bosib ketilmasin.
    await query(
      `UPDATE bulk_jobs SET status = $2, snapshot = $3::jsonb, updated_at = now()
        WHERE id = $1${opts.onlyIfRunning ? " AND status = 'running'" : ''}`,
      [id, status, JSON.stringify(snapshot)],
    );
  }

  async findRunning(kind: BulkJobKind): Promise<BulkJobRow | null> {
    const { rows } = await query(
      `SELECT * FROM bulk_jobs WHERE kind = $1 AND status = 'running' LIMIT 1`,
      [kind],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markCleanStop(): Promise<void> {
    await query(`UPDATE bulk_jobs SET clean_stop = TRUE, updated_at = now() WHERE status = 'running'`);
  }

  async markResumed(id: string, crashed: boolean): Promise<void> {
    await query(
      `UPDATE bulk_jobs
          SET clean_stop    = FALSE,
              resumed_count = resumed_count + 1,
              crash_resumes = crash_resumes + $2::int,
              updated_at    = now()
        WHERE id = $1`,
      [id, crashed ? 1 : 0],
    );
  }

  async deleteFinishedOlderThan(days: number): Promise<number> {
    const { rowCount } = await query(
      `DELETE FROM bulk_jobs
        WHERE status <> 'running' AND updated_at < now() - make_interval(days => $1::int)`,
      [days],
    );
    return rowCount ?? 0;
  }
}
