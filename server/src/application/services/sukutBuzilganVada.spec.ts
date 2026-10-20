import { SilenceWatcher } from '@/application/services/SilenceWatcher';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut-buzilgan-vada --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * NEGA KERAK: "va'da berib to'lamadi" ssenariysi TO'QQIZTA vazifa
 * davomida yozilgan, lekin mijozga hech qachon yetib bormasdi.
 * `PromiseWatcher` va'dani buzilgan deb belgilaganda suhbatga
 * `needs_human` qo'yadi, sukut kuzatuvchisi esa bunday suhbatlarni
 * chetlab o'tardi — ya'ni bosim qilinishi kerak bo'lgan yagona holatda
 * agent jim qolardi. Bundan ham yomoni: operator qo'lda bir marta yozib
 * bayroqni tushirsa, mijoz esa jim qolsa, agent unga "xabarimni
 * ko'rdingizmi?" deb yozardi — so'zini buzgan mijozga.
 *
 * Shu sababli ikki tomon birga qo'riqlanadi:
 *   1) buzilgan va'dali suhbat NOMZOD bo'ladi va agent chaqiriladi;
 *      oddiy `needs_human` suhbat esa nomzod BO'LMAYDI (aks holda
 *      birinchi tekshiruv hech narsani isbotlamaydi — kuzatuvchi
 *      hammaga yozayotgan bo'lishi mumkin);
 *   2) agent chaqiruvida promptga buzilgan va'da TUSHADI — u
 *      `findActiveByConversation` dan kelmaydi, chunki `broken` va'da
 *      ochiq emas.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const HOZIR = t('2026-08-18T09:00:00'); // seshanba, 09:00 — ish oynasi ichida

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  peerId: null,
  peerAccessHash: null,
  state: 'negotiating',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  lastMessageAt: null,
  lastInboundAt: null,
  // Dushanba 10:00 — HOZIR (seshanba 09:00) gacha 1 ish kuni sukut.
  lastOutboundAt: t('2026-08-17T10:00:00'),
  unreadCount: 0,
  nudgeCount: 0,
  summary: null,
  createdAt: t('2026-08-17T10:00:00'),
  updatedAt: t('2026-08-17T10:00:00'),
  ...over,
});

const clock: IClock = { now: () => HOZIR, todayIso: () => '2026-08-18' };

