import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import { RECEIPT_REVIEW_REASON, type PaymentCheck } from '@/domain/entities/PaymentCheck';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-javobi --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — Telegramga
 * ham, bazaga ham, modelga ham chiqmaydi).
 *
 * `tolov` chekiga agent BIR MARTA javob beradi, keyin suhbat operatorga
 * o'tadi (`human_kind = 'chek_tekshiruvi'`, `acknowledged_at`). Eskalatsiya
 * javobdan OLDIN qo'yilsa mijoz hech narsa olmasdi, umuman qo'yilmasa
 * operator chekni ko'rmasdi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-09-17T06:00:00Z');

const SUHBAT = {
  id: 'cv1',
  clientId: 'c1',
  telegramAccountId: null,
  state: 'negotiating',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  createdAt: new Date('2026-08-14T06:00:00Z'),
} as unknown as Conversation;

const JAVOB: AgentTurnOutput = {
  reply: 'Chekni oldim, rahmat. Hamkasbim tekshirib chiqadi, tasdiqlanishi bilan yozaman.',
  replySecond: null,
  sessionId: null,
  promise: null,
  nextState: null,
  escalate: null,
  internalNote: null,
  lesson: null,
  clientMemory: null,
};

const chek = (over: Partial<PaymentCheck> = {}): PaymentCheck => ({
  id: 'pc1',
  conversationId: 'cv1',
  clientId: 'c1',
  contractId: null,
  messageId: 'm1',
  kind: 'receipt_review',
  status: 'reviewing',
  receiptSource: 'tolov',
  sinceIso: '2026-09-17',
  baselinePaid: 0,
  foundAmount: null,
  foundType: null,
  watchUntil: null,
  checkedAt: null,
  acknowledgedAt: null,
  thanksSentAt: null,
  confirmedBy: null,
  confirmedAt: null,
  createdAt: NOW,
  ...over,
});

function build(opts: { openCheck: PaymentCheck | null; output?: AgentTurnOutput; engineFails?: boolean }) {
  const kirishlar: AgentTurnInput[] = [];
  const tasdiqlar: string[] = [];
  const patches: ConversationPatch[] = [];

  const engine = {
    respond: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      if (opts.engineFails) throw new Error('model javob bermadi');
      return opts.output ?? JAVOB;
    },
  } as unknown as IAgentEngine;

  // Akkaunt biriktirilmagan sinov — `forAccount` va `standart` bir xil
  // sinov dvigatelini qaytaradi (`AgentEngineFactory` yangi qatlami).
  // Provider `claude`: `navbat` xatoni qaytarib urinmaydi, xato avvalgidek
  // yuqoriga chiqadi (`engineFails` shuni tekshiradi).
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const runner = new AgentRunner(
    engines,
    { findById: async () => ({ id: 'c1', fullName: 'Komiljonov Doniyorbek', firstName: 'Doniyorbek', telegramStatus: 'found' }) } as unknown as IClientRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    {
      findById: async () => SUHBAT,
      update: async (_id: string, patch: ConversationPatch) => {
        patches.push(patch);
        return SUHBAT;
      },
    } as unknown as IConversationRepository,
    { recentByConversation: async () => [], create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
    { send: async () => undefined } as unknown as MessageDispatcher,
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
    {
      findOpenByConversation: async () => opts.openCheck,
      markAcknowledged: async (id: string) => {
        tasdiqlar.push(id);
        return true;
      },
    } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [] } as unknown as IHolidayRepository,
  );

  return { runner, kirishlar, tasdiqlar, patches };
}

const chekEskalatsiyasi = (patches: ConversationPatch[]): boolean =>
  patches.some(
    (p) => p.needsHuman === true && p.humanKind === 'chek_tekshiruvi' && p.humanReason === RECEIPT_REVIEW_REASON.tolov,
  );

