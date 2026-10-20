import { SilenceWatcher } from '@/application/services/SilenceWatcher';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';

/**
 * Qo'lda ishga tushiriladi: npm run test:silence-watcher-pause --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * Bu test kod o'qish orqali tuzatilgan xatoni QOTIB QOLADIGAN qilib
 * ushlaydi: inbound tekshiruvi tasodifiy pauzadan OLDIN turgani uchun,
 * mijoz aynan o'sha 1-3 daqiqalik kutish paytida javob yozsa ham, unga
 * baribir "sukut" xabari ketardi. Bu — bu funksiya chiqarishi mumkin bo'lgan
 * ENG QIMMAT xato: javob yozgan mijozga ta'qib qilingandek tuyuladigan
 * xabar yuborish. Kod o'qish keyingi refaktoringda buni tutmaydi, shuning
 * uchun tartib shu yerda tekshiriladi.
 */
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const HOZIR = t('2026-08-18T09:00:00'); // seshanba, 09:00 — ish oynasi ichida

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  peerId: null,
  peerAccessHash: null,
  state: 'contacted',
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

/** Soxta suhbatlar ombori — `findById` HAR BIR id uchun alohida navbat bo'yicha javob beradi. */
class FakeConversations {
  findByIdCalls: string[] = [];
  bumped: string[] = [];
  private readonly queues: Map<string, Array<Conversation | null>>;

  constructor(
    private readonly silent: Array<{ id: string }>,
    queues: Record<string, Array<Conversation | null>>,
  ) {
    this.queues = new Map(Object.entries(queues).map(([id, seq]) => [id, [...seq]]));
  }

  /** `findSilent` ga berilgan argumentlar — talabnoma SQL filtri uchun bugungi sana. */
  findSilentArgs: unknown[][] = [];

  async findSilent(...args: unknown[]): Promise<Conversation[]> {
    this.findSilentArgs.push(args);
    return this.silent as unknown as Conversation[];
  }

  async findById(id: string): Promise<Conversation | null> {
    this.findByIdCalls.push(id);
    const q = this.queues.get(id);
    if (!q || !q.length) return null;
    return q.shift() as Conversation | null;
  }

  async bumpNudgeCount(id: string): Promise<void> {
    this.bumped.push(id);
  }
}

class FakePromises {
  // Ochiq va'da yo'q — bu test faqat sukut/pauza tartibini tekshiradi.
  async findActiveByConversation(): Promise<null> {
    return null;
  }
}

class FakeContracts {
  // Shartnoma yo'q — `kechikishYopildi([], threshold)` bo'sh ro'yxatda
  // har doim false qaytaradi (threshold qanday bo'lishidan qat'i nazar),
  // ya'ni to'siq bo'lmaydi.
  async findByClientId(): Promise<[]> {
    return [];
  }
}

class FakeAudit {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class FakeAgent {
  calls: Array<{ conversationId: string; attempt: number }> = [];
  async silenceNudge(conversationId: string, attempt: number): Promise<AgentTurnResult> {
    this.calls.push({ conversationId, attempt });
    return { sent: true, reply: 'qayta murojaat matni', escalated: false, promiseRecorded: false };
  }
}

class FakeSettings {
  async get() {
    return {
      dailyLimit: 100,
      // Pauza NOLGA tenglashtirilgan: haqiqiy `sleep()` deyarli darhol
      // tugaydi, ya'ni test soniyalab kutmaydi, lekin kod yo'li (sleep →
      // qayta o'qish) ishlab chiqilgan holicha ishlayveradi.
      minDelaySec: 0,
      maxDelaySec: 0,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6],
      killSwitch: false,
      agentAutoReply: true,
      personaName: 'Test',
      promiseReminder: true,
      promiseReminderUntil: '12:00',
      promiseThanksUntil: '18:00',
      silenceNudge: true,
      silenceNudgeDays: 1,
      silenceNudgeMax: 2,
      gateMessageMinSec: 0,
      gateMessageMaxSec: 0,
      gateOtherMinSec: 0,
      gateOtherMaxSec: 0,
    };
  }
}

const clock: IClock = {
  now: () => HOZIR,
  todayIso: () => '2026-08-18',
};

