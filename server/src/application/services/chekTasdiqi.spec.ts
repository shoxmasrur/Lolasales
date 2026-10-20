import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { AgentRunner, type AgentTurnResult } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
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
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AbortedError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasdiqi --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — bazaga ham,
 * CRM'ga ham, modelga ham chiqmaydi).
 *
 * "To'lov qabul qilindi" tugmasi (`PaymentCheckService.confirmReceipt`):
 *   • tekshiruv `confirmed_by_operator`, audit operator emaili bilan,
 *     suhbat operatordan qaytadi, agent summasiz rahmat yozadi;
 *   • ikkinchi bosish — `no_review`, rahmat ikkinchi marta ketmaydi;
 *   • rahmat avvalroq ketgan (`thanks_sent_at`) — tekshiruv rahmatsiz yopiladi;
 *   • rahmatdagi to'langan/qolgan summa joriy xariddan; havola hali yuborilmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-09-17T06:00:00Z');
const OPERATOR = 'operator@xonsaroy.uz';

type Qator = { -readonly [K in keyof PaymentCheck]: PaymentCheck[K] };

const chek = (over: Partial<Qator> = {}): Qator => ({
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
  acknowledgedAt: NOW,
  thanksSentAt: null,
  confirmedBy: null,
  confirmedAt: null,
  createdAt: NOW,
  ...over,
});

function build(opts: {
  qator?: Qator;
  /** Joriy xarid: `null` — xarid yo'q. */
  xarid?: { totalAmount: number | null; paidAmount: number } | null;
  killSwitch?: boolean;
  agent?: () => Promise<AgentTurnResult>;
}) {
  const qator = opts.qator ?? chek();
  const patches: ConversationPatch[] = [];
  const jurnal: AuditEntry[] = [];
  type Tasdiq = { paidAmount: number; totalAmount: number; remaining: number; linkWillBeSent: boolean };
  const rahmatlar: Tasdiq[] = [];
  const xarid = opts.xarid === undefined ? { totalAmount: 1_500_000, paidAmount: 500_000 } : opts.xarid;

  const checks = {
    findOpenByConversation: async () => (qator.status === 'reviewing' || qator.status === 'watching' ? qator : null),
    confirmByOperator: async (id: string, actor: string, at: Date) => {
      if (qator.id !== id || qator.status !== 'reviewing') return false;
      qator.status = 'confirmed_by_operator';
      qator.confirmedBy = actor;
      qator.confirmedAt = at;
      return true;
    },
  } as unknown as IPaymentCheckRepository;

  const service = new PaymentCheckService(
    checks,
    {
      update: async (_id: string, patch: ConversationPatch) => {
        patches.push(patch);
        return {} as Conversation;
      },
    } as unknown as IConversationRepository,
    {} as unknown as IContractRepository,
    {} as unknown as IContractPaymentRepository,
    {} as unknown as IPaymentPromiseRepository,
    {} as unknown as ContractSyncService,
    {
      receiptConfirmedThanks: async (_id: string, r: Tasdiq) => {
        rahmatlar.push(r);
        return opts.agent ? opts.agent() : { sent: true, reply: 'rahmat', escalated: false, cardSent: false };
      },
    } as unknown as AgentRunner,
    { record: async (e: AuditEntry) => void jurnal.push(e) } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-09-17' } as unknown as IClock,
    { get: async () => ({ killSwitch: opts.killSwitch ?? false }) } as unknown as RuntimeSettings,
    {
      findActiveByClient: async () => xarid,
      findLatestByClient: async () => null,
    } as unknown as IPurchaseRepository,
  );

  return { service, qator, patches, jurnal, rahmatlar };
}

