/**
 * Agent ishlatadigan til modeli.
 *
 * Narx PANELDA kiritiladi, kodda emas: provayder tariflari tez-tez
 * o'zgaradi va kodga yozilgan raqam jimgina eskirib, hisobotni yolg'on
 * qilib qo'yadi. `null` narx — «hali kiritilmagan», tokenlar baribir
 * yoziladi.
 *
 * NEGA FAQAT `openai` (2026-09-29 ko'rik): `ClaudeAgentEngine` model
 * nomini konstruktordan OLMAYDI, u doim `.env` dagi `AGENT_MODEL`ni
 * ishlatadi. Jadvalga Claude qatorini qo'shish imkoni bo'lsa, operator
 * uni akkauntga biriktirib "modelni tanladim" deb o'ylardi-yu, dvigatel
 * baribir o'zgarmasdi — faqat narx TANLANGAN qatorning tarifidan
 * hisoblanib, hisobotni buzardi. Shu sabab Claude endi jadvaldan umuman
 * tanlanmaydi — u doim standart yo'l (`AgentEngineFactory.standart()`).
 */
export const LLM_PROVIDERS = ['openai'] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export interface LlmModel {
  readonly id: string;
  readonly provider: LlmProvider;
  /** Provayderdagi aniq nom — so'rovga aynan shu yuboriladi. */
  readonly model: string;
  /** Panelda ko'rinadigan nom. */
  readonly label: string;
  readonly inputPricePerMtok: number | null;
  readonly outputPricePerMtok: number | null;
  readonly isEnabled: boolean;
}

export interface NewLlmModel {
  provider: LlmProvider;
  model: string;
  label: string;
  inputPricePerMtok?: number | null;
  outputPricePerMtok?: number | null;
}
