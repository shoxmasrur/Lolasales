import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import {
  CHEK_TEKSHIRUVI_MUDDATI_KUNLAR,
  chekJavobiHolati,
  chekTekshiruviFaolmi,
  type PaymentCheck,
} from '@/domain/entities/PaymentCheck';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClock, IEventBus } from '@/domain/services/support';
import { CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ } from '@/infrastructure/db/repositories/chekSukutFiltri';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-sukut --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — bazaga ham,
 * Telegramga ham chiqmaydi).
 *
 * Chek operator tekshiruvida turganda mijozga sukut xabari ketmaydi.
 * Ikki qatlam: `findSilent` SQL filtri (asosiy) va `silenceNudge`
 * ichidagi tekshiruv (nomzod tanlangandan keyin chek kelgan poyga uchun).
 * `aniqlanmagan` tekshiruv sukutni TO'SMAYDI — operator eskalatsiyani
 * tugmasiz yechgan bo'lsa, rasm chek emas deb topilgan.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-09-17T06:00:00Z');

// ─── 1. SQL filtri ───────────────────────────────────────────────────────
{
  const sql = CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ.replace(/\s+/g, ' ');
  check('filtr NOT EXISTS', sql.includes('AND NOT EXISTS ( SELECT 1 FROM payment_checks pc'), sql);
  check('filtr suhbatga bog\'langan', sql.includes('pc.conversation_id = c.id'), sql);
  check(
    'filtr faqat ochiq tolov chekini chetlaydi',
    sql.includes("pc.status = 'reviewing'") && sql.includes("pc.receipt_source = 'tolov'"),
    sql,
  );
  // 2026-09-17 qarori: tugmasiz qolib ketgan tekshiruv 7 kundan keyin
  // sukutni to'smaydi — aks holda mijoz umrbod jim qolardi.
  check('muddat 7 kun', CHEK_TEKSHIRUVI_MUDDATI_KUNLAR === 7, String(CHEK_TEKSHIRUVI_MUDDATI_KUNLAR));
  check(
    'filtr faqat 7 kundan yosh tekshiruvni chetlaydi',
    sql.includes("pc.created_at > now() - interval '7 days'"),
    sql,
  );
}

// ─── 2. silenceNudge ichidagi zaxira ─────────────────────────────────────
const chek = (receiptSource: PaymentCheck['receiptSource'], createdAt = NOW): PaymentCheck => ({
  id: 'pc1',
  conversationId: 'cv1',
  clientId: 'c1',
  contractId: null,
  messageId: 'm1',
  kind: 'receipt_review',
  status: 'reviewing',
  receiptSource,
  sinceIso: '2026-09-15',
  baselinePaid: 0,
  foundAmount: null,
  foundType: null,
  watchUntil: null,
  checkedAt: null,
  acknowledgedAt: null,
  thanksSentAt: null,
  confirmedBy: null,
  confirmedAt: null,
  createdAt,
});

// ─── 1b. Tekshiruv muddati ───────────────────────────────────────────────
{
  const kun = 24 * 60 * 60 * 1000;
  const olti = new Date(NOW.getTime() - 6 * kun);
  const sakkiz = new Date(NOW.getTime() - 8 * kun);
  check('6 kunlik tolov cheki: new', chekJavobiHolati(chek('tolov', olti), NOW) === 'new');
  check('8 kunlik tolov cheki: null — agent odatdagidek', chekJavobiHolati(chek('tolov', sakkiz), NOW) === null);
  check('6 kunlik tekshiruv faol', chekTekshiruviFaolmi(chek('aniqlanmagan', olti), NOW));
  check('8 kunlik tekshiruv faol emas', !chekTekshiruviFaolmi(chek('aniqlanmagan', sakkiz), NOW));
}

const SUHBAT = {
  id: 'cv1',
  clientId: 'c1',
  telegramAccountId: null,
  state: 'contacted',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  createdAt: new Date('2026-08-14T06:00:00Z'),
} as unknown as Conversation;

const JAVOB: AgentTurnOutput = {
  reply: 'Assalomu alaykum, xabarimni ko\'rdingizmi?',
  replySecond: null,
  sessionId: null,
  promise: null,
  nextState: null,
  escalate: null,
  internalNote: null,
  lesson: null,
  clientMemory: null,
};

function build(openCheck: PaymentCheck | null) {
  let modelChaqiruvlari = 0;
  const yuborilgan: string[] = [];
  const engine = {
    composeSilenceNudge: async () => {
      modelChaqiruvlari += 1;
      return JAVOB;
    },
  } as unknown as IAgentEngine;

  // Akkaunt biriktirilmagan sinov — `forAccount` va `standart` bir xil
  // sinov dvigatelini qaytaradi (`AgentEngineFactory` yangi qatlami).
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const runner = new AgentRunner(
    engines,
    { findById: async () => ({ id: 'c1', fullName: 'Komiljonov Doniyorbek', firstName: 'Doniyorbek', telegramStatus: 'found' }) } as unknown as IClientRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    { findById: async () => SUHBAT, update: async () => SUHBAT } as unknown as IConversationRepository,
    { recentByConversation: async () => [], create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    {
      findActiveByConversation: async () => null,
      findLatestByConversation: async () => null,
    } as unknown as IPaymentPromiseRepository,
    { send: async ({ body }: { body: string }) => void yuborilgan.push(body) } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, personaName: 'Nodira', weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-09-17' } as unknown as IClock,
    { renderSections: async () => '', renderLessons: async () => '', renderClientMemory: async () => '' } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined, find: async () => null } as unknown as IClientProfileRepository,
    { findUnpaidMonths: async () => [], listRecentPayments: async () => [] } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => openCheck } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [] } as unknown as IHolidayRepository,
  );

  return { runner, yuborilgan, modelChaqiruvlari: () => modelChaqiruvlari };
}

{
  const m = build(chek('tolov'));
  const r = await m.runner.silenceNudge('cv1', 1, false);
  check('ochiq tolov cheki: yuborilmadi', r.sent === false && m.yuborilgan.length === 0, JSON.stringify(r));
  check('ochiq tolov cheki: model chaqirilmadi', m.modelChaqiruvlari() === 0, String(m.modelChaqiruvlari()));
}

{
  const m = build(chek('aniqlanmagan'));
  const r = await m.runner.silenceNudge('cv1', 1, false);
  check('aniqlanmagan + needs_human yo\'q: yuboriladi', r.sent === true && m.yuborilgan.length === 1, JSON.stringify(r));
}

{
  const m = build(chek('tolov', new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)));
  const r = await m.runner.silenceNudge('cv1', 1, false);
  check('7 kundan eski tolov cheki: sukut xabari ketadi', r.sent === true && m.yuborilgan.length === 1, JSON.stringify(r));
}

{
  const m = build(null);
  const r = await m.runner.silenceNudge('cv1', 1, false);
  check('tekshiruv yo\'q: odatdagidek yuboriladi', r.sent === true, JSON.stringify(r));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