// ─── 1. Tugma — tasdiq, audit, rahmat ────────────────────────────────────
{
  const m = build({});
  const out = await m.service.confirmReceipt('cv1', OPERATOR);
  check('natija thanked', out.kind === 'thanked', JSON.stringify(out));
  check('holat confirmed_by_operator', m.qator.status === 'confirmed_by_operator', m.qator.status);
  check('tasdiqlagan operator yozildi', m.qator.confirmedBy === OPERATOR && m.qator.confirmedAt === NOW);
  check(
    'suhbat operatordan qaytdi',
    m.patches.some((p) => p.needsHuman === false && p.humanKind === null && p.humanReason === null),
    JSON.stringify(m.patches),
  );
  const yozuv = m.jurnal[0];
  check(
    'audit: actor email, action, payload',
    yozuv?.actor === OPERATOR &&
      yozuv.action === 'receipt_review.confirmed' &&
      yozuv.entity === 'conversation' &&
      yozuv.entityId === 'cv1' &&
      (yozuv.payload as { checkId?: string; messageId?: string }).checkId === 'pc1' &&
      (yozuv.payload as { messageId?: string }).messageId === 'm1',
    JSON.stringify(yozuv),
  );
  check('rahmat bir marta so\'raldi', m.rahmatlar.length === 1, String(m.rahmatlar.length));
  check(
    'xariddan summalar: to\'langan, jami, qolgan',
    m.rahmatlar[0]?.paidAmount === 500_000 && m.rahmatlar[0]?.totalAmount === 1_500_000 && m.rahmatlar[0]?.remaining === 1_000_000,
    JSON.stringify(m.rahmatlar[0]),
  );
  check('havola hali yuborilmaydi', m.rahmatlar[0]?.linkWillBeSent === false);

  // ─── 2. Ikkinchi bosish ────────────────────────────────────────────────
  const ikkinchi = await m.service.confirmReceipt('cv1', OPERATOR);
  check('ikkinchi bosish — no_review', ikkinchi.kind === 'no_review', JSON.stringify(ikkinchi));
  check('ikkinchi bosish — rahmat takrorlanmadi', m.rahmatlar.length === 1, String(m.rahmatlar.length));
}

// ─── 3. Rahmat avvalroq ketgan ───────────────────────────────────────────
{
  const m = build({ qator: chek({ thanksSentAt: new Date('2026-09-17T05:30:00Z') }) });
  const out = await m.service.confirmReceipt('cv1', OPERATOR);
  check('thanks_sent_at bor — already_thanked', out.kind === 'already_thanked', JSON.stringify(out));
  check('thanks_sent_at bor — agent chaqirilmadi', m.rahmatlar.length === 0);
  check('thanks_sent_at bor — tekshiruv baribir yopildi', m.qator.status === 'confirmed_by_operator');
}

// ─── 4. To'liq to'langan — qolgan summa nol ──────────────────────────────
{
  const m = build({ xarid: { totalAmount: 1_500_000, paidAmount: 1_500_000 } });
  await m.service.confirmReceipt('cv1', OPERATOR);
  check('to\'liq to\'langan — remaining 0', m.rahmatlar[0]?.remaining === 0, JSON.stringify(m.rahmatlar));
}

// ─── 5. Xarid yo'q — summalar nol, rahmat baribir ────────────────────────
{
  const m = build({ xarid: null });
  const out = await m.service.confirmReceipt('cv1', OPERATOR);
  check('xarid yo\'q — rahmat', out.kind === 'thanked', JSON.stringify(out));
  check('xarid yo\'q — summalar 0', m.rahmatlar[0]?.totalAmount === 0 && m.rahmatlar[0]?.remaining === 0, JSON.stringify(m.rahmatlar));
}

// ─── 6. Ochiq chek yo'q ──────────────────────────────────────────────────
{
  const m = build({ qator: chek({ kind: 'crm_watch', status: 'watching', receiptSource: null }) });
  const out = await m.service.confirmReceipt('cv1', OPERATOR);
  check('faqat da\'vo kuzatuvi — no_review', out.kind === 'no_review', JSON.stringify(out));
  check('da\'vo kuzatuviga tegilmadi', m.qator.status === 'watching' && m.jurnal.length === 0);
}

// ─── 7. Rahmat ketmadi — tekshiruv baribir yopiq ─────────────────────────
{
  const kill = build({ killSwitch: true });
  const k = await kill.service.confirmReceipt('cv1', OPERATOR);
  check('kill switch — not_sent', k.kind === 'not_sent' && k.reason === 'kill_switch', JSON.stringify(k));
  check('kill switch — agent chaqirilmadi', kill.rahmatlar.length === 0);
  check('kill switch — tekshiruv yopildi', kill.qator.status === 'confirmed_by_operator');

  const ochiq = build({ agent: async () => ({ sent: false, reply: null, escalated: false, cardSent: false }) });
  const o = await ochiq.service.confirmReceipt('cv1', OPERATOR);
  check('agent yozmadi — agent_disabled', o.kind === 'not_sent' && o.reason === 'agent_disabled', JSON.stringify(o));

  const xato = build({ agent: async () => { throw new AbortedError('to\'xtatildi'); } });
  const x = await xato.service.confirmReceipt('cv1', OPERATOR);
  check('agent xatosi — agent_error', x.kind === 'not_sent' && x.reason === 'agent_error', JSON.stringify(x));
  check('agent xatosi — audit yozildi', xato.jurnal.length === 1);
}