const asConversations = (c: FakeConversations): IConversationRepository =>
  c as unknown as IConversationRepository;
const asPromises = (p: FakePromises): IPaymentPromiseRepository => p as unknown as IPaymentPromiseRepository;
const asContracts = (c: FakeContracts): IContractRepository => c as unknown as IContractRepository;
const asAudit = (a: FakeAudit): IAuditRepository => a as unknown as IAuditRepository;
const asAgent = (a: FakeAgent): AgentRunner => a as unknown as AgentRunner;
const asSettings = (s: FakeSettings): RuntimeSettings => s as unknown as RuntimeSettings;
// Bu sinovda bayramlar ahamiyatsiz — doim bo'sh ro'yxat qaytadi.
const holidays: IHolidayRepository = { list: async () => [] } as unknown as IHolidayRepository;
// Talabnoma sukuti yo'q — eski holatlar avvalgidek ishlaydi.
const sukutYoq: ITalabnomaSukuti = { sukutdami: async () => false };

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

// ── 1. Pauza paytida mijoz javob yozadi — cv2 ga xabar KETMASLIGI kerak ──
//
// cv1 birinchi nomzod: sukutda, yuboriladi (`sent` 0 dan 1 ga o'tadi — bu
// cv2 uchun pauzani yoqadigan shart). cv2 ikkinchi nomzod: DASTLABKI
// o'qishda hali sukutda ko'rinadi (qaror "ha" bo'ladi, pauza boshlanadi),
// lekin pauzadan KEYINGI qayta o'qishda `lastInboundAt` endi
// `lastOutboundAt` dan keyingi — mijoz aynan shu pauza ichida javob yozib
// ulgurgan. Tuzatilgan kod bumpNudgeCount/agent.silenceNudge'ni cv2 uchun
// CHAQIRMASLIGI kerak.
{
  const conversations = new FakeConversations([{ id: 'cv1' }, { id: 'cv2' }], {
    cv1: [conv({ id: 'cv1' })],
    cv2: [
      conv({ id: 'cv2' }), // dastlabki o'qish — hali sukutda
      conv({
        id: 'cv2',
        lastInboundAt: t('2026-08-18T09:05:00'), // pauza ichida javob yozgan
        lastOutboundAt: t('2026-08-17T10:00:00'),
      }),
    ],
  });
  const agent = new FakeAgent();
  const audit = new FakeAudit();
  const watcher = new SilenceWatcher(
    asConversations(conversations),
    asPromises(new FakePromises()),
    asContracts(new FakeContracts()),
    asAgent(agent),
    asSettings(new FakeSettings()),
    asAudit(audit),
    clock,
    holidays,
    sukutYoq,
  );

  const sent = await watcher.nudge();

  check("cv1'ga yuborildi", agent.calls.some((c) => c.conversationId === 'cv1'));
  check("cv1 hisoblagichi oshirildi", conversations.bumped.includes('cv1'));
  check(
    "cv2'ga XABAR KETMADI (mijoz pauzada javob yozgan)",
    !agent.calls.some((c) => c.conversationId === 'cv2'),
    JSON.stringify(agent.calls),
  );
  check(
    "cv2 hisoblagichi OSHIRILMADI",
    !conversations.bumped.includes('cv2'),
    JSON.stringify(conversations.bumped),
  );
  check('jami 1 ta yuborildi', sent === 1, String(sent));
}

