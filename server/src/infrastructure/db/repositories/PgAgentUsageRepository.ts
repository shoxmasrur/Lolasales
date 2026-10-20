import type {
  AgentUsageByDay,
  AgentUsageByMode,
  AgentUsageEntry,
  AgentUsageSummary,
  AgentUsageTotals,
  IAgentUsageRepository,
} from '@/domain/repositories/IAgentUsageRepository';
import { query } from '@/infrastructure/db/pool';

type Row = Record<string, any>;

const BOSH: AgentUsageTotals = {
  calls: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  avgDurationMs: 0,
};

/** Jamlanma ustunlari — uch xil kesimda bir xil, shuning uchun bitta joyda. */
const JAMI_SQL = `
  COUNT(*)::int                          AS calls,
  COALESCE(SUM(cost_usd), 0)             AS cost_usd,
  COALESCE(SUM(input_tokens), 0)::int    AS input_tokens,
  COALESCE(SUM(output_tokens), 0)::int   AS output_tokens,
  COALESCE(SUM(cache_read_tokens), 0)::int  AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0)::int AS cache_write_tokens,
  COALESCE(AVG(duration_ms), 0)::int      AS avg_duration_ms
`;

function mapTotals(r: Row | undefined): AgentUsageTotals {
  if (!r) return BOSH;
  return {
    calls: Number(r.calls ?? 0),
    costUsd: Number(r.cost_usd ?? 0),
    inputTokens: Number(r.input_tokens ?? 0),
    outputTokens: Number(r.output_tokens ?? 0),
    cacheReadTokens: Number(r.cache_read_tokens ?? 0),
    cacheWriteTokens: Number(r.cache_write_tokens ?? 0),
    avgDurationMs: Number(r.avg_duration_ms ?? 0),
  };
}

export class PgAgentUsageRepository implements IAgentUsageRepository {
  async record(e: AgentUsageEntry): Promise<void> {
    await query(
      `INSERT INTO agent_usage
         (conversation_id, mode, model, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, cost_usd, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.conversationId,
        e.mode,
        e.model,
        e.inputTokens,
        e.outputTokens,
        e.cacheReadTokens,
        e.cacheWriteTokens,
        e.costUsd,
        e.durationMs,
      ],
    );
  }

  async summary(from: string, to: string): Promise<AgentUsageSummary> {
    // Davr chegarasi kun bo'yicha: `to` ning O'ZI ham kiradi, shuning
    // uchun `< to + 1 kun`. `BETWEEN` ishlatilsa, so'nggi kunning
    // yarim tunidan keyingi barcha chaqiruvlar hisobdan tushib qolardi.
    const davr = `created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`;
    const params = [from, to];

    const [jami, rejim, kun, birinchi] = await Promise.all([
      query(`SELECT ${JAMI_SQL} FROM agent_usage WHERE ${davr}`, params),
      query(
        `SELECT mode, ${JAMI_SQL} FROM agent_usage WHERE ${davr}
         GROUP BY mode ORDER BY SUM(cost_usd) DESC`,
        params,
      ),
      query(
        `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS calls,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM agent_usage WHERE ${davr}
         GROUP BY 1 ORDER BY 1`,
        params,
      ),
      // Davrdan qat'i nazar — o'lchov umuman qachon boshlangani.
      query(`SELECT MIN(created_at) AS at FROM agent_usage`),
    ]);

    const byMode: AgentUsageByMode[] = rejim.rows.map((r: Row) => ({
      mode: String(r.mode),
      ...mapTotals(r),
    }));

    const byDay: AgentUsageByDay[] = kun.rows.map((r: Row) => ({
      day: String(r.day),
      calls: Number(r.calls ?? 0),
      costUsd: Number(r.cost_usd ?? 0),
    }));

    const since = birinchi.rows[0]?.at ? new Date(String(birinchi.rows[0].at)) : null;

    return { from, to, since, totals: mapTotals(jami.rows[0]), byMode, byDay };
  }
}
