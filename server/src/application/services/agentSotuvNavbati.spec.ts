import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory, TanlanganDvigatel } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Course } from '@/domain/entities/Course';
import type { XaridBosqichi } from '@/domain/entities/Purchase';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository, ConversationPatch } from '@/domain/repositories/IConversationRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import { buildUserPrompt } from '@/infrastructure/ai/prompt/userPrompt';
import { HAVOLA_BELGISI, KARTA_BELGISI, MAXFIY_SABAB } from '@/domain/services/maxfiyQiymat';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-sotuv-navbati --workspace=server
 *
 * `AgentRunner.apply()` ning sotuv qadamlari (bazasiz, modelsiz):
 *   • `courseId` faqat SOTUVDAGI kurs bo'lsa belgilanadi;
 *   • `installment` faqat `true` bo'lsa qo'llanadi;
 *   • `stage` → `xarid.bosqich(..., 'agent')`;
 *   • `sendCard` → karta (javobdan KEYIN); takror himoyasi; qo'lda tasdiqlash
 *     rejimida karta ketmaydi; karta xatosi navbatni yiqitmaydi — menejerga o'tadi;
 *   • kontekst sotuvdagi kurslar va xariddan quriladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-11-05T06:00:00Z');

const KURS: Course = {
  id: 'kurs-nov', name: 'SMM noldan', description: null, salesStart: '2026-11-01', salesEnd: '2026-11-20',
  price: 1_500_000, duration: null, topics: [], startsOn: null, groupLink: null, isActive: true,
  installmentAllowed: true, installmentParts: 3, installmentFirstMin: 500_000, linkAfter: 'birinchi_qism',
};
const ESKI: Course = { ...KURS, id: 'kurs-okt', name: 'Eski kurs', salesStart: '2026-10-01', salesEnd: '2026-10-20' };

const JAVOB: AgentTurnOutput = {
  reply: 'Mana karta, to\'lovdan keyin chekni shu yerga yuboring.',
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
  id: 'cv1', clientId: 'c1', telegramAccountId: null, state: 'new', agentEnabled: true,
  needsHuman: false, humanKind: null, agentSessionId: null, createdAt: NOW,
} as unknown as Conversation;

interface Sozlama {
  javob: Partial<AgentTurnOutput>;
  agentAutoReply?: boolean;
  xaridBosqichi?: XaridBosqichi | null;
  kartaXato?: Error;
  /** Suhbat tarixi (`recentByConversation`). */
  tarix?: Array<Record<string, unknown>>;
}

function build(s: Sozlama) {
  const qadamlar: string[] = [];
  const patchlar: ConversationPatch[] = [];
  const kirishlar: AgentTurnInput[] = [];
  const qoralamalar: Array<{ meta?: Record<string, unknown> }> = [];
  const yuborilgan: string[] = [];

  const dvigatel = {
    respond: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      return { ...JAVOB, ...s.javob };
    },
    composeNudge: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      return { ...JAVOB, ...s.javob };
    },
    composeFirstContact: async (input: AgentTurnInput) => {
      kirishlar.push(input);
      return { ...JAVOB, ...s.javob };
    },
  } as unknown as IAgentEngine;
  const tanlangan: TanlanganDvigatel = { engine: dvigatel, provider: 'claude', model: 'sinov', llmModel: null };
  const engines = { forAccount: async () => tanlangan, standart: () => tanlangan } as unknown as AgentEngineFactory;

  const bosqich = s.xaridBosqichi === undefined ? 'qiziqdi' : s.xaridBosqichi;
  const xarid = {
    joriyXarid: async () =>
      bosqich
        ? { id: 'p1', clientId: 'c1', courseId: KURS.id, stage: bosqich, totalAmount: 1_500_000, paidAmount: 0, installment: false }
        : null,
    tolanganKurslar: async () => [ESKI.id],
    kursBelgila: async (_c: string, id: string) => void qadamlar.push(`kurs:${id}`),
    bolibTolash: async () => { qadamlar.push('bolib'); return true; },
    bosqich: async (_c: string, st: string, aktor: string) => void qadamlar.push(`bosqich:${st}:${aktor}`),
  } as unknown as XaridXizmati;

  const karta = {
    yubor: async () => {
      qadamlar.push('karta');
      if (s.kartaXato) throw s.kartaXato;
      return { sent: true };
    },
  } as unknown as KartaYuboruvchi;

  const r = new AgentRunner(
    engines,
    {
      findById: async () => ({
        id: 'c1', fullName: 'Aliyeva Malika', firstName: 'Malika', telegramStatus: 'found',
        source: 'guruh', sourceGroup: 'SMM maktabi', sourceComment: 'narxi qancha?',
      }),
    } as unknown as IClientRepository,
    {
      findById: async () => SUHBAT,
      update: async (_id: string, p: ConversationPatch) => { patchlar.push(p); return SUHBAT; },
    } as unknown as IConversationRepository,
    {
      recentByConversation: async () => s.tarix ?? [],
      create: async (m: { meta?: Record<string, unknown> }) => {
        qadamlar.push('qoralama');
        qoralamalar.push(m);
        return { id: 'x1' };
      },
    } as unknown as IMessageRepository,
    {
      send: async ({ body }: { body: string }) => {
        qadamlar.push('javob');
        yuborilgan.push(body);
      },
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: s.agentAutoReply ?? true, killSwitch: false, personaName: 'Lola', kompaniyaNomi: 'SMM Akademiya' }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-11-05' } as unknown as IClock,
    { renderSections: async () => '', renderLessons: async () => '', renderClientMemory: async () => '' } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined, find: async () => null } as unknown as IClientProfileRepository,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [KURS, ESKI], listKnowledge: async () => [] } as unknown as ICourseRepository,
    xarid,
    karta,
  );
  return { r, qadamlar, patchlar, kirishlar, qoralamalar, yuborilgan };
}

