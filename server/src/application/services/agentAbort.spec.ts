import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type {
  AgentUsageEntry,
  IAgentUsageRepository,
} from '@/domain/repositories/IAgentUsageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AbortedError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-abort --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: suhbatdagi "Agent" tugmasi bazadagi bayroqni o'zgartiradi,
 * `canAgentReply` esa uni navbat BOSHIDA o'qiydi. Ya'ni tugma kelasi
 * navbatni to'xtatardi, lekin AYNAN SHU PAYT yozilayotgan javobga ta'sir
 * qilmasdi: u oxirigacha borib, mijozga ketardi. Operator uchun bu
 * "o'chirdim, lekin baribir yozdi" bo'lib ko'rinadi — eng yomon xato.
 *
 * Bu sinov ikkita tirqishni birga qo'riqlaydi:
 *   1) model chaqiruvi yarim yo'lda uziladi (soniyalar emas, darhol);
 *   2) model tugab ULGURGAN, lekin xabar hali yuborilmagan oraliqda ham
 *      matn mijozga YETIB BORMAYDI.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-11T10:00:00Z');
const SUHBAT_ID = 's1';

/** Chegara saxiy: gap 999 ms emas, 30 000 ms dan yiroqligida. */
const DARHOL_MS = 1000;
/** Model shuncha "o'ylaydi" — uzilish ishlamasa sinov shu yerda qotib qolardi. */
const SEKIN_MS = 30_000;

/** Berilgan shart bajarilguncha kutamiz. */
async function kut(shart: () => boolean, nima: string, urinish = 200): Promise<void> {
  for (let i = 0; i < urinish; i += 1) {
    if (shart()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`kutilmadi: ${nima}`);
}

/** Navbat kuzatuvi — plombalarning hammasi shu yerda yig'iladi. */
interface Kuzatuv {
  /**
   * Har chaqiruvda engine olgan signal. `undefined` yozilib qolsa —
   * `withAbort` navbatni umuman ulamagan va butun himoya soxta.
   */
  signallar: Array<AbortSignal | undefined>;
  /** Modelga kirgan navbatlar soni. */
  kirganlar: number;
  /** Telegramga KETGAN matnlar. Bu ro'yxat bo'sh qolishi — sinovning asosiy sharti. */
  yuborilgan: string[];
  /**
   * Narx daftariga tushgan yozuvlar.
   *
   * Yuborilgan matnlardan ALOHIDA yuriladi: xabar ketmasa ham tokenlar
   * sarflangan, ya'ni yozuv bo'lishi shart.
   */
  narxYozuvlari: AgentUsageEntry[];
}

interface Rejim {
  /** Model qancha "o'ylaydi". */
  sekinMs: number;
  /**
   * Model uzilishni SEZMAYDI — javob oxirigacha yozilib qaytadi.
   *
   * Aynan shu holat `apply()` oldidagi qo'riqchini sinaydi: operator
   * tugmani bosgan, lekin generatsiya undan bir necha millisekund oldin
   * tugab bo'lgan. Qo'riqchi bo'lmasa tayyor matn mijozga ketardi.
   */
  abortniSezmaydi: boolean;
}

const JAVOB: AgentTurnOutput = {
  reply: 'Assalomu alaykum, to\'lov bo\'yicha gaplashsak bo\'ladimi?',
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
  usage: {
    model: 'claude-sonnet-5',
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 18_000,
    cacheWriteTokens: 0,
    costUsd: 0.0123,
    durationMs: 4200,
  },
};

/** `canAgentReply` ni qanoatlantiradigan suhbat: yoqilgan, odam kutmayapti, yakunlanmagan. */
const SUHBAT = {
  id: SUHBAT_ID,
  clientId: 'm1',
  telegramAccountId: null,
  state: 'active',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
} as unknown as Conversation;

function build(): { runner: AgentRunner; kuzatuv: Kuzatuv; rejim: Rejim } {
  const kuzatuv: Kuzatuv = { signallar: [], kirganlar: 0, yuborilgan: [], narxYozuvlari: [] };
  const rejim: Rejim = { sekinMs: 0, abortniSezmaydi: false };

  /** Model chaqiruvi taqlidi — to'rttala vazifa ham shundan o'tadi. */
  const modelTaqlidi = async (input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> => {
    kuzatuv.signallar.push(input.signal);
    kuzatuv.kirganlar += 1;
    const signal = input.signal;

    await new Promise<void>((resolve, reject) => {
      if (rejim.abortniSezmaydi) {
        setTimeout(resolve, rejim.sekinMs);
        return;
      }
      if (signal?.aborted) {
        reject(new AbortedError());
        return;
      }
      const timer = setTimeout(resolve, rejim.sekinMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new AbortedError());
        },
        { once: true },
      );
    });

    return JAVOB;
  };

  const engine = {
    respond: modelTaqlidi,
    composeFirstContact: modelTaqlidi,
    composeNudge: modelTaqlidi,
    composeReceiptConfirmed: modelTaqlidi,
  } as unknown as IAgentEngine;

  // `AgentRunner` endi dvigatelni `AgentEngineFactory` orqali oladi
  // (akkauntga qarab tanlagich). Sinovda akkaunt biriktirilmagan, shuning
  // uchun `forAccount` ham, `standart` ham xuddi shu sinov dvigatelini
  // qaytaradi — quyidagi ssenariylar avvalgidek ishlaydi.
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const runner = new AgentRunner(
    engines,
    {
      findById: async () => ({
        id: 'm1',
        fullName: 'Aziz Karimov',
        firstName: 'Aziz',
        telegramStatus: null,
      }),
    } as unknown as IClientRepository,
    {
      findById: async () => SUHBAT,
      update: async () => undefined,
    } as unknown as IConversationRepository,
    {
      recentByConversation: async () => [],
      create: async () => ({ id: 'x1' }),
    } as unknown as IMessageRepository,
    {
      // Plombaning o'zi: uzilgan navbatdan keyin bu yerga BITTA ham
      // matn tushmasligi kerak.
      send: async ({ body }: { body: string }) => {
        kuzatuv.yuborilgan.push(body);
      },
    } as unknown as MessageDispatcher,
    {
      get: async () => ({ agentAutoReply: true, personaName: 'Aziz' }),
    } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-11' } as unknown as IClock,
    {
      renderSections: async () => '',
      renderLessons: async () => '',
      renderClientMemory: async () => '',
    } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined } as unknown as IClientProfileRepository,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    {
      record: async (e: AgentUsageEntry) => {
        kuzatuv.narxYozuvlari.push(e);
      },
    } as unknown as IAgentUsageRepository,
    { list: async () => [], listKnowledge: async () => [] } as unknown as ICourseRepository,
    { joriyXarid: async () => null, tolanganKurslar: async () => [], kursBelgila: async () => null, bolibTolash: async () => false, bosqich: async () => null } as unknown as XaridXizmati,
    { yubor: async () => ({ sent: false }) } as unknown as KartaYuboruvchi,
  );

  return { runner, kuzatuv, rejim };
}