// ─── 1. Birinchi javob — "Chekni oldim", keyin operator ──────────────────
{
  const m = build({ openCheck: chek() });
  const r = await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  check('yangi chek: agent receiptReview = new oladi', m.kirishlar[0]?.receiptReview === 'new', String(m.kirishlar[0]?.receiptReview));
  check('yangi chek: da\'vo qoidasi yo\'q', m.kirishlar[0]?.receiptPending === false);
  check('yangi chek: javob ketdi', r.sent === true);
  check('yangi chek: acknowledged_at yozildi', m.tasdiqlar.length === 1 && m.tasdiqlar[0] === 'pc1', JSON.stringify(m.tasdiqlar));
  check('yangi chek: javobdan keyin needs_human (chek_tekshiruvi)', chekEskalatsiyasi(m.patches), JSON.stringify(m.patches));
}

// ─── 2. Javob allaqachon berilgan — takror yo'q ──────────────────────────
{
  const m = build({ openCheck: chek({ acknowledgedAt: new Date('2026-09-17T05:00:00Z') }) });
  await m.runner.reply('cv1', 'qachon tekshirasizlar?');
  check('qabul qilingan: receiptReview = acknowledged', m.kirishlar[0]?.receiptReview === 'acknowledged');
  check('qabul qilingan: acknowledged_at qayta yozilmaydi', m.tasdiqlar.length === 0);
  check('qabul qilingan: qayta eskalatsiya yo\'q', !chekEskalatsiyasi(m.patches), JSON.stringify(m.patches));
}

// ─── 3. aniqlanmagan — agent chek haqida bilmaydi ────────────────────────
{
  const m = build({ openCheck: chek({ receiptSource: 'aniqlanmagan' }) });
  await m.runner.reply('cv1', 'salom');
  check('aniqlanmagan: receiptReview null', m.kirishlar[0]?.receiptReview === null, String(m.kirishlar[0]?.receiptReview));
  check('aniqlanmagan: receiptPending yolg\'on', m.kirishlar[0]?.receiptPending === false);
  check('aniqlanmagan: eskalatsiya yo\'q', !chekEskalatsiyasi(m.patches));
}

// ─── 4. Da'vo kuzatuvi — eski qoida ──────────────────────────────────────
{
  const m = build({ openCheck: chek({ kind: 'crm_watch', status: 'watching', receiptSource: null, watchUntil: NOW }) });
  await m.runner.reply('cv1', 'to\'lab qo\'ydim');
  check('crm_watch: receiptPending rost', m.kirishlar[0]?.receiptPending === true);
  check('crm_watch: receiptReview null', m.kirishlar[0]?.receiptReview === null);
  check('crm_watch: acknowledged_at yo\'q', m.tasdiqlar.length === 0);
}

// ─── 5. Agent o'zi eskalatsiya qildi — sababi ustidan yozilmaydi ─────────
{
  const m = build({ openCheck: chek(), output: { ...JAVOB, escalate: { reason: 'Mijoz sudga beraman dedi' } } });
  await m.runner.reply('cv1', 'sudga beraman');
  check('agent eskalatsiyasi: acknowledged_at yozildi', m.tasdiqlar.length === 1);
  check('agent eskalatsiyasi: sabab saqlanadi', !chekEskalatsiyasi(m.patches) && m.patches.some((p) => p.humanReason === 'Mijoz sudga beraman dedi'), JSON.stringify(m.patches));
}

// ─── 6. Agent yiqildi — tekshiruv ochiq, acknowledged_at bo'sh ───────────
{
  const m = build({ openCheck: chek(), engineFails: true });
  let yiqildi = false;
  try {
    await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  } catch {
    yiqildi = true;
  }
  check('agent xatosi yuqoriga chiqadi (agent_error yo\'li)', yiqildi);
  check('agent xatosi: acknowledged_at yozilmadi', m.tasdiqlar.length === 0);
  check('agent xatosi: chek eskalatsiyasi qo\'yilmadi', !chekEskalatsiyasi(m.patches));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
