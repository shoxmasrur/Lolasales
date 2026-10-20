import { llmTamgasi } from '@/application/services/llmTamgasi';

/** Qo'lda ishga tushiriladi: npm run test:llm-tamgasi --workspace=server */
let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual); const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a} (kutilgan ${k})`); }
}

eq('oddiy holat', llmTamgasi({ model: true }, { provider: 'openai', model: 'gpt-x' }, false),
  { model: true, llmProvider: 'openai', llmModel: 'gpt-x' });

eq('bo\'sh meta', llmTamgasi(undefined, { provider: 'claude', model: 'claude-sonnet-5' }, false),
  { llmProvider: 'claude', llmModel: 'claude-sonnet-5' });

// Qaytish bo'lganda HAQIQATAN ishlatilgan model yoziladi va belgi qo'yiladi —
// aks holda hisobot «OpenAI yozdi» deb yolg'on ko'rsatadi.
eq('qaytish belgilanadi', llmTamgasi({}, { provider: 'claude', model: 'claude-sonnet-5' }, true),
  { llmProvider: 'claude', llmModel: 'claude-sonnet-5', llmFallback: true });

// Tamg'a bir marta qo'yiladi — uslub tamg'asi bilan bir xil qoida.
eq('mavjud tamg\'a ustidan yozilmaydi',
  llmTamgasi({ llmProvider: 'openai', llmModel: 'eski' }, { provider: 'claude', model: 'yangi' }, false),
  { llmProvider: 'openai', llmModel: 'eski' });

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