// ─── 8. AgentRunner.receiptConfirmedThanks ───────────────────────────────
function runner(suhbat: Partial<Conversation>) {
  const kirishlar: Array<Omit<AgentTurnInput, 'incoming'>> = [];
  const yuborilgan: string[] = [];
  const javob: AgentTurnOutput = {
    reply: 'To\'lovingiz qabul qilindi, rahmat!',
    replySecond: null,
    sessionId: null,
    stage: null,
    courseId: null,
    sendCard: false,
    installment: false,
    escalate: null,
    internalNote: null,
    lesson: null,
    clientMemory: null,
  };
  const SUHBAT = {
    id: 'cv1',
    clientId: 'c1',
    telegramAccountId: null,
    state: 'contacted',
    agentEnabled: true,
    needsHuman: false,
    humanKind: null,
    agentSessionId: null,
    createdAt: new Date('2026-08-14T06:00:00Z'),
    ...suhbat,
  } as unknown as Conversation;

  const engine = {
    composeReceiptConfirmed: async (input: Omit<AgentTurnInput, 'incoming'>) => {
      kirishlar.push(input);
      return javob;
    },
  } as unknown as IAgentEngine;
  // Akkaunt biriktirilmagan sinov — `forAccount` va `standart` bir xil
  // sinov dvigatelini qaytaradi (`AgentEngineFactory` yangi qatlami).
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const r = new AgentRunner(
    engines,
    { findById: async () => ({ id: 'c1', fullName: 'Komiljonov Doniyorbek', firstName: 'Doniyorbek', telegramStatus: 'found' }) } as unknown as IClientRepository,
    { findById: async () => SUHBAT, update: async () => SUHBAT } as unknown as IConversationRepository,
    { recentByConversation: async () => [], create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    { send: async ({ body }: { body: string }) => void yuborilgan.push(body) } as unknown as MessageDispatcher,
    // `agentAutoReply: false` — tugmani operator bosgan, xabar baribir darhol ketishi kerak.
    { get: async () => ({ agentAutoReply: false, personaName: 'Nodira', weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-09-17' } as unknown as IClock,
    { renderSections: async () => '', renderLessons: async () => '', renderClientMemory: async () => '' } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined, find: async () => null } as unknown as IClientProfileRepository,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [], listKnowledge: async () => [] } as unknown as ICourseRepository,
    { joriyXarid: async () => null, tolanganKurslar: async () => [], kursBelgila: async () => null, bolibTolash: async () => false, bosqich: async () => null } as unknown as XaridXizmati,
    { yubor: async () => ({ sent: false }) } as unknown as KartaYuboruvchi,
  );
  return { r, kirishlar, yuborilgan };
}

{
  const m = runner({});
  const out = await m.r.receiptConfirmedThanks('cv1', { paidAmount: 500_000, totalAmount: 1_500_000, remaining: 1_000_000, linkWillBeSent: false });
  check('runner: xabar darhol ketdi', out.sent === true && m.yuborilgan.length === 1, JSON.stringify(out));
  check(
    'runner: tasdiq ma\'lumoti modelga berildi',
    m.kirishlar[0]?.receiptConfirmed?.remaining === 1_000_000 && m.kirishlar[0]?.receiptConfirmed?.linkWillBeSent === false,
    JSON.stringify(m.kirishlar[0]?.receiptConfirmed),
  );

  const yopiq = runner({ agentEnabled: false });
  const o = await yopiq.r.receiptConfirmedThanks('cv1', { paidAmount: 0, totalAmount: 0, remaining: 0, linkWillBeSent: false });
  check('runner: agent o\'chiq — yuborilmaydi', o.sent === false && yopiq.kirishlar.length === 0);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
