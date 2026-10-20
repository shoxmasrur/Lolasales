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
import { AbortedError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:llm-qaytish --workspace=server
 *
 * `AgentRunner.navbat()` — akkauntga biriktirilgan dvigatel yiqilganda
 * standart (Claude) dvigatelga qaytish mantiqi. Bu mavjud spec'larda
 * tekshirilmagan: ularning soxta `AgentEngineFactory`si doim
 * `provider: 'claude'` beradi, ya'ni qaytish shoxi umuman bajarilmaydi.
 *
 * To'rt ssenariy:
 *   (a)/(b) OpenAI dvigateli yiqiladi → standartga qaytiladi, xabar
 *       baribir yuboriladi va `meta.llmFallback === true` bilan
 *       HAQIQATAN ishlatilgan (standart) model yoziladi;
 *   (c) `AbortedError` — qaytish YO'Q, xato yuqoriga ketadi;
 *   (d) standart dvigatelning o'zi yiqilsa — ikkinchi qaytish YO'Q,
 *       xato yuqoriga ketadi (cheksiz urinish yo'q).
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
function build(engines: AgentEngineFactory): {
  r: AgentRunner;
  yuborilgan: Array<{ body: string; meta?: Record<string, unknown> }>;
} {
  const yuborilgan: Array<{ body: string; meta?: Record<string, unknown> }> = [];

  const r = new AgentRunner(
    engines,
    { findById: async () => ({ id: 'c1', fullName: 'Aziz Karimov', firstName: 'Aziz', telegramStatus: 'found' }) } as unknown as IClientRepository,
    { findById: async () => SUHBAT, update: async () => SUHBAT, markContactedIfNew: async () => undefined } as unknown as IConversationRepository,
    { recentByConversation: async () => [], create: async () => ({ id: 'x1' }) } as unknown as IMessageRepository,
    {
      send: async ({ body, meta }: { body: string; meta?: Record<string, unknown> }) =>
        void yuborilgan.push({ body, meta }),
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, personaName: 'Nodira', weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
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

  return { r, yuborilgan };
}

// ─── (a)/(b) OpenAI yiqildi — standartga qaytildi, tamg'a haqiqiy ────────
{
  const oaEngine = {
    composeFirstContact: async () => {
      throw new Error('OpenAI so\'rovi muvaffaqiyatsiz tugadi');
    },
  } as unknown as IAgentEngine;
  let claudeChaqirildi = 0;
  const claudeEngine = {
    composeFirstContact: async () => {
      claudeChaqirildi += 1;
      return JAVOB;
    },
  } as unknown as IAgentEngine;

  const tanlanganOpenai: TanlanganDvigatel = { engine: oaEngine, provider: 'openai', model: 'gpt-sinov', llmModel: null };
  const tanlanganClaude: TanlanganDvigatel = { engine: claudeEngine, provider: 'claude', model: 'claude-standart', llmModel: null };
  const engines = {
    forAccount: async () => tanlanganOpenai,
    standart: () => tanlanganClaude,
  } as unknown as AgentEngineFactory;

  const { r, yuborilgan } = build(engines);
  const out = await r.firstContact('cv1');

  check('(a) OpenAI yiqilsa ham xabar yuboriladi', out.sent === true && yuborilgan.length === 1, JSON.stringify(out));
  check('(a) standart dvigatel chaqirildi', claudeChaqirildi === 1, String(claudeChaqirildi));

  const meta = yuborilgan[0]?.meta ?? {};
  check(
    '(b) meta.llmFallback === true va llmModel standart nomi',
    meta.llmFallback === true && meta.llmModel === 'claude-standart' && meta.llmProvider === 'claude',
    JSON.stringify(meta),
  );
}

// ─── (c) AbortedError — qaytish YO'Q, xato yuqoriga ketadi ───────────────
{
  const oaEngineAborted = {
    composeFirstContact: async () => {
      throw new AbortedError('navbat to\'xtatildi');
    },
  } as unknown as IAgentEngine;
  let claudeChaqirildi = 0;
  const claudeEngine = {
    composeFirstContact: async () => {
      claudeChaqirildi += 1;
      return JAVOB;
    },
  } as unknown as IAgentEngine;

  const tanlanganOpenai: TanlanganDvigatel = { engine: oaEngineAborted, provider: 'openai', model: 'gpt-sinov', llmModel: null };
  const tanlanganClaude: TanlanganDvigatel = { engine: claudeEngine, provider: 'claude', model: 'claude-standart', llmModel: null };
  const engines = {
    forAccount: async () => tanlanganOpenai,
    standart: () => tanlanganClaude,
  } as unknown as AgentEngineFactory;

  const { r, yuborilgan } = build(engines);
  let xato: unknown = null;
  try {
    await r.firstContact('cv1');
  } catch (err) {
    xato = err;
  }

  check('(c) AbortedError yuqoriga ketadi', xato instanceof AbortedError, String(xato));
  check('(c) standart dvigatel chaqirilmadi', claudeChaqirildi === 0, String(claudeChaqirildi));
  check('(c) xabar yuborilmadi', yuborilgan.length === 0, String(yuborilgan.length));
}

// ─── (d) Standart dvigatelning o'zi yiqilsa — ikkinchi qaytish YO'Q ──────
{
  let claudeChaqirildi = 0;
  const claudeFails = {
    composeFirstContact: async () => {
      claudeChaqirildi += 1;
      throw new Error('Claude ham javob bermadi');
    },
  } as unknown as IAgentEngine;

  // Akkaunt modeli biriktirilmagan holatni taqlid qiladi: `forAccount`
  // to'g'ridan-to'g'ri standart (Claude) dvigatelni qaytaradi.
  const tanlanganClaude: TanlanganDvigatel = { engine: claudeFails, provider: 'claude', model: 'claude-standart', llmModel: null };
  const engines = {
    forAccount: async () => tanlanganClaude,
    standart: () => tanlanganClaude,
  } as unknown as AgentEngineFactory;

  const { r, yuborilgan } = build(engines);
  let xato: unknown = null;
  try {
    await r.firstContact('cv1');
  } catch (err) {
    xato = err;
  }

  check('(d) xato yuqoriga ketadi', xato instanceof Error && !(xato instanceof AbortedError), String(xato));
  check('(d) dvigatel FAQAT bir marta chaqirildi (qaytish yo\'q)', claudeChaqirildi === 1, String(claudeChaqirildi));
  check('(d) xabar yuborilmadi', yuborilgan.length === 0, String(yuborilgan.length));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
