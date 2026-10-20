import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory, TanlanganDvigatel } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:qoriqchi-navbat --workspace=server
 *
 * Debitordan qolgan "mavzudan tashqari" qo'riqchisi OLIB TASHLANDI (yakuniy
 * sharh, 2-topilma): u oddiy kurs savollarini ("Kurs 3-4 oy davom etadimi?",
 * "Python kod yozishni o'rgatasizmi?") qarz bo'yicha tayyor jumla bilan
 * to'sardi. Endi har bir kiruvchi xabar modelga boradi — mavzudan tashqari
 * savolni sotuv prompti o'zi hal qiladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-09-29T06:00:00Z');

const JAVOB: AgentTurnOutput = {
  reply: 'Assalomu alaykum, to\'lov muddati haqida eslatib qo\'yay.',
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
  createdAt: new Date('2026-08-01T06:00:00Z'),
} as unknown as Conversation;

/**
 * `AgentRunner`ni to'liq soxta bog'liqliklar bilan quradi — to'plam
 * `chekTasdiqi.spec.ts` dagi `runner()` yordamchisidan ko'chirilgan
 * (o'sha yerda 21 argumentning hammasi allaqachon ishlaydigan holda
 * tekshirilgan).
 */
interface Sozlama {
  /** Suhbatdagi oxirgi xabarlar — takroran javob bermaslikni tekshirish uchun. */
  oxirgilar?: Array<{ direction: string; meta?: Record<string, unknown> }>;
  agentAutoReply?: boolean;
}

function build(sozlama: Sozlama = {}): {
  r: AgentRunner;
  yuborilgan: Array<{ body: string; meta?: Record<string, unknown> }>;
  chaqirildi: () => number;
} {
  const yuborilgan: Array<{ body: string; meta?: Record<string, unknown> }> = [];
  let dvigatelChaqirigi = 0;

  const dvigatel = {
    respond: async () => { dvigatelChaqirigi += 1; return JAVOB; },
  } as unknown as IAgentEngine;

  const tanlangan: TanlanganDvigatel = {
    engine: dvigatel, provider: 'claude', model: 'claude-sinov', llmModel: null,
  };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const r = new AgentRunner(
    engines,
    { findById: async () => ({ id: 'c1', fullName: 'Aziz Karimov', firstName: 'Aziz', telegramStatus: 'found' }) } as unknown as IClientRepository,
    { findById: async () => SUHBAT, update: async () => SUHBAT, markContactedIfNew: async () => undefined } as unknown as IConversationRepository,
    { recentByConversation: async () => (sozlama.oxirgilar ?? []), create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    {
      send: async ({ body, meta }: { body: string; meta?: Record<string, unknown> }) =>
        void yuborilgan.push({ body, meta }),
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: sozlama.agentAutoReply ?? true, killSwitch: false, personaName: 'Nodira', weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-09-29' } as unknown as IClock,
    { renderSections: async () => '', renderLessons: async () => '', renderClientMemory: async () => '' } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined, find: async () => null } as unknown as IClientProfileRepository,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [], listKnowledge: async () => [] } as unknown as ICourseRepository,
    { joriyXarid: async () => null, faol: async () => null, tolanganKurslar: async () => [], agentKursi: async () => null, bolibTolash: async () => false, bosqich: async () => null } as unknown as XaridXizmati,
    { yubor: async () => ({ sent: false }) } as unknown as KartaYuboruvchi,
  );

  return { r, yuborilgan, chaqirildi: () => dvigatelChaqirigi };
}


const KURS_SAVOLLARI = [
  'Kurs 3-4 oy davom etadimi?',
  'Darslar 19-21 da bo\'ladimi?',
  'Python kod yozishni o\'rgatasizmi?',
  'Rasm chizishni o\'rgatadimi bu kurs',
  'Tarjima qilishni o\'rganmoqchiman',
  '5+9 nechchi boladi?',
];
for (const savol of KURS_SAVOLLARI) {
  const { r, yuborilgan, chaqirildi } = build();
  const natija = await r.reply('cv1', savol);
  check(`"${savol}" — model chaqirildi`, chaqirildi() === 1, `chaqiriq: ${chaqirildi()}`);
  check(`"${savol}" — model javobi yuborildi (tayyor jumla emas)`,
    yuborilgan.length === 1 && yuborilgan[0]?.body === JAVOB.reply && yuborilgan[0]?.meta?.guard === undefined,
    JSON.stringify(yuborilgan));
  check(`"${savol}" — natija sent`, natija.sent === true);
}

{
  // Oldingi (eski) qo'riqchi xabari tarixda bo'lsa ham javob to'silmaydi.
  const { r, chaqirildi } = build({ oxirgilar: [{ direction: 'out', body: 'Men to\'lov bo\'yicha yordam beraman', createdAt: NOW, meta: { guard: 'mavzudan_tashqari' } } as never] });
  await r.reply('cv1', '10+10 nechchi?');
  check('eski guard belgisi — model baribir chaqirildi', chaqirildi() === 1);
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