// ─── Ketayotgan navbat darhol uziladi va xabar ketmaydi ──────────────────
{
  const { runner, kuzatuv, rejim } = build();
  rejim.sekinMs = SEKIN_MS;

  const navbat = runner.reply(SUHBAT_ID, 'Bugun to\'layman');
  await kut(() => kuzatuv.kirganlar >= 1, 'navbat modelga kirmadi');

  check(
    'engine haqiqiy signal oldi',
    kuzatuv.signallar.length === 1 && kuzatuv.signallar[0] instanceof AbortSignal,
    JSON.stringify(kuzatuv.signallar.map((s) => typeof s)),
  );

  const boshlandi = Date.now();
  const uzilgan = runner.abort(SUHBAT_ID);
  let xato: unknown = null;
  await navbat.catch((err) => {
    xato = err;
  });
  const ketganMs = Date.now() - boshlandi;

  check('bitta navbat uzildi', uzilgan === 1, String(uzilgan));
  check('navbat AbortedError bilan tugadi', xato instanceof AbortedError, String(xato));
  check(
    `uzilish darhol sezildi (${ketganMs} ms)`,
    ketganMs < DARHOL_MS,
    `model chaqiruvi uzilmagan — ${ketganMs} ms kutildi`,
  );
  check(
    'mijozga hech narsa yuborilmadi',
    kuzatuv.yuborilgan.length === 0,
    JSON.stringify(kuzatuv.yuborilgan),
  );
  // Reyestr o'zini tozalamasa, uzoq ishlagan serverda u cheksiz o'sardi:
  // har suhbat uchun bo'sh `Set` xotirada abadiy qolib ketardi.
  check('navbat tugagach reyestr bo\'shadi', runner.abort(SUHBAT_ID) === 0);
}

