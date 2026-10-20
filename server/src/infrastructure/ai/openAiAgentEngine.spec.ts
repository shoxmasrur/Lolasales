import { OpenAiAgentEngine } from '@/infrastructure/ai/OpenAiAgentEngine';
import type { AgentTurnInput } from '@/domain/services/IAgentEngine';
import { KALIT_YAROQSIZ_XABARI } from '@/shared/providerXatosi';

/** Qo'lda ishga tushiriladi: npm run test:openai-engine --workspace=server */
let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual); const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a} (kutilgan ${k})`); }
}

const JAVOB = {
  choices: [{ message: { content: JSON.stringify({ reply: 'Hop, rahmat', internal_note: '' }) } }],
  usage: { prompt_tokens: 1200, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 200 } },
};

// `AgentTurnInput` ning to'liq shakli — sotuv konteksti bilan.
const kirish: AgentTurnInput = {
  conversationId: 'c1',
  clientId: 'cl1',
  knowledge: { rules: 'QOIDA', lessons: '', clientMemory: '', personaName: 'Lola', companyName: 'LolaSales' },
  context: {
    clientName: 'Sinov Mijoz',
    clientFirstName: 'Sinov',
    source: 'reklama',
    sourceGroup: null,
    sourceComment: null,
    purchase: null,
    coursesOnSale: [],
    nextCourse: null,
    boughtCourses: [],
  },
  history: [],
  incoming: null,
  sessionId: null,
  signal: undefined,
  receiptPending: false,
};

let sorov: { url: string; init: RequestInit } | null = null;
const aslFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init: RequestInit) => {
  sorov = { url: String(url), init };
  return { ok: true, status: 200, json: async () => JAVOB } as unknown as Response;
}) as typeof fetch;

try {
  const engine = new OpenAiAgentEngine({
    apiKey: 'sinov-kalit', model: 'sinov-model', baseUrl: 'https://sinov.local/v1',
  });
  const out = await engine.respond(kirish);

  eq('manzil konstruktordan', sorov!.url, 'https://sinov.local/v1/chat/completions');
  const body = JSON.parse(String(sorov!.init.body));
  eq('model konstruktordan', body.model, 'sinov-model');
  eq('kalit sarlavhada', (sorov!.init.headers as Record<string, string>).authorization, 'Bearer sinov-kalit');
  eq('javob matni', out.reply, 'Hop, rahmat');
  eq('usage.model', out.usage?.model, 'sinov-model');
  // Keshdan o'qilgani kiruvchidan ayiriladi — ikkala provayder hisobi bir
  // xil ma'noda bo'lishi uchun.
  eq('inputTokens', out.usage?.inputTokens, 1000);
  eq('cacheReadTokens', out.usage?.cacheReadTokens, 200);
  // Narx bu yerda hisoblanmaydi — u `llm_models` dagi tarifdan chiqadi.
  eq('costUsd 0', out.usage?.costUsd, 0);
} finally {
  globalThis.fetch = aslFetch;
}

// ── Topilma 1: 401 xato matni kalit bo'lagini olib chiqmasin ───────────
// `OpenAiAgentEngine.run()` xato matnini MANBADA tozalaydi
// (`providerXatosiniTozala`), shuning uchun bu yerdan otiladigan xato
// hech qachon `sk-` bilan boshlanadigan qatorni o'z ichiga olmasligi
// kerak — jurnal (`AgentRunner.navbat()` dagi `log.warn`) va panel shu
// otilgan matnni ko'radi.
{
  const aslFetch2 = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => 'Incorrect API key provided: sk-abc123XYZ999. You can find your API key at…',
  })) as unknown as typeof fetch;

  try {
    const engine = new OpenAiAgentEngine({
      apiKey: 'sinov-kalit', model: 'sinov-model', baseUrl: 'https://sinov.local/v1',
    });
    try {
      await engine.respond(kirish);
      failed += 1;
      console.log('✗ 401 da xato otilishi kerak edi');
    } catch (err) {
      const matn = err instanceof Error ? err.message : String(err);
      eq('401 xabari umumiy', matn, KALIT_YAROQSIZ_XABARI);
      eq('401 xabarida sk- yo\'q', /sk-[A-Za-z0-9_-]{4,}/.test(matn), false);
    }
  } finally {
    globalThis.fetch = aslFetch2;
  }
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