// ── 1. Kuzatuvchi: qaysi suhbat nomzod bo'ladi ──────────────────────────
//
// Uchta suhbat bir vaqtda beriladi, chunki farqni faqat yonma-yon
// ko'rganda ishonch hosil qilish mumkin:
//   • cv1 — oddiy jim suhbat (nazorat namunasi, yozilishi kerak),
//   • cv2 — buzilgan va'da: `needs_human` YOQILGAN, lekin yozilishi kerak,
//   • cv3 — operator qo'lga olgan suhbat: yozilmasligi kerak.
{
  const suhbatlar: Record<string, Conversation> = {
    cv1: conv({ id: 'cv1' }),
    cv2: conv({
      id: 'cv2',
      needsHuman: true,
      humanKind: 'broken_promise',
      humanReason: 'Va\'da bajarilmadi: 5 000 000 so\'m, 2026-08-14',
    }),
    // `humanKind: null` — agentning eskalatsiyasi yoki operatorning o'z
    // belgisi. Bunday suhbatda odam allaqachon ishlayapti.
    cv3: conv({ id: 'cv3', needsHuman: true, humanKind: null }),
  };

  const bumped: string[] = [];
  const chaqiruvlar: Array<{ conversationId: string; attempt: number }> = [];

  const conversations = {
    // `findSilent` bazada `human_kind = 'broken_promise'` ni o'zi
    // o'tkazadi; bu yerda uchalasi ham beriladi, ya'ni saralash
    // kuzatuvchining o'z tekshiruviga qoladi.
    findSilent: async () => Object.values(suhbatlar),
    findById: async (id: string) => suhbatlar[id] ?? null,
    bumpNudgeCount: async (id: string) => {
      bumped.push(id);
    },
  } as unknown as IConversationRepository;

  const audit: AuditEntry[] = [];
  const watcher = new SilenceWatcher(
    conversations,
    { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    {
      silenceNudge: async (conversationId: string, attempt: number) => {
        chaqiruvlar.push({ conversationId, attempt });
        return { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };
      },
    } as unknown as AgentRunner,
    {
      get: async () => ({
        minDelaySec: 0,
        maxDelaySec: 0,
        windowStart: '00:00',
        windowEnd: '23:59',
        weekdays: [1, 2, 3, 4, 5, 6],
        killSwitch: false,
        silenceNudge: true,
        silenceNudgeDays: 1,
        silenceNudgeMax: 2,
      }),
    } as unknown as RuntimeSettings,
    {
      record: async (e: AuditEntry) => {
        audit.push(e);
      },
    } as unknown as IAuditRepository,
    clock,
    { list: async () => [] } as unknown as IHolidayRepository,
    { sukutdami: async () => false },
  );

  await watcher.nudge();

  const yozildi = (id: string): boolean => chaqiruvlar.some((c) => c.conversationId === id);

  check('oddiy jim suhbatga yozildi (nazorat)', yozildi('cv1'), JSON.stringify(chaqiruvlar));
  check(
    'buzilgan va\'dali suhbat NOMZOD bo\'ldi va agent chaqirildi',
    yozildi('cv2'),
    JSON.stringify(chaqiruvlar),
  );
  check(
    'buzilgan va\'dali suhbatning hisoblagichi oshirildi',
    bumped.includes('cv2'),
    JSON.stringify(bumped),
  );
  check(
    'operator qo\'lga olgan suhbatga YOZILMADI',
    !yozildi('cv3'),
    JSON.stringify(chaqiruvlar),
  );
  check(
    'operator qo\'lga olgan suhbatning hisoblagichi tegilmadi',
    !bumped.includes('cv3'),
    JSON.stringify(bumped),
  );
}

// ── 2. Agent chaqiruvi: buzilgan va'da promptga tushadimi ───────────────
//
// Kuzatuvchi o'tkazgani yetmaydi: `AgentRunner.silenceNudge` ham
// suhbatni rad etmasligi VA promptni to'g'ri to'ldirishi kerak. Buzilgan
// va'da `findActiveByConversation` dan KELMAYDI — u faqat ochiq
// va'dalarni qaytaradi.
//
// Ikkala tekshiruv bitta yordamchidan quriladi: farq faqat
// `findLatestByConversation` nima qaytarishida — R1 aynan shu qaytariq
// USTIDA qaror qabul qilishi kerak (holatni o'zi emas).
const buildRunner = (
  suhbat: Conversation,
  promises: IPaymentPromiseRepository,
): { silenceNudge: AgentRunner['silenceNudge']; kirganlar: Array<Omit<AgentTurnInput, 'incoming'>>; yuborilgan: string[] } => {
  const kirganlar: Array<Omit<AgentTurnInput, 'incoming'>> = [];
  const yuborilgan: string[] = [];

  const javob: AgentTurnOutput = {
    reply: 'Kelishuvimiz bo\'yicha to\'lov hali ko\'rinmadi.',
    replySecond: null,
    sessionId: null,
    promise: null,
    nextState: null,
    escalate: null,
    internalNote: null,
    lesson: null,
    clientMemory: null,
    usage: {
      model: 'claude-sonnet-5',
      inputTokens: 10,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.001,
      durationMs: 10,
    },
  };

  const engine = {
    composeSilenceNudge: async (input: Omit<AgentTurnInput, 'incoming'>) => {
      kirganlar.push(input);
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

  const runner = new AgentRunner(
    engines,
    {
      findById: async () => ({ id: 'cl1', fullName: 'Aziz Karimov', firstName: 'Aziz', telegramStatus: null }),
    } as unknown as IClientRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    { findById: async () => suhbat, update: async () => undefined } as unknown as IConversationRepository,
    {
      recentByConversation: async () => [],
      create: async () => ({ id: 'x1' }),
    } as unknown as IMessageRepository,
    promises,
    {
      send: async ({ body }: { body: string }) => {
        yuborilgan.push(body);
      },
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, personaName: 'Madina' }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    clock,
    {
      renderSections: async () => '',
      renderLessons: async () => '',
      renderClientMemory: async () => '',
    } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined } as unknown as IClientProfileRepository,
    {
      findUnpaidMonths: async () => [],
      listRecentPayments: async () => [],
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [] } as unknown as IHolidayRepository,
  );

  return { silenceNudge: runner.silenceNudge.bind(runner), kirganlar, yuborilgan };
};

const suhbatCv2 = conv({
  id: 'cv2',
  needsHuman: true,
  humanKind: 'broken_promise',
  humanReason: 'Va\'da bajarilmadi: 5 000 000 so\'m, 2026-08-14',
});

// ── 2a. Suhbatning ENG OXIRGI va'dasi buzilgan — qattiq ssenariy ────────
{
  const BUZILGAN = {
    id: 'v1',
    conversationId: 'cv2',
    clientId: 'cl1',
    amount: 5_000_000,
    promisedDate: new Date('2026-08-14T00:00:00Z'),
    status: 'broken',
    paidAmount: 0,
  } as unknown as PaymentPromise;

  const { silenceNudge, kirganlar, yuborilgan } = buildRunner(suhbatCv2, {
    // Ochiq va'da YO'Q — `PromiseWatcher` uni allaqachon 'broken' qilgan.
    findActiveByConversation: async () => null,
    findLatestByConversation: async () => BUZILGAN,
    updateStatus: async () => undefined,
    create: async () => ({ id: 'p1' }),
  } as unknown as IPaymentPromiseRepository);

  const natija = await silenceNudge('cv2', 1, false);

  check('agent buzilgan va\'dali suhbatni rad etmadi', kirganlar.length === 1, String(kirganlar.length));
  check('xabar mijozga ketdi', natija.sent && yuborilgan.length === 1, JSON.stringify(yuborilgan));
  check(
    'promptga buzilgan va\'da tushdi',
    kirganlar[0]?.brokenPromise?.amount === 5_000_000 &&
      kirganlar[0]?.brokenPromise?.date === '2026-08-14',
    JSON.stringify(kirganlar[0]?.brokenPromise),
  );
  check(
    'ochiq va\'da bo\'sh qoldi (ikkalasi birga to\'lmaydi)',
    kirganlar[0]?.openPromise === null,
    JSON.stringify(kirganlar[0]?.openPromise),
  );
}

// ── 2b. R1: eng oxirgi va'da BAJARILGAN, eskirak buzilgani bor ──────────
//
// `findLatestByConversation` bu holatda `kept` yozuvni qaytaradi (u
// SANA bo'yicha eng oxirgisi). Iyunda buzilgan, avgustda bajarilgan
// va'da — mijoz endi eskirgan da'vo bilan ayblanmasligi kerak:
// `brokenPromise` NULL bo'lishi, ya'ni "XABARNI O'QIB JAVOB BERMADI"
// bandi ishlatilishi shart (`userPrompt.ts`dagi `nudgeTask`ga qarang).
{
  const OXIRGI_BAJARILGAN = {
    id: 'v2',
    conversationId: 'cv2',
    clientId: 'cl1',
    amount: 3_000_000,
    promisedDate: new Date('2026-08-10T00:00:00Z'),
    status: 'kept',
    paidAmount: 3_000_000,
  } as unknown as PaymentPromise;

  const { silenceNudge, kirganlar } = buildRunner(suhbatCv2, {
    findActiveByConversation: async () => null,
    // Real repo'da bu ENG OXIRGI yozuv (promised_date DESC) — eskirgan
    // 'broken' emas, chunki mijoz shundan keyin yangi va'dani bajargan.
    findLatestByConversation: async () => OXIRGI_BAJARILGAN,
    updateStatus: async () => undefined,
    create: async () => ({ id: 'p1' }),
  } as unknown as IPaymentPromiseRepository);

  await silenceNudge('cv2', 1, false);

  check(
    'R1: eskirgan buzilgan va\'da ENDI da\'vo qilinmaydi (brokenPromise null)',
    kirganlar[0]?.brokenPromise === null,
    JSON.stringify(kirganlar[0]?.brokenPromise),
  );
  check(
    'R1: ochiq va\'da ham bo\'sh (kept — ochiq emas)',
    kirganlar[0]?.openPromise === null,
    JSON.stringify(kirganlar[0]?.openPromise),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
