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

/**
 * Qo'lda ishga tushiriladi: npm run test:eskirgan-javob --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: 2026-08-17 kuni prodda mijoz ketma-ket ikkita deyarli bir xil
 * xabar oldi — ikkalasi ham summani tasdiqlab, o'sha "qaysi kun?" savolini
 * berdi. Debouncer aybdor emas: u o'z ishini qilgan (logda `count:2`).
 *
 * Sabab boshqa yerda edi. Navbat tarixni BOSHIDA bir marta o'qiydi, model
 * esa 40 soniyagacha ishlaydi. O'sha oraliqda mijoz yangi xabar yozdi —
 * lekin tayyor javob baribir yuborildi, garchi u allaqachon eskirgan
 * savolga javob bo'lsa ham. Keyingi navbat yangi xabarlarga javob berib,
 * o'sha tasdiqni va o'sha savolni TAKRORLADI.
 *
 * Qo'riqchi: xabar yuborilishidan oldin debouncer buferi so'raladi.
 * Kutayotgan xabar bor bo'lsa — javob yuborilmaydi va suhbat holati ham
 * tegilmaydi.
 *
 * NEGA AYNAN BUFER, `last_inbound_at` EMAS: buferdagi xabar keyingi
 * navbat ALBATTA bo'lishini kafolatlaydi, ya'ni mijoz javobsiz qolmaydi.
 * Bazadagi vaqt tamg'asi esa buni kafolatlamaydi — javob talab
 * qilmaydigan xabar ham (izohsiz stiker, KILL_SWITCH yoqilgan payt
 * kelgan xabar) uni o'zgartiradi. Unga qarab tayyor javobni tashlasak,
 * o'rniga hech narsa kelmasdi va mijoz umuman javobsiz qolardi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-17T15:31:19Z');
const SUHBAT_ID = 's1';
/** Navbat boshlanganda bazada turgan qiymat. */
const KIRUVCHI_ESKI = new Date('2026-08-17T15:31:02Z');
/** Model ishlayotgan payt kelgan xabar shu vaqtni yozadi. */
const KIRUVCHI_YANGI = new Date('2026-08-17T15:31:39Z');

