import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import { RECEIPT_REVIEW_REASON, type PaymentCheck } from '@/domain/entities/PaymentCheck';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-poygasi --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — Telegramga
 * ham, bazaga ham, modelga ham chiqmaydi).
 *
 * Chek tekshiruvidagi ikki chegara holati (yakuniy ko'rik, 2026-09-17):
 *
 *   • Operator topshirig'i chekka hali javob berilmagan (`'new'`) paytda —
 *     agent xabari ketsa `acknowledged_at` yoziladi, lekin suhbat qayta
 *     operatorga CHIQARILMAYDI: operator uni hozirgina agentga qaytargan.
 *   • Operator "To'lov qabul qilindi" tugmasini agent chekka javob
 *     yozayotganda bosdi — mijoz "To'lovingiz qabul qilindi" dan keyin
 *     "Chekni oldim… tekshirib chiqadi" ni olmasligi va suhbat ochiq
 *     tekshiruvsiz qayta operatorga chiqmasligi kerak.
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
  stage: null,
  courseId: null,
  sendCard: false,
  installment: false,
  escalate: null,
  internalNote: null,
  lesson: null,
  clientMemory: null,
};

const TOPSHIRIQ = {
  id: 'n1',
  conversationId: 'cv1',
  direction: 'note',
  author: 'operator',
  body: 'Mijozga to\'lov jadvalini eslat',
  transcript: null,
  media: null,
  meta: null,
  createdAt: new Date('2026-09-17T05:59:00Z'),
} as unknown as Message;

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

function build(opts: {
  /** `findOpenByConversation` ning ketma-ket javoblari; oxirgisi takrorlanadi. */
  openChecks: Array<PaymentCheck | null>;
  output?: AgentTurnOutput;
  /** `markAcknowledged` natijasi — `false`: yozuv allaqachon `reviewing` emas. */
  ackResult?: boolean;
}) {
  const kirishlar: AgentTurnInput[] = [];
  const tasdiqlar: string[] = [];
  const patches: ConversationPatch[] = [];
  const yuborilgan: string[] = [];
  let oqish = 0;

  const engine = {
    respond: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      return opts.output ?? JAVOB;
    },
    composeOperatorTurn: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      return opts.output ?? { ...JAVOB, reply: 'Chekni oldim, rahmat. To\'lov jadvalingiz bo\'yicha yozyapman.' };
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
    {
      findById: async () => SUHBAT,
      update: async (_id: string, patch: ConversationPatch) => {
        patches.push(patch);
        return SUHBAT;
      },
    } as unknown as IConversationRepository,
    { recentByConversation: async () => [TOPSHIRIQ], create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    { send: async (p: { body: string }) => void yuborilgan.push(p.body) } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, personaName: 'Nodira', weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-09-17' } as unknown as IClock,
    { renderSections: async () => '', renderLessons: async () => '', renderClientMemory: async () => '' } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined, find: async () => null } as unknown as IClientProfileRepository,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    {
      findOpenByConversation: async () => {
        const i = Math.min(oqish, opts.openChecks.length - 1);
        oqish += 1;
        return opts.openChecks[i] ?? null;
      },
      markAcknowledged: async (id: string) => {
        tasdiqlar.push(id);
        return opts.ackResult ?? true;
      },
    } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [], listKnowledge: async () => [] } as unknown as ICourseRepository,
    { joriyXarid: async () => null, tolanganKurslar: async () => [], kursBelgila: async () => null, bolibTolash: async () => false, bosqich: async () => null } as unknown as XaridXizmati,
    { yubor: async () => ({ sent: false }) } as unknown as KartaYuboruvchi,
  );

  return { runner, kirishlar, tasdiqlar, patches, yuborilgan };
}

const chekEskalatsiyasi = (patches: ConversationPatch[]): boolean =>
  patches.some(
    (p) => p.needsHuman === true && p.humanKind === 'chek_tekshiruvi' && p.humanReason === RECEIPT_REVIEW_REASON.tolov,
  );