// ─── Model TUGAB ULGURGAN bo'lsa ham matn yuborilmaydi ───────────────────
// Eng nozik holat: javob operator tugmani bosishidan bir necha millisekund
// oldin tayyor bo'ladi. Uzilish engine ichida sezilmaydi, ya'ni yagona
// himoya — `apply()` oldidagi qo'riqchi.
{
  const { runner, kuzatuv, rejim } = build();
  rejim.sekinMs = 50;
  rejim.abortniSezmaydi = true;

  const navbat = runner.reply(SUHBAT_ID, 'Ertaga to\'layman');
  await kut(() => kuzatuv.kirganlar >= 1, 'navbat modelga kirmadi');

  runner.abort(SUHBAT_ID);
  let xato: unknown = null;
  await navbat.catch((err) => {
    xato = err;
  });

  check('tayyor javob ham to\'xtatildi', xato instanceof AbortedError, String(xato));
  check(
    'tayyor matn mijozga ketmadi',
    kuzatuv.yuborilgan.length === 0,
    JSON.stringify(kuzatuv.yuborilgan),
  );
  // Pul ketgan — xabar ketmasa ham. Hisob buni ko'rsatishi shart, aks
  // holda haqiqiy xarajat past ko'rinadi.
  check(
    'xabar ketmasa ham narx yozildi',
    kuzatuv.narxYozuvlari.length === 1 && kuzatuv.narxYozuvlari[0]?.costUsd === 0.0123,
    JSON.stringify(kuzatuv.narxYozuvlari),
  );
}

// ─── Bo'sh suhbatni to'xtatish xato bermaydi ─────────────────────────────
{
  const { runner } = build();
  let tashladi = false;
  let natija = -1;
  try {
    natija = runner.abort('boshqa-id');
  } catch {
    tashladi = true;
  }
  check('ketayotgan navbatsiz suhbat nolni qaytardi', natija === 0, String(natija));
  check('xato tashlamadi', !tashladi);
}

// ─── Bitta suhbatdagi IKKITA navbat ham uziladi ──────────────────────────
// Eslatma bilan kiruvchi xabar ustma-ust tushishi mumkin. Faqat
// oxirgisi to'xtasa, ikkinchi javob baribir mijozga ketardi.
{
  const { runner, kuzatuv, rejim } = build();
  rejim.sekinMs = SEKIN_MS;

  const birinchi = runner.reply(SUHBAT_ID, 'Salom');
  const ikkinchi = runner.nudge(SUHBAT_ID, 'qiziqdi');
  await kut(() => kuzatuv.kirganlar >= 2, 'ikkala navbat ham modelga kirmadi');

  const uzilgan = runner.abort(SUHBAT_ID);
  const natijalar = await Promise.allSettled([birinchi, ikkinchi]);

  check('ikkala navbat ham uzildi', uzilgan === 2, String(uzilgan));
  check(
    'ikkalasi ham AbortedError bilan tugadi',
    natijalar.every((r) => r.status === 'rejected' && r.reason instanceof AbortedError),
    JSON.stringify(natijalar.map((r) => r.status)),
  );
  check(
    'ikkalasi ham signal oldi',
    kuzatuv.signallar.length === 2 && kuzatuv.signallar.every((s) => s instanceof AbortSignal),
  );
  check('mijozga hech narsa yuborilmadi', kuzatuv.yuborilgan.length === 0);
  check('reyestr to\'liq bo\'shadi', runner.abort(SUHBAT_ID) === 0);
}

// ─── To'xtatilmagan navbat odatdagidek yakunlanadi ───────────────────────
// Himoya oddiy javobni ham bo'g'ib qo'ymasligi kerak.
{
  const { runner, kuzatuv } = build();

  const natija = await runner.reply(SUHBAT_ID, 'Qancha to\'lovim bor?');

  check('javob yuborildi', natija.sent === true, JSON.stringify(natija));
  check('matn dispetcherga yetdi', kuzatuv.yuborilgan.length === 1, String(kuzatuv.yuborilgan.length));
  check('matn o\'sha javobning o\'zi', kuzatuv.yuborilgan[0] === JAVOB.reply);
  check('tugagach reyestr bo\'shadi', runner.abort(SUHBAT_ID) === 0);
  // Narx daftari o'lchov uchun asos: yozuv tushmasa, bir hafta kuzatib
  // ham bo'sh jadval qolardi va buni faqat oxirida sezardik.
  const narx = kuzatuv.narxYozuvlari[0];
  check(
    'narx yozuvi tushdi',
    kuzatuv.narxYozuvlari.length === 1 && narx?.mode === 'reply' && narx?.model === 'claude-sonnet-5',
    JSON.stringify(kuzatuv.narxYozuvlari),
  );
  check(
    'tokenlar o\'zgarmasdan o\'tdi',
    narx?.inputTokens === 1200 && narx?.outputTokens === 300 && narx?.cacheReadTokens === 18_000,
    JSON.stringify(narx),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