// ─── 1. To'liq qadam: kurs → bo'lib to'lash → bosqich → karta ────────────
{
  const m = build({ javob: { courseId: KURS.id, installment: true, stage: 'qiziqdi', sendCard: true } });
  const out = await m.r.reply('cv1', 'bo\'lib to\'lasam bo\'ladimi? karta tashlang');
  check(
    'tartib: javob → kurs → bo\'lib → bosqich → karta',
    JSON.stringify(m.qadamlar) === JSON.stringify(['javob', `kurs:${KURS.id}`, 'bolib', 'bosqich:qiziqdi:agent', 'karta']),
    JSON.stringify(m.qadamlar),
  );
  check('cardSent', out.cardSent === true && out.sent === true, JSON.stringify(out));
  check('eskalatsiya yo\'q', out.escalated === false && !m.patchlar.some((p) => p.needsHuman));
  check('birinchi javob — new → contacted', m.patchlar.some((p) => p.state === 'contacted'), JSON.stringify(m.patchlar));
}

// ─── 2. Sotuvda yo'q kurs tashlanadi; false qiymatlar hech narsa qilmaydi ─
{
  const m = build({ javob: { courseId: ESKI.id } });
  await m.r.reply('cv1', 'oktyabrdagi kurs-chi?');
  check('sotuvda yo\'q kurs belgilanmadi', !m.qadamlar.some((q) => q.startsWith('kurs:')), JSON.stringify(m.qadamlar));
  check('installment=false — tegilmadi', !m.qadamlar.includes('bolib'));
  check('stage=null — tegilmadi', !m.qadamlar.some((q) => q.startsWith('bosqich')));
  check('sendCard=false — karta yo\'q', !m.qadamlar.includes('karta'));
}

// ─── 3. Takror himoyasi: karta allaqachon yuborilgan ─────────────────────
{
  const m = build({ javob: { sendCard: true }, xaridBosqichi: 'karta_yuborildi' });
  const out = await m.r.reply('cv1', 'kartani yana tashlang');
  check('karta_yuborildi — ikkinchi karta ketmadi', !m.qadamlar.includes('karta') && out.cardSent === false, JSON.stringify(m.qadamlar));
}
{
  const m = build({ javob: { sendCard: true }, xaridBosqichi: 'chek_keldi' });
  await m.r.reply('cv1', 'karta?');
  check('chek_keldi — karta ketmadi', !m.qadamlar.includes('karta'));
}

// ─── 4. Qo'lda tasdiqlash rejimi — qoralama, karta o'zi ketmaydi, menejerga ─
{
  const m = build({ javob: { sendCard: true }, agentAutoReply: false });
  const out = await m.r.reply('cv1', 'to\'layman');
  check('qoralama saqlandi', m.qadamlar.includes('qoralama') && !m.qadamlar.includes('javob'), JSON.stringify(m.qadamlar));
  check('qoralama rejimida karta ketmadi', !m.qadamlar.includes('karta') && out.cardSent === false);
  check('qoralama metasida sendCard', m.qoralamalar[0]?.meta?.sendCard === true, JSON.stringify(m.qoralamalar[0]?.meta));
  check(
    'qoralama + sendCard → menejerga "kartani yuboring"',
    m.patchlar.some((p) => p.needsHuman === true && p.humanReason === 'Mijoz to\'lashga rozi — kartani yuboring'),
    JSON.stringify(m.patchlar),
  );
}
{
  const m = build({ javob: { sendCard: true }, agentAutoReply: false, xaridBosqichi: 'karta_yuborildi' });
  await m.r.reply('cv1', 'to\'layman');
  check('qoralama + karta allaqachon yuborilgan — menejer chaqirilmaydi', !m.patchlar.some((p) => p.needsHuman), JSON.stringify(m.patchlar));
}
{
  const m = build({ javob: {}, agentAutoReply: false });
  await m.r.reply('cv1', 'salom');
  check('qoralama sendCard=false — metada belgi yo\'q', m.qoralamalar[0]?.meta?.sendCard === undefined);
}

