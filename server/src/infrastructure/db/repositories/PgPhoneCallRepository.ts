import type { PhoneCall } from '@/domain/entities/PhoneCall';
import type {
  AgentHisobotQatori,
  IPhoneCallRepository,
  PhoneCallUpsert,
} from '@/domain/repositories/IPhoneCallRepository';
import { query } from '@/infrastructure/db/pool';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const sonYokiNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function mapPhoneCall(r: Row): PhoneCall {
  return {
    id: r.id,
    externalId: r.external_id,
    clientId: r.client_id,
    contractId: r.contract_id ?? null,
    agentKey: r.agent_key,
    agentName: r.agent_name,
    phone: r.phone ?? null,
    startedAt: new Date(r.started_at),
    durationSec: Number(r.duration_sec),
    outcome: r.outcome,
    summary: r.summary ?? null,
    transcript: r.transcript ?? null,
    // DATE ustuni satr bo'lib keladi (`pool.ts` da 1082 tipi uchun parser).
    promiseDate: r.promise_date ? String(r.promise_date).slice(0, 10) : null,
    promiseAmount: sonYokiNull(r.promise_amount),
    promiseId: r.promise_id ?? null,
    createdByUserId: r.created_by_user_id,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export class PgPhoneCallRepository implements IPhoneCallRepository {
  async findByExternal(createdByUserId: string, externalId: string): Promise<PhoneCall | null> {
    const { rows } = await query(
      'SELECT * FROM phone_calls WHERE created_by_user_id = $1 AND external_id = $2',
      [createdByUserId, externalId],
    );
    return rows[0] ? mapPhoneCall(rows[0]) : null;
  }

  async upsert(d: PhoneCallUpsert): Promise<PhoneCall> {
    const { rows } = await query(
      `INSERT INTO phone_calls
         (external_id, client_id, contract_id, agent_key, agent_name, phone, started_at, duration_sec,
          outcome, summary, transcript, promise_date, promise_amount, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14)
       ON CONFLICT (created_by_user_id, external_id) DO UPDATE SET
         client_id = EXCLUDED.client_id, contract_id = EXCLUDED.contract_id,
         agent_key = EXCLUDED.agent_key, agent_name = EXCLUDED.agent_name, phone = EXCLUDED.phone,
         started_at = EXCLUDED.started_at, duration_sec = EXCLUDED.duration_sec,
         outcome = EXCLUDED.outcome, summary = EXCLUDED.summary, transcript = EXCLUDED.transcript,
         promise_date = EXCLUDED.promise_date, promise_amount = EXCLUDED.promise_amount,
         updated_at = now()
       RETURNING *`,
      [d.externalId, d.clientId, d.contractId, d.agentKey, d.agentName, d.phone, d.startedAt, d.durationSec,
        d.outcome, d.summary, d.transcript, d.promiseDate, d.promiseAmount, d.createdByUserId],
    );
    return mapPhoneCall(rows[0]!);
  }

  async setPromiseId(id: string, promiseId: string | null): Promise<void> {
    await query('UPDATE phone_calls SET promise_id = $2, updated_at = now() WHERE id = $1', [id, promiseId]);
  }

  async listRecentForClient(clientId: string, limit: number, since?: Date): Promise<PhoneCall[]> {
    const { rows } = await query(
      `SELECT * FROM phone_calls
        WHERE client_id = $1 AND ($3::timestamptz IS NULL OR started_at >= $3)
        ORDER BY started_at DESC LIMIT $2`,
      [clientId, limit, since ?? null],
    );
    return rows.map(mapPhoneCall);
  }

  async agentlarHisoboti(from: string, to: string, timeZone: string): Promise<AgentHisobotQatori[]> {
    const { rows } = await query(
      `SELECT pc.agent_key,
              (array_agg(pc.agent_name ORDER BY pc.started_at DESC))[1] AS agent_name,
              COUNT(*)::int                                               AS qongiroqlar,
              COUNT(*) FILTER (WHERE pc.outcome = 'gaplashildi')::int     AS gaplashildi,
              COUNT(*) FILTER (WHERE pc.outcome = 'kotarmadi')::int       AS kotarmadi,
              COUNT(*) FILTER (WHERE pc.outcome = 'band')::int            AS band,
              COUNT(*) FILTER (WHERE pc.outcome = 'boshqa_odam')::int     AS boshqa_odam,
              COUNT(*) FILTER (WHERE pc.outcome = 'raqam_notogri')::int   AS raqam_notogri,
              COUNT(*) FILTER (WHERE pc.promise_date IS NOT NULL)::int    AS vadalar,
              COUNT(*) FILTER (WHERE pp.status = 'kept' AND pp.call_id = pc.id)::int             AS bajarilgan,
              COUNT(*) FILTER (WHERE pp.status = 'broken' AND pp.call_id = pc.id)::int           AS buzilgan,
              COALESCE(SUM(pc.duration_sec), 0)::int                      AS jami_soniya
         FROM phone_calls pc
         LEFT JOIN payment_promises pp ON pp.id = pc.promise_id
        WHERE pc.started_at >= ($1::date)::timestamp AT TIME ZONE $3
          AND pc.started_at <  ($2::date + 1)::timestamp AT TIME ZONE $3
        GROUP BY pc.agent_key
        ORDER BY qongiroqlar DESC, pc.agent_key`,
      [from, to, timeZone],
    );
    return rows.map((r) => ({
      agentKaliti: r.agent_key,
      agentIsmi: r.agent_name,
      qongiroqlar: Number(r.qongiroqlar),
      gaplashildi: Number(r.gaplashildi),
      kotarmadi: Number(r.kotarmadi),
      band: Number(r.band),
      boshqaOdam: Number(r.boshqa_odam),
      raqamNotogri: Number(r.raqam_notogri),
      vadalar: Number(r.vadalar),
      bajarilgan: Number(r.bajarilgan),
      buzilgan: Number(r.buzilgan),
      jamiSoniya: Number(r.jami_soniya),
    }));
  }

  async clearTranscriptsOlderThan(days: number): Promise<number> {
    const { rowCount } = await query(
      `UPDATE phone_calls SET transcript = NULL
        WHERE transcript IS NOT NULL AND started_at < now() - make_interval(days => $1::int)`,
      [days],
    );
    return rowCount ?? 0;
  }
}
