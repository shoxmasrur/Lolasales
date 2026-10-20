import {
  BulkConversationStart,
  type BulkStartJob,
} from '@/application/services/BulkConversationStart';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-spread --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: sur'at ilgari akkauntlarning kunlik limitidan chiqardi va
 * tanlangan mijozlar sonidan bexabar edi — 6 ta mijoz ham butun kunga
 * cho'zilardi. Bu sinov operator belgilagan tugash soati sur'atga
 * ROSTDAN ta'sir qilishini va bo'luvchi "xabar ketadiganlar" soni
 * ekanini qo'riqlaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

/** 05:00 UTC = 10:00 Toshkent. */
const NOW = new Date('2026-08-14T05:00:00Z');

const BOSH_COUNTS = {
  ready: 0,
  needs_lookup: 0,
  name_mismatch: 0,
  already_started: 0,
  no_phone: 0,
  do_not_contact: 0,
  blocked: 0,
};

interface Sozlama {
  /** Har mijoz uchun `execute` qaytaradigan holat. */
  natija?: 'started' | 'skipped';
  /** `previewBulkStart` qaytaradigan sonlar. */
  counts?: Partial<typeof BOSH_COUNTS>;
  minDelaySec?: number;
  maxDelaySec?: number;
  /**
   * Ulangan akkauntlarning kunlik limitlari — kunlik sig'imni (`dailySends`)
   * boshqarish uchun. Sukut bo'yicha bo'sh: kunlik sig'im nol, ya'ni eski
   * yo'lda `meanDelayMs` `null` qaytaradi va `spreadUntil` ta'siri toza
   * ko'rinadi.
   */
  dailyLimits?: number[];
  /** Sur'at oynasi — sukut butun kun (00:00-23:59). */
  windowStart?: string;
  windowEnd?: string;
}

let previewChaqirildi = 0;

function build(s: Sozlama = {}): BulkConversationStart {
  previewChaqirildi = 0;

  const startConversation = {
    execute: async () =>
      s.natija === 'skipped'
        ? { status: 'skipped', reason: 'Sinov uchun o\'tkazib yuborildi' }
        : { status: 'started' },
  } as unknown as StartConversationUseCase;

  const settings = {
    get: async () => ({
      killSwitch: false,
      windowStart: s.windowStart ?? '00:00',
      windowEnd: s.windowEnd ?? '23:59',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      minDelaySec: s.minDelaySec ?? 60,
      maxDelaySec: s.maxDelaySec ?? 60,
      outreachDailyLimit: 1000,
    }),
  } as unknown as RuntimeSettings;

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: null }),
    previewBulkStart: async () => {
      previewChaqirildi += 1;
      return { total: 0, counts: { ...BOSH_COUNTS, ...(s.counts ?? {}) }, mismatches: [], accountPlan: [], reassigned: 0 };
    },
  } as unknown as IClientRepository;


  const accounts = {
    listConnected: async () =>
      (s.dailyLimits ?? []).map((dailyLimit, i) => ({
        id: `acc${i}`,
        isEnabled: true,
        status: 'connected',
        floodWaitUntil: null,
        spamStatus: 'clean',
        spamUntil: null,
        counterDate: null,
        sentToday: 0,
        dailyLimit,
      })),
    list: async () => [],
  } as unknown as ITelegramAccountRepository;

  return new BulkConversationStart(
    startConversation,
    settings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-14' } as unknown as IClock,
    {} as unknown as BulkStartPlanner,
    clients,
    accounts,
    { labelOf: () => null } as unknown as AccountLabels,
  );
}

