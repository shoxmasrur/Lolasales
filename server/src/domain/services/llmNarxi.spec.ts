import { hisoblaNarx } from '@/domain/services/llmNarxi';
import type { LlmModel } from '@/domain/entities/LlmModel';

/** Qo'lda ishga tushiriladi: npm run test:llm-narxi --workspace=server */
const model = (patch: Partial<LlmModel> = {}): LlmModel => ({
  id: 'm1', provider: 'openai', model: 'sinov-model', label: 'Sinov',
  inputPricePerMtok: 2, outputPricePerMtok: 8, isEnabled: true, ...patch,
});

const usage = (patch: Partial<{ inputTokens: number; outputTokens: number; cacheReadTokens: number }> = {}) => ({
  inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, ...patch,
});

let failed = 0;
function eq(nom: string, actual: number, kutilgan: number): void {
  if (Math.abs(actual - kutilgan) < 1e-9) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${actual} (kutilgan ${kutilgan})`); }
}

eq('1 mln kirish tokeni', hisoblaNarx(usage(), model()), 2);
eq('1 mln chiqish tokeni', hisoblaNarx(usage({ inputTokens: 0, outputTokens: 1_000_000 }), model()), 8);
eq('yarim million', hisoblaNarx(usage({ inputTokens: 500_000 }), model()), 1);
// Keshdan o'qilgan tokenlar kiruvchi tarifida hisoblanadi: OpenAI ularni
// arzonroq sotadi, lekin tarifi model bo'yicha har xil — ustama qo'yib
// taxmin qilishdan ko'ra to'liq narxda hisoblagan ma'qul (kam baholashdan
// ko'ra ko'p baholash xavfsizroq).
eq('kesh tokeni ham kiruvchi tarifida', hisoblaNarx(usage({ inputTokens: 0, cacheReadTokens: 1_000_000 }), model()), 2);
// Narx kiritilmagan model — tokenlar yoziladi, pul hisoblanmaydi.
eq('narxsiz model → 0', hisoblaNarx(usage(), model({ inputPricePerMtok: null, outputPricePerMtok: null })), 0);
eq('faqat kirish narxi bor', hisoblaNarx(usage({ outputTokens: 1_000_000 }), model({ outputPricePerMtok: null })), 2);
eq('bo\'sh foydalanish', hisoblaNarx(usage({ inputTokens: 0 }), model()), 0);

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