// ─── 5. Karta xatosi navbatni yiqitmaydi — menejerga o'tadi ──────────────
{
  const m = build({ javob: { sendCard: true }, kartaXato: new Error('KILL_SWITCH yoqilgan') });
  const out = await m.r.reply('cv1', 'karta tashlang');
  check('xato tashlanmadi, javob ketdi', out.sent === true && out.cardSent === false, JSON.stringify(out));
  check('eskalatsiya', out.escalated === true);
  check(
    'needsHuman + sabab',
    m.patchlar.some((p) => p.needsHuman === true && String(p.humanReason).includes('Karta yuborilmadi')),
    JSON.stringify(m.patchlar),
  );
}

// ─── 6. Agent eskalatsiya qildi — karta yuborilmaydi ─────────────────────
{
  const m = build({ javob: { sendCard: true, escalate: { reason: 'pulni qaytarish talabi' } } });
  const out = await m.r.reply('cv1', 'pulimni qaytaring');
  check('eskalatsiyada karta yo\'q', !m.qadamlar.includes('karta'));
  check('eskalatsiya sababi', m.patchlar.some((p) => p.needsHuman === true && p.humanReason === 'pulni qaytarish talabi') && out.escalated);
}

// ─── 7. Kontekst: sotuvdagi kurs, xarid, manba, kompaniya ────────────────
{
  const m = build({ javob: {} });
  await m.r.reply('cv1', 'salom');
  const k = m.kirishlar[0];
  check('sotuvda faqat noyabr kursi', k?.context.coursesOnSale.length === 1 && k.context.coursesOnSale[0]?.course.id === KURS.id, JSON.stringify(k?.context.coursesOnSale.map((c) => c.course.id)));
  check('keyingi kurs — sotuvda bor bo\'lsa null', k?.context.nextCourse === null);
  check('xarid bosqichi', k?.context.purchase?.stage === 'qiziqdi');
  check('oldin sotib olingan kurs nomi', k?.context.boughtCourses[0] === 'Eski kurs', JSON.stringify(k?.context.boughtCourses));
  check('manba va komment', k?.context.source === 'guruh' && k.context.sourceComment === 'narxi qancha?');
  check('kompaniya nomi sozlamadan', k?.knowledge.companyName === 'SMM Akademiya');
}

// ─── 8. Karta faqat jonli suhbatda: eslatma va birinchi xabarda yo'q ─────
{
  const m = build({ javob: { sendCard: true } });
  await m.r.nudge('cv1', 'qiziqdi');
  check('nudge — karta ketmadi', !m.qadamlar.includes('karta'), JSON.stringify(m.qadamlar));
}
{
  const m = build({ javob: { sendCard: true } });
  await m.r.firstContact('cv1');
  check('birinchi murojaat — karta ketmadi', !m.qadamlar.includes('karta'), JSON.stringify(m.qadamlar));
}

// ─── 9. Tarixdagi karta/havola xabari modelga ko'rsatilmaydi ─────────────
{
  const tarix = [
    { direction: 'in', body: 'karta tashlang', createdAt: NOW, meta: {} },
    {
      direction: 'out', createdAt: NOW, meta: { kind: 'karta' },
      body: "To'lov uchun karta:\n8600 1234 5678 9012\nEgasi: ALIYEV ALI\nBank: Kapitalbank\nSumma: 1 500 000 so'm",
    },
    { direction: 'out', createdAt: NOW, meta: { kind: 'havola' }, body: 'Yopiq guruhga havola: https://t.me/+abcDEF' },
  ];
  const m = build({ javob: {}, tarix });
  await m.r.reply('cv1', 'rahmat');
  const k = m.kirishlar[0]!;
  const prompt = buildUserPrompt(k, 'reply', NOW);
  check('tarixda karta belgisi', k.history[1]?.text === KARTA_BELGISI, JSON.stringify(k.history[1]));
  check('tarixda havola belgisi', k.history[2]?.text === HAVOLA_BELGISI, JSON.stringify(k.history[2]));
  check('promptda karta raqami yo\'q', !/\d{4} \d{4} \d{4} \d{4}/.test(prompt));
  check('promptda karta egasi yo\'q', !prompt.includes('ALIYEV ALI'));
  check('promptda havola yo\'q', !prompt.includes('t.me/+abcDEF'));
  check('mijoz xabari o\'zgarmadi', k.history[0]?.text === 'karta tashlang');
}

// ─── 10. Model javobida karta raqami/havola — yuborilmaydi, menejerga ────
{
  const m = build({ javob: { reply: 'Karta: 8600123456789012', sendCard: true } });
  const out = await m.r.reply('cv1', 'karta');
  check('karta raqamli javob yuborilmadi', m.yuborilgan.length === 0 && out.sent === false, JSON.stringify(m.yuborilgan));
  check('bunda tizim kartasi ham ketmadi', !m.qadamlar.includes('karta'));
  check('menejerga sabab bilan', m.patchlar.some((p) => p.needsHuman === true && p.humanReason === MAXFIY_SABAB) && out.escalated);
}
{
  const m = build({ javob: { reply: 'Mana', replySecond: 'Guruh: https://t.me/joinchat/XYZ' }, agentAutoReply: false });
  const out = await m.r.reply('cv1', 'havola?');
  check('havolali ikkinchi qism — qoralama ham saqlanmadi', !m.qadamlar.includes('qoralama') && out.escalated, JSON.stringify(m.qadamlar));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