async function tugashiniKut(bulk: BulkConversationStart, urinish = 300): Promise<BulkStartJob> {
  for (let i = 0; i < urinish; i += 1) {
    const job = bulk.current();
    if (job && job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  const oxirgi = bulk.current();
  if (!oxirgi) throw new Error('ish umuman boshlanmadi');
  return oxirgi;
}

/** Sur'at hisoblangunicha kutamiz — u tsikldan OLDIN bir marta qo'yiladi. */
async function paceniKut(bulk: BulkConversationStart): Promise<BulkStartJob> {
  for (let i = 0; i < 300; i += 1) {
    const job = bulk.current();
    if (job && (job.paceMinutes !== null || job.done > 0 || job.status !== 'running')) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("sur'at hisoblanmadi");
}

// ─── 1. Tugash soati sur'atni belgilaydi ─────────────────────────────────
{
  // 10:00 → 12:00 = 120 daqiqa, 6 ta yuborish → 20 daqiqa.
  const bulk = build({ counts: { ready: 6 } });
  bulk.start(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], 'j1', { spreadUntil: '12:00' });

  const job = await paceniKut(bulk);
  check("sur'at 20 daqiqa", job.paceMinutes === 20, String(job.paceMinutes));
  check('preview bir marta so\'raldi', previewChaqirildi === 1, String(previewChaqirildi));

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 2. Bo'luvchi — xabar ketadiganlar soni ──────────────────────────────
// 12 ta tanlangan, lekin faqat 4 tasiga xabar ketadi (6 tasi "sotilmagan",
// 2 tasi ism mos kelmagani uchun). 120 / 4 = 30 daqiqa.
{
  const bulk = build({ counts: { ready: 4, already_started: 6, name_mismatch: 2 } });
  bulk.start(
    ['c1','c2','c3','c4','c5','c6','c7','c8','c9','c10','c11','c12'],
    'j2',
    { spreadUntil: '12:00' },
  );

  const job = await paceniKut(bulk);
  check("12 tanlangan, 4 ketadi → 30 daqiqa", job.paceMinutes === 30, String(job.paceMinutes));

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 3. allowNameMismatch bo'luvchini oshiradi ───────────────────────────
// O'sha ro'yxat, lekin ism mos kelmaganlarga ham yuboriladi: 4 + 2 = 6.
{
  const bulk = build({ counts: { ready: 4, already_started: 6, name_mismatch: 2 } });
  bulk.start(
    ['c1','c2','c3','c4','c5','c6','c7','c8','c9','c10','c11','c12'],
    'j3',
    { spreadUntil: '12:00', allowNameMismatch: true },
  );

  const job = await paceniKut(bulk);
  check('ism mos kelmaganlar qo\'shildi → 20 daqiqa', job.paceMinutes === 20, String(job.paceMinutes));

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 4. O'tkazib yuborilgandan keyin pauza yo'q ──────────────────────────
// Eski xatti-harakatda 3 ta o'tkazib yuborilgan mijoz 2 × 60 soniya
// bo'sh kutish demakdi va taqsimot oynasi behuda sarflanardi.
{
  const bulk = build({ natija: 'skipped', counts: { ready: 3 }, minDelaySec: 60, maxDelaySec: 60 });
  const boshlandi = Date.now();
  bulk.start(['c1', 'c2', 'c3'], 'j4', { spreadUntil: '12:00' });

  const job = await tugashiniKut(bulk);
  const ketganMs = Date.now() - boshlandi;

  check('ish tugadi', job.status === 'done', job.status);
  check('uchalasi ham o\'tkazib yuborildi', job.skipped === 3, String(job.skipped));
  check(`bo'sh pauza qilinmadi (${ketganMs} ms)`, ketganMs < 1000, `${ketganMs} ms kutildi`);
}

// ─── 5. spreadUntil yo'q → eski yo'l, preview so'ralmaydi ────────────────
{
  const bulk = build({ minDelaySec: 0, maxDelaySec: 0 });
  bulk.start(['c1', 'c2'], 'j5');

  const job = await tugashiniKut(bulk);
  check('eski yo\'lda ish tugadi', job.status === 'done', job.status);
  check('sig\'im nol → sur\'at null', job.paceMinutes === null, String(job.paceMinutes));
  check('preview umuman so\'ralmadi', previewChaqirildi === 0, String(previewChaqirildi));
}

// ─── 6. O'tib ketgan soat ishni to'xtatmaydi, kunlik oyna sur'atiga o'tadi
// Yumshoq mo'ljal: soat o'tgan bo'lsa ham qolganlari yuboriladi. Ilgari bu
// sinov faqat `paceMinutes === null`ni tekshirardi, lekin buni faqat
// ulangan akkaunt yo'qligi (dailySends === 0 → meanDelayMs ham null)
// ta'minlardi — filial haqiqatan ISHLAMASA HAM o'tardi. Endi ulangan
// akkaunt BOR (dailySends > 0), shuning uchun `spreadMeanMs` null qaytarsa
// ham `taqsimotOrtachasi` jim qolmay kunlik oyna sur'atiga (`meanDelayMs`)
// tushishi va buni `paceMinutes` orqali ko'rsatishi shart.
{
  // Sur'at oynasi 09:59-10:05 (6 daqiqa) — hozirgi vaqt (10:00) shu ichida,
  // ish vaqti darvozasi yopilib qolmasin. Kunlik sig'im juda katta
  // (100000), shuning uchun kunlik oyna sur'ati mikrosoniyalarda — sinov
  // haqiqiy vaqtda TEZ tugaydi.
  const bulk = build({
    counts: { ready: 2 },
    minDelaySec: 0,
    maxDelaySec: 0,
    dailyLimits: [100_000],
    windowStart: '09:59',
    windowEnd: '10:05',
  });
  bulk.start(['c1', 'c2'], 'j6', { spreadUntil: '09:00' });

  const job = await tugashiniKut(bulk);
  check('o\'tgan soatda ham tugadi', job.status === 'done', job.status);
  check('ikkalasiga ham xabar ketdi', job.started === 2, String(job.started));
  // 6 daqiqa / 100000 kunlik sig'im ≈ 3.6ms → 0 daqiqaga yaxlitlanadi,
  // lekin MUHIMI: `null` EMAS — kunlik oyna sur'ati amalda ishlatildi.
  check(
    'sur\'at null emas — kunlik oyna sur\'atiga tushdi',
    job.paceMinutes !== null,
    String(job.paceMinutes),
  );
}

// ─── 7. Qo'lda taqsimot (perAccount) bo'luvchini chegaralaydi ───────────
// Operator 100 ta mijoz tanlab, "bugun faqat shuncha" deb bitta akkauntga
// 30 tasini yozgan. Qolgan 70 tasi `planManualSplit` tomonidan
// biriktirilmay qoladi va `not_assigned` sifatida pauzasiz o'tkazib
// yuboriladi. Bo'luvchi shuni hisobga olmasa (100 bo'lib qolsa), ish
// operator kutganidan TEZROQ tugaydi — bu esa spam filtri xavfi.
{
  // 120 daqiqalik oyna, chegara 30 → 120 / 30 = 4 daqiqa (120 / 100 = 1.2
  // daqiqa EMAS).
  const bulk = build({ counts: { ready: 100 } });
  bulk.start(
    Array.from({ length: 100 }, (_, i) => `c${i}`),
    'j7',
    { spreadUntil: '12:00', perAccount: { 'acc-uuid-1': 30 } },
  );

  const job = await paceniKut(bulk);
  check(
    'bo\'luvchi perAccount yig\'indisiga chegaralandi → 4 daqiqa',
    job.paceMinutes === 4,
    String(job.paceMinutes),
  );

  bulk.stop();
  await tugashiniKut(bulk);
}

// ─── 8. Hisoblangan o'rtacha haqiqatan `nextDelayMs`ga yetib boradi ──────
// Oldingi sinovlar faqat sof funksiyani yoki `paceMinutes`ni tekshiradi —
// hech biri `taqsimotOrtachasi` natijasi `nextDelayMs`ga uzatilib, HAQIQIY
// pauza hosil qilishini isbotlamaydi. Bu yerda birinchi mijoz yuborilgach
// qo'yilgan `nextAt`ni o'qib, oraliq pastki (`minDelaySec`) va yuqori
// (`CAP_FACTOR × mean`) chegaralar ichida ekanini tekshiramiz.
//
// SINOV "THREADING YO'Q" HOLATDA QANDAY YIQILADI: ataylab bitta ulangan
// akkaunt kunlik limiti 1 qilib qo'yilgan (`dailyLimits: [1]`) va oyna
// butun kun (00:00-23:59, sukut). Agar `meanMs` `nextDelayMs`ga
// UZATILMASA, u ichkarida o'zi `meanDelayMs('00:00','23:59', 1)` ni
// hisoblab oladi — bu esa ≈1439 daqiqa (~24 soat!), ya'ni yuqori
// chegaramizdan (CAP_FACTOR × TO'G'RI mean) YUZLAB BAROBAR katta. To'g'ri
// kodda esa `meanMs` (60000ms) UZATILGANI uchun bu ulkan zaxira mean
// UMUMAN ishlatilmaydi va natija doim bizning yuqori chegaramiz ichida
// qoladi — ya'ni to'g'ri kodda sinov DETERMINATSIYALI o'tadi, xato kodda
// deyarli har doim (≈99.8% ehtimol bilan) yiqiladi.
{
  // 10:00 → 10:02 = 2 daqiqa, 2 ta yuborish kutilmoqda → to'g'ri mean = 60000ms.
  const bulk = build({ counts: { ready: 2 }, minDelaySec: 0, maxDelaySec: 0, dailyLimits: [1] });
  bulk.start(['c1', 'c2'], 'j8', { spreadUntil: '10:02' });

  let job = bulk.current();
  for (let i = 0; i < 500 && (!job || job.nextAt === null); i += 1) {
    await new Promise((r) => setTimeout(r, 5));
    job = bulk.current();
  }
  if (!job || job.nextAt === null) throw new Error('nextAt hech qachon qo\'yilmadi');

  const gapMs = new Date(job.nextAt).getTime() - Date.now();
  const mean = 60_000; // (10:02 − 10:00) / 2 ta yuborish.
  const CAP_FACTOR = 3;
  const salqin = 2_000; // so'rov/polling kechikishi uchun.

  check(
    `nextAt pastki chegaradan (minDelaySec=0) kichik emas (${gapMs} ms)`,
    gapMs >= 0 - salqin,
    `${gapMs} ms`,
  );
  check(
    `nextAt yuqori chegaradan (CAP_FACTOR × mean = ${CAP_FACTOR * mean} ms) katta emas (${gapMs} ms)`,
    gapMs <= CAP_FACTOR * mean + salqin,
    `${gapMs} ms`,
  );

  bulk.stop();
  await tugashiniKut(bulk);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