const JAVOB: AgentTurnOutput = {
  reply: 'Xo\'p, yarmini deysiz — rahmat. Aniq qaysi kunga yozib qo\'yay?',
  replySecond: null,
  sessionId: 'sess-2',
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

/** `canAgentReply` ni qanoatlantiradi: yoqilgan, odam kutmayapti, yakunlanmagan. */
const SUHBAT_ASOSI = {
  id: SUHBAT_ID,
  clientId: 'm1',
  telegramAccountId: null,
  state: 'active',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: 'sess-1',
  lastInboundAt: KIRUVCHI_ESKI,
} as unknown as Conversation;

interface Kuzatuv {
  /** Telegramga KETGAN matnlar. */
  yuborilgan: string[];
  /** Qoralama sifatida bazaga yozilgan matnlar. */
  qoralamalar: string[];
  /** `conversations.update` chaqiruvlari — eskirgan navbat holatga tegmasligi kerak. */
  yangilanishlar: unknown[];
  /**
   * Narx daftariga tushgan yozuvlar. Yuborilgan matnlardan ALOHIDA yuriladi:
   * javob tashlansa ham tokenlar sarflangan, ya'ni yozuv bo'lishi shart.
   */
  narxYozuvlari: AgentUsageEntry[];
  kirganlar: number;
}

interface Rejim {
  /** Model "o'ylayotgan" paytda chaqiriladi — yangi xabar aynan shu yerda keladi. */
  oylayotganda: (() => void) | null;
  /** Debouncer buferida javob kutayotgan xabar bormi. */
  kutayotganBor: boolean;
}

function build(): {
  runner: AgentRunner;
  kuzatuv: Kuzatuv;
  rejim: Rejim;
  yangiXabarKeldi: () => void;
} {
  const kuzatuv: Kuzatuv = {
    yuborilgan: [],
    qoralamalar: [],
    yangilanishlar: [],
    narxYozuvlari: [],
    kirganlar: 0,
  };
  const rejim: Rejim = { oylayotganda: null, kutayotganBor: false };

  // Baza taqlidi: `findById` HAR SAFAR joriy holatni qaytaradi, ya'ni
  // navbat oxirida qayta o'qilgan qiymat boshidagidan farq qilishi mumkin.
  let suhbat: Conversation = SUHBAT_ASOSI;
  const yangiXabarKeldi = (): void => {
    suhbat = { ...suhbat, lastInboundAt: KIRUVCHI_YANGI };
  };

  const modelTaqlidi = async (_input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> => {
    kuzatuv.kirganlar += 1;
    // Model soniyalab ishlaydi — mijoz shu orada yozishi mumkin.
    rejim.oylayotganda?.();
    return JAVOB;
  };

  const engine = {
    respond: modelTaqlidi,
    composeFirstContact: modelTaqlidi,
    composeNudge: modelTaqlidi,
    composeReceiptConfirmed: modelTaqlidi,
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
      findById: async () => ({
        id: 'm1',
        fullName: 'Madinabonu Niyozova',
        firstName: 'Madinabonu',
        telegramStatus: null,
      }),
    } as unknown as IClientRepository,
    {
      findById: async () => suhbat,
      update: async (_id: string, patch: unknown) => {
        kuzatuv.yangilanishlar.push(patch);
      },
      markContactedIfNew: async () => undefined,
    } as unknown as IConversationRepository,
    {
      recentByConversation: async () => [],
      create: async ({ body }: { body: string }) => {
        kuzatuv.qoralamalar.push(body);
        return { id: 'x1' };
      },
    } as unknown as IMessageRepository,
    {
      send: async ({ body }: { body: string }) => {
        kuzatuv.yuborilgan.push(body);
      },
    } as unknown as MessageDispatcher,
    {
      get: async () => ({ agentAutoReply: true, personaName: 'Fotima' }),
    } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-17' } as unknown as IClock,
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

  // Haqiqiy hayotda bu `ReplyDebouncer` — u xabarni buferga qo'yib,
  // shu zahoti ketayotgan navbatni uzadi. Model uzilishni sezmagan
  // holatni ham qo'riqlashimiz kerak: shunda qo'riqchi oxirgi to'siq
  // bo'lib qoladi.
  runner.setPendingReplies({ hasPending: () => rejim.kutayotganBor });

  return { runner, kuzatuv, rejim, yangiXabarKeldi };
}

// ─── Model ishlayotganda kelgan xabar eskirgan javobni to'xtatadi ────────
{
  const { runner, kuzatuv, rejim, yangiXabarKeldi } = build();
  rejim.oylayotganda = () => {
    yangiXabarKeldi();
    rejim.kutayotganBor = true; // debouncer uni buferga qo'ydi
  };

  const natija = await runner.reply(SUHBAT_ID, 'Shu hafta yopamiz yarimini');

  check(
    'eskirgan javob Telegramga ketmadi',
    kuzatuv.yuborilgan.length === 0,
    JSON.stringify(kuzatuv.yuborilgan),
  );
  check('natija "yuborilmadi" deb qaytdi', natija.sent === false && natija.reply === null);
  check(
    'eskirgan javob qoralama bo\'lib ham qolmadi',
    kuzatuv.qoralamalar.length === 0,
    JSON.stringify(kuzatuv.qoralamalar),
  );
  check(
    'suhbat holati o\'zgartirilmadi',
    kuzatuv.yangilanishlar.length === 0,
    JSON.stringify(kuzatuv.yangilanishlar),
  );
  check(
    'sarflangan tokenlar baribir yozildi',
    kuzatuv.narxYozuvlari.length === 1,
    `${kuzatuv.narxYozuvlari.length} ta`,
  );
}

// ─── Javob talab qilmaydigan xabar tayyor javobni o'ldirmaydi ────────────
{
  const { runner, kuzatuv, rejim, yangiXabarKeldi } = build();
  // Mijoz stiker tashladi: `last_inbound_at` o'zgardi, lekin agentga
  // beriladigan matn yo'q — debouncer buferi bo'sh qoldi.
  rejim.oylayotganda = yangiXabarKeldi;

  const natija = await runner.reply(SUHBAT_ID, 'Shu hafta yopamiz yarimini');

  check(
    'javob kutayotgan xabar yo\'q — tayyor javob yuborildi',
    kuzatuv.yuborilgan.length === 1,
    JSON.stringify(kuzatuv.yuborilgan),
  );
  check('natija "yuborildi" deb qaytdi', natija.sent === true);
}

// ─── Yangi xabar kelmasa javob odatdagidek ketadi ────────────────────────
{
  const { runner, kuzatuv } = build();

  const natija = await runner.reply(SUHBAT_ID, 'Shu hafta yopamiz yarimini');

  check(
    'tinch navbatda javob yuborildi',
    kuzatuv.yuborilgan.length === 1 && kuzatuv.yuborilgan[0] === JAVOB.reply,
    JSON.stringify(kuzatuv.yuborilgan),
  );
  check('natija "yuborildi" deb qaytdi', natija.sent === true && natija.reply === JAVOB.reply);
  check(
    'holat yangilandi',
    kuzatuv.yangilanishlar.length === 1,
    JSON.stringify(kuzatuv.yangilanishlar),
  );
}

console.log(failed === 0 ? '\nHammasi joyida' : `\n${failed} ta tekshiruv yiqildi`);
process.exit(failed === 0 ? 0 : 1);
