import { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { LlmModel } from '@/domain/entities/LlmModel';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';

/** Qo'lda ishga tushiriladi: npm run test:engine-factory --workspace=server */
let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual); const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a} (kutilgan ${k})`); }
}

const NOW = new Date('2026-09-29T09:00:00Z');
const model: LlmModel = {
  id: 'm1', provider: 'openai', model: 'sinov-model', label: 'Sinov',
  inputPricePerMtok: 2, outputPricePerMtok: 8, isEnabled: true,
};

function account(patch: Partial<TelegramAccount> = {}): TelegramAccount {
  return {
    id: 'a1', label: 'Sinov', personaName: null, phone: '+998901112233', apiId: 1, apiHash: '',
    session: null, status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
    dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: null,
    floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
    spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
    proxy: null, isEnabled: true, styleVersion: 'v1', llmModelId: null,
    createdAt: NOW, updatedAt: NOW, ...patch,
  };
}

function factory(o: { model?: LlmModel | null; key?: string | null } = {}) {
  const models = { findById: async () => o.model ?? null } as never;
  const kalit = { openAiKey: async () => o.key ?? null, baseUrl: async () => 'https://sinov.local/v1' } as never;
  return new AgentEngineFactory(models, kalit);
}

// Akkaunt yo'q yoki model biriktirilmagan — standart yo'l.
eq('akkauntsiz → claude', (await factory().forAccount(null)).provider, 'claude');
eq('llmModelId yo\'q → claude', (await factory().forAccount(account())).provider, 'claude');

// Model bor va kalit bor — OpenAI.
{
  const t = await factory({ model, key: 'k' }).forAccount(account({ llmModelId: 'm1' }));
  eq('model + kalit → openai', t.provider, 'openai');
  eq('model nomi', t.model, 'sinov-model');
  eq('narx uchun model qatori berildi', t.llmModel?.id, 'm1');
}

// Kalit yo'q — mijozga xabar ketmay qolmasin, standart yo'lga tushamiz.
eq('kalitsiz → claude', (await factory({ model, key: null }).forAccount(account({ llmModelId: 'm1' }))).provider, 'claude');

// Model o'chirilgan yoki topilmadi — standart yo'l.
eq('o\'chirilgan model → claude',
  (await factory({ model: { ...model, isEnabled: false }, key: 'k' }).forAccount(account({ llmModelId: 'm1' }))).provider, 'claude');
eq('topilmagan model → claude',
  (await factory({ model: null, key: 'k' }).forAccount(account({ llmModelId: 'yo\'q' }))).provider, 'claude');

// Jadvalda `claude` qatori bo'lsa ham (masalan 113-migratsiyadan oldingi
// eski qator) — yolg'on tanlov: ClaudeAgentEngine model nomini
// konstruktordan olmaydi, shuning uchun standart yo'lga tushamiz va narx
// hisobi uchun qator berilmaydi (`llmModel === null`). `LlmProvider` endi
// faqat `'openai'`ni ruxsat etadi, shuning uchun bu yerda ataylab
// kastlaymiz — real hayotda bunday qator CHECK cheklovi tufayli bazaga
// yozila olmaydi, lekin dvigatel shu holatga ham chidamli bo'lishi kerak.
{
  const claudeModel = { ...model, id: 'm2', provider: 'claude', model: 'claude-boshqa' } as unknown as LlmModel;
  const t = await factory({ model: claudeModel, key: 'k' }).forAccount(account({ llmModelId: 'm2' }));
  eq('jadvaldagi claude → standart provider', t.provider, 'claude');
  eq('jadvaldagi claude → llmModel null', t.llmModel, null);
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
