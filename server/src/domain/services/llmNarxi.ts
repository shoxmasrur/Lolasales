import type { LlmModel } from '@/domain/entities/LlmModel';

export interface TokenHisobi {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
}

const MLN = 1_000_000;

/**
 * Bitta chaqiruvning narxi (USD).
 *
 * Keshdan o'qilgan tokenlar kiruvchi tarifida hisoblanadi: ular odatda
 * arzonroq, lekin chegirma model bo'yicha har xil. Kam baholashdan ko'ra
 * ko'p baholash xavfsizroq — xarajat kutilganidan oshib ketmaydi.
 *
 * Narx kiritilmagan bo'lsa 0 qaytadi: tokenlar `agent_usage` ga baribir
 * yoziladi, keyin narx kiritilganda qayta hisoblash mumkin.
 */
export function hisoblaNarx(usage: TokenHisobi, model: LlmModel): number {
  const kirish = ((usage.inputTokens + usage.cacheReadTokens) / MLN) * (model.inputPricePerMtok ?? 0);
  const chiqish = (usage.outputTokens / MLN) * (model.outputPricePerMtok ?? 0);
  return kirish + chiqish;
}