// ── 2. Ko'zgu holat: pauzadan keyin ham cv2 hali sukutda ─────────────────
//
// 1-holatning o'zi yetarli emas: agar kuzatuvchi HECH KIMGA yozmasa ham
// (masalan yangi xato tufayli), yuqoridagi tekshiruvlar baribir "o'tdi"
// deb ko'rinardi. Shu sabab bu holat ikkalasiga ham — cv1 VA cv2 — xabar
// ketishini alohida tasdiqlaydi.
{
  const conversations = new FakeConversations([{ id: 'cv1' }, { id: 'cv2' }], {
    cv1: [conv({ id: 'cv1' })],
    cv2: [conv({ id: 'cv2' }), conv({ id: 'cv2' })], // ikkala o'qishda ham hamon sukutda
  });
  const agent = new FakeAgent();
  const audit = new FakeAudit();
  const watcher = new SilenceWatcher(
    asConversations(conversations),
    asPromises(new FakePromises()),
    asContracts(new FakeContracts()),
    asAgent(agent),
    asSettings(new FakeSettings()),
    asAudit(audit),
    clock,
    holidays,
    sukutYoq,
  );

  const sent = await watcher.nudge();

  check(
    "cv1'ga BITTA marta yuborildi",
    agent.calls.filter((c) => c.conversationId === 'cv1').length === 1,
    JSON.stringify(agent.calls),
  );
  check(
    "cv2'ga ham BITTA marta yuborildi",
    agent.calls.filter((c) => c.conversationId === 'cv2').length === 1,
    JSON.stringify(agent.calls),
  );
  check(
    "ikkala hisoblagich ham bittadan oshirildi",
    conversations.bumped.filter((id) => id === 'cv1').length === 1 &&
      conversations.bumped.filter((id) => id === 'cv2').length === 1,
    JSON.stringify(conversations.bumped),
  );
  check('jami 2 ta yuborildi', sent === 2, String(sent));
}

// ── 3. R3: to'xtatish so'rovi PAUZA ICHIDA keladi ────────────────────────
//
// `stop()` chaqirilishi mumkin bo'lgan eng yomon payt — 1-3 daqiqalik
// pauzaning O'ZI ichida (tsikl boshidagi tekshiruv buni ko'rmaydi, chunki
// u pauzadan OLDIN o'tgan). Tuzatilmagan kodda `stop()` butun qolgan
// pauza + undan keyingi agent chaqiruvini kutib turardi — systemd ning
// SIGTERM keyingi majburiy o'ldirish oralig'idan (odatda 90s) oshib
// ketishi mumkin edi. Haqiqiy vaqt o'tishini tekshirish uchun pauza
// ATAYLAB nolmas (50ms): `stop()` aynan shu oraliqda, 10ms da chaqiriladi.
{
  const conversations = new FakeConversations([{ id: 'cv1' }, { id: 'cv2' }], {
    cv1: [conv({ id: 'cv1' })],
    // cv2 ikkala o'qishda ham hamon sukutda (2-holatdagi "ko'zgu" bilan
    // BIR XIL) — `stopping` bo'lmasa, tuzatilmagan kod baribir cv2'ga
    // yozardi. Ya'ni bu yerda cv2'ga YOZILMASLIGI faqat `stopping`
    // tekshiruvining o'zi bilan izohlanishi kerak, qayta o'qishning
    // "eskirgani" bilan emas.
    cv2: [conv({ id: 'cv2' }), conv({ id: 'cv2' })],
  });
  const agent = new FakeAgent();
  const audit = new FakeAudit();
  const settings = new FakeSettings();
  // Pauzani real vaqtga cho'zamiz — aks holda `stop()` ni "pauza ichida"
  // chaqirishning ma'nosi yo'q.
  (settings as unknown as { get: () => Promise<Record<string, unknown>> }).get = async () => ({
    ...(await new FakeSettings().get()),
    minDelaySec: 0.05,
    maxDelaySec: 0.05,
  });
  const watcher = new SilenceWatcher(
    asConversations(conversations),
    asPromises(new FakePromises()),
    asContracts(new FakeContracts()),
    asAgent(agent),
    asSettings(settings),
    asAudit(audit),
    clock,
    holidays,
    sukutYoq,
  );

  const partiya = watcher.nudge();
  // 10ms — pauzaning (50ms) o'rtasida, aniq ICHIDA. `stop()` o'zi
  // `inflight` ni kutadi, ya'ni bu `await` `partiya` tugaguncha qaytmaydi.
  const toxtatish = new Promise<void>((resolve) => {
    setTimeout(() => {
      void watcher.stop().then(resolve);
    }, 10);
  });

  const [sent] = await Promise.all([partiya, toxtatish]);

  check("cv1'ga yuborildi", agent.calls.some((c) => c.conversationId === 'cv1'));
  check(
    "cv2'ga XABAR KETMADI (to'xtatish pauza ichida keldi)",
    !agent.calls.some((c) => c.conversationId === 'cv2'),
    JSON.stringify(agent.calls),
  );
  check(
    "cv2 hisoblagichi OSHIRILMADI",
    !conversations.bumped.includes('cv2'),
    JSON.stringify(conversations.bumped),
  );
  check('jami 1 ta yuborildi', sent === 1, String(sent));
}