// ─── 1. Operator topshirig'i, chekka hali javob berilmagan ───────────────
{
  const m = build({ openChecks: [chek()] });
  const r = await m.runner.operatorTurn('cv1');
  check('topshiriq (yangi chek): agent receiptReview = new oladi', m.kirishlar[0]?.receiptReview === 'new', String(m.kirishlar[0]?.receiptReview));
  check('topshiriq (yangi chek): xabar ketdi', r.sent === true && m.yuborilgan.length === 1);
  check('topshiriq (yangi chek): acknowledged_at yozildi', m.tasdiqlar.length === 1 && m.tasdiqlar[0] === 'pc1', JSON.stringify(m.tasdiqlar));
  check('topshiriq (yangi chek): needs_human qo\'yilmadi', !m.patches.some((p) => p.needsHuman === true), JSON.stringify(m.patches));
}

{
  const m = build({ openChecks: [chek()], output: { ...JAVOB, reply: null } });
  const r = await m.runner.operatorTurn('cv1');
  check('topshiriq (xabar ketmadi): acknowledged_at yozilmadi', r.sent === false && m.tasdiqlar.length === 0, JSON.stringify(m.tasdiqlar));
}

{
  const m = build({ openChecks: [chek({ acknowledgedAt: new Date('2026-09-17T05:00:00Z') })] });
  await m.runner.operatorTurn('cv1');
  check('topshiriq (qabul qilingan): acknowledged_at qayta yozilmaydi', m.tasdiqlar.length === 0);
  check('topshiriq (qabul qilingan): needs_human qo\'yilmadi', !m.patches.some((p) => p.needsHuman === true));
}

// ─── 2. Tugma model javob yozayotganda bosildi ───────────────────────────
{
  const m = build({ openChecks: [chek(), null] });
  const r = await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  check('tasdiq javobdan oldin: javob yuborilmadi', r.sent === false && m.yuborilgan.length === 0, JSON.stringify(m.yuborilgan));
  check('tasdiq javobdan oldin: acknowledged_at yozilmadi', m.tasdiqlar.length === 0, JSON.stringify(m.tasdiqlar));
  check('tasdiq javobdan oldin: eskalatsiya yo\'q', !m.patches.some((p) => p.needsHuman === true), JSON.stringify(m.patches));
}

{
  const m = build({ openChecks: [chek(), chek({ status: 'confirmed_by_operator', confirmedAt: NOW })] });
  const r = await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  check('tasdiqlangan yozuv qaytdi: javob yuborilmadi', r.sent === false && m.yuborilgan.length === 0);
  check('tasdiqlangan yozuv qaytdi: eskalatsiya yo\'q', !chekEskalatsiyasi(m.patches));
}

{
  const m = build({ openChecks: [chek({ acknowledgedAt: new Date('2026-09-17T05:00:00Z') }), null] });
  const r = await m.runner.reply('cv1', 'qachon tekshirasizlar?');
  check('qabul qilingan chek tasdiqlandi: eski javob yuborilmadi', r.sent === false && m.yuborilgan.length === 0);
}

{
  const m = build({ openChecks: [chek(), chek()] });
  const r = await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  check('tekshiruv hali ochiq: javob ketdi', r.sent === true && m.yuborilgan.length === 1);
  check('tekshiruv hali ochiq: eskalatsiya qo\'yildi', chekEskalatsiyasi(m.patches), JSON.stringify(m.patches));
}

// ─── 3. markAcknowledged yozmadi — tekshiruv shu orada yopilgan ──────────
{
  const m = build({ openChecks: [chek(), chek()], ackResult: false });
  const r = await m.runner.reply('cv1', '[mijoz to\'lov cheki yubordi]');
  check('belgi yozilmadi: javob baribir ketgan', r.sent === true);
  check('belgi yozilmadi: eskalatsiya yo\'q', !m.patches.some((p) => p.needsHuman === true), JSON.stringify(m.patches));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
