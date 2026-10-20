/** Agent qaysi sabab bilan chaqirilgani — narx shu bo'yicha bo'linadi. */
export type AgentUsageMode = 'first' | 'reply' | 'reminder' | 'thanks' | 'nudge' | 'operator' | 'oylik_eslatma';

/** Bitta model chaqiruvining hisobi. */
export interface AgentUsageEntry {
  readonly conversationId: string | null;
  readonly mode: AgentUsageMode;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly durationMs: number;
}

export interface AgentUsageTotals {
  readonly calls: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** O'rtacha davomiylik, ms. Chaqiruv bo'lmasa — 0. */
  readonly avgDurationMs: number;
}

export interface AgentUsageByMode extends AgentUsageTotals {
  readonly mode: string;
}

export interface AgentUsageByDay {
  readonly day: string; // YYYY-MM-DD
  readonly calls: number;
  readonly costUsd: number;
}

export interface AgentUsageSummary {
  readonly from: string;
  readonly to: string;
  /**
   * Umuman birinchi yozuv qachon paydo bo'lgani. Prognozni to'g'ri
   * hisoblash uchun kerak: o'lchov kecha boshlangan bo'lsa, "oyiga
   * shuncha" degan raqam bir kunlik ma'lumotga tayanadi va shuni
   * ochiq aytish kerak.
   */
  readonly since: Date | null;
  readonly totals: AgentUsageTotals;
  readonly byMode: readonly AgentUsageByMode[];
  readonly byDay: readonly AgentUsageByDay[];
}

export interface IAgentUsageRepository {
  record(entry: AgentUsageEntry): Promise<void>;
  /** Davr chegaralari — YYYY-MM-DD, ikkalasi ham kiritiladi. */
  summary(from: string, to: string): Promise<AgentUsageSummary>;
}