// ── 4. Talabnoma muddati: agent o'zi yozmaydi ───────────────────────────
//
// cl2 mijozda muddati tugamagan talabnoma bor — cv2 nomzod bo'lsa ham
// agent chaqirilmaydi va hisoblagich oshmaydi (muddatdan keyin zanjir
// shu joyidan davom etadi). cv1 — nazorat: sukut yo'q, yoziladi.
{
  const conversations = new FakeConversations([{ id: 'cv1' }, { id: 'cv2' }], {
    cv1: [conv({ id: 'cv1' })],
    cv2: [conv({ id: 'cv2', clientId: 'cl2' }), conv({ id: 'cv2', clientId: 'cl2' })],
  });
  const agent = new FakeAgent();
  const sorovlar: Array<{ clientId: string; today: string }> = [];
  const sukut: ITalabnomaSukuti = {
    sukutdami: async (clientId, today) => {
      sorovlar.push({ clientId, today });
      return clientId === 'cl2';
    },
  };
  const watcher = new SilenceWatcher(
    asConversations(conversations),
    asPromises(new FakePromises()),
    asContracts(new FakeContracts()),
    asAgent(agent),
    asSettings(new FakeSettings()),
    asAudit(new FakeAudit()),
    clock,
    holidays,
    sukut,
  );

  const sent = await watcher.nudge();

  check("talabnoma: sukutsiz cv1'ga yozildi", agent.calls.some((c) => c.conversationId === 'cv1'));
  check(
    "talabnoma: muddat ichidagi cv2'ga agent CHAQIRILMADI",
    !agent.calls.some((c) => c.conversationId === 'cv2'),
    JSON.stringify(agent.calls),
  );
  check("talabnoma: cv2 hisoblagichi oshirilmadi", !conversations.bumped.includes('cv2'), JSON.stringify(conversations.bumped));
  check('talabnoma: bugungi sana bilan so\'raldi', sorovlar.some((x) => x.clientId === 'cl2' && x.today === '2026-08-18'), JSON.stringify(sorovlar));
  check('talabnoma: jami 1 ta yuborildi', sent === 1, String(sent));
  // NEGA: koddagi tekshiruv yetmaydi — sukutdagi mijozlar 60 talik nomzod
  // ro'yxatini egallab, navbatni tiqib qo'yardi. SQL ularni oldindan chiqaradi.
  check(
    'talabnoma: findSilent ga bugungi sana berildi (SQL filtri)',
    conversations.findSilentArgs[0]?.[3] === '2026-08-18',
    JSON.stringify(conversations.findSilentArgs),
  );
}

// ── 5. Talabnoma PAUZA ichida yuborildi — qayta tekshiruv ushlaydi ───────
{
  const conversations = new FakeConversations([{ id: 'cv1' }, { id: 'cv2' }], {
    cv1: [conv({ id: 'cv1' })],
    cv2: [conv({ id: 'cv2', clientId: 'cl2' }), conv({ id: 'cv2', clientId: 'cl2' })],
  });
  const agent = new FakeAgent();
  let cl2Sorov = 0;
  const sukut: ITalabnomaSukuti = {
    // Birinchi so'rovda hali yo'q, pauzadan keyingisida bor.
    sukutdami: async (clientId) => clientId === 'cl2' && ++cl2Sorov > 1,
  };
  const watcher = new SilenceWatcher(
    asConversations(conversations),
    asPromises(new FakePromises()),
    asContracts(new FakeContracts()),
    asAgent(agent),
    asSettings(new FakeSettings()),
    asAudit(new FakeAudit()),
    clock,
    holidays,
    sukut,
  );

  await watcher.nudge();

  check(
    "talabnoma: pauzada yuborilgan talabnoma cv2'ni to'xtatdi",
    !agent.calls.some((c) => c.conversationId === 'cv2') && !conversations.bumped.includes('cv2'),
    JSON.stringify({ calls: agent.calls, bumped: conversations.bumped }),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
