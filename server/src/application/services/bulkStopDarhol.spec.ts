import {
  BulkConversationStart,
  type BulkStartJob,
} from '@/application/services/BulkConversationStart';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-stop --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: mijozlar orasidagi pauza kunlik sig'imga taqsimlanadi va
 * o'nlab daqiqagacha cho'ziladi ("≈40 daqiqada bitta"). Ilgari
 * `stop()` faqat bayroq qo'yardi, tsikl esa bekor qilinmaydigan
 * `sleep()` ichida turardi — natijada operator "To'xtatish"ni bosgach
 * ish yana yarim soat "ketyapti" bo'lib ko'rinardi. Bu sinov to'xtash
 * SONIYA ichida sezilishini va keyingi ish eski bekor qilingan
 * signalni meros qilib olmasligini qo'riqlaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-11T10:00:00Z');

/** Ish tugaguncha kutamiz — `start()` darhol qaytadi, ish fonda ketadi. */
async function tugashiniKut(bulk: BulkConversationStart, urinish = 200): Promise<BulkStartJob> {
  const job = await tugashiniKutYumshoq(bulk, urinish);
  if (job.status === 'running') throw new Error('ish tugamadi');
  return job;
}

/**
 * Xuddi shunday kutish, lekin tugamasa ham oxirgi holatni qaytaradi.
 *
 * To'xtatish sinovida kerak: eski xatti-harakat qaytsa tsikl 60 soniya
 * pauzada qoladi va `throw` butun faylni yiqitib, qaysi tekshiruv
 * buzilganini yashirardi. Endi o'sha holat oddiy ✗ qatori bo'lib chiqadi.
 */
async function tugashiniKutYumshoq(
  bulk: BulkConversationStart,
  urinish = 200,
): Promise<BulkStartJob> {
  for (let i = 0; i < urinish; i += 1) {
    const job = bulk.current();
    if (job && job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  const oxirgi = bulk.current();
  if (!oxirgi) throw new Error('ish umuman boshlanmadi');
  return oxirgi;
}

/** Birinchi mijoz ishlanib, tsikl pauzaga kirgunicha kutamiz. */
async function pauzagaKirishiniKut(bulk: BulkConversationStart): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if ((bulk.current()?.done ?? 0) >= 1) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('birinchi mijoz ishlanmadi');
}

function build(): BulkConversationStart {
  const startConversation = {
    execute: async () => ({ status: 'started' }),
  } as unknown as StartConversationUseCase;

  const settings = {
    get: async () => ({
      killSwitch: false,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      // ATAYLAB uzun pauza: aynan shu 60 soniya ilgari operatorni
      // kutishga majbur qilardi. Sinov shu pauza uzilishini tekshiradi,
      // shuning uchun uni nolga tushirib bo'lmaydi.
      minDelaySec: 60,
      maxDelaySec: 60,
      outreachDailyLimit: 1000,
    }),
  } as unknown as RuntimeSettings;

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: null }),
  } as unknown as IClientRepository;

  const contracts = {
    findPrimaryForClient: async (id: string) => ({ contractNo: `SH-${id}` }),
  } as unknown as IContractRepository;

  return new BulkConversationStart(
    startConversation,
    settings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-11' } as unknown as IClock,
    {} as unknown as BulkStartPlanner,
    clients,
    {
      // Ulangan akkaunt yo'q → kunlik sig'im nol → `meanDelayMs` null
      // qaytaradi va pauza `minDelaySec`/`maxDelaySec` ga, ya'ni to'liq
      // 60 soniyaga tushadi.
      listConnected: async () => [],
      list: async () => [],
    } as unknown as ITelegramAccountRepository,
    contracts,
    { labelOf: () => null } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
  );
}

/** Chegara saxiy: gap 999 ms emas, 60 000 ms dan yiroqligida. */
const DARHOL_MS = 1000;

// ─── To'xtatish 60 soniyalik pauzani kutmaydi ────────────────────────────
{
  const bulk = build();
  bulk.start(['c1', 'c2', 'c3'], 'j1');
  await pauzagaKirishiniKut(bulk);

  const boshlandi = Date.now();
  bulk.stop();
  const job = await tugashiniKutYumshoq(bulk);
  const ketganMs = Date.now() - boshlandi;

  check('holat "stopped"', job.status === 'stopped', job.status);
  check(
    `to'xtash darhol sezildi (${ketganMs} ms)`,
    ketganMs < DARHOL_MS,
    `pauza uzilmagan — ${ketganMs} ms kutildi`,
  );
  check('tugagan vaqti yozildi', job.finishedAt !== null);
  check('qolgan mijozlarga xabar ketmadi', job.done === 1, String(job.done));
  check('keyingi xabar vaqti tozalandi', job.nextAt === null);
}

// ─── Ish ketmayotganda to'xtatish zararsiz ───────────────────────────────
// Operator tugmani ikki marta bosishi yoki sahifani yangilashi mumkin.
{
  const bulk = build();
  let xato: unknown = null;
  try {
    bulk.stop();
  } catch (err) {
    xato = err;
  }
  check('bo\'sh holatda stop() xato tashlamadi', xato === null, String(xato));
  check('ish paydo bo\'lib qolmadi', bulk.current() === null);
  check('isRunning() hamon false', bulk.isRunning() === false);
}

// ─── To'xtatilgandan KEYINGI ish oxirigacha boradi ───────────────────────
// Eng oson xato — bekor qilingan `AbortController` ni qayta ishlatish:
// u holda keyingi ish barcha pauzalarni o'tkazib yuboradi va xabarlar
// ketma-ket ketadi, ya'ni spam filtri kutgan naqsh chiqadi.
{
  const bulk = build();
  bulk.start(['c1', 'c2', 'c3'], 'j1');
  await pauzagaKirishiniKut(bulk);
  bulk.stop();
  await tugashiniKutYumshoq(bulk);

  // Ikkinchi ishda pauza umuman bo'lmasin uchun bitta mijoz beramiz —
  // shunda 60 soniya kutmasdan pauza mantig'ining o'zi tekshiriladi.
  const yangi = await bulk.start(['c9'], 'j2');
  check('yangi ish boshlandi', yangi.status === 'running', yangi.status);
  const job = await tugashiniKut(bulk);
  check('yangi ish oxirigacha bordi', job.status === 'done', job.status);
  check('yangi ishda xabar ketdi', job.started === 1, String(job.started));

  // Ikki mijozli ish esa pauzani ROSTDAN kutishi kerak — eski signal
  // meros bo'lib qolganda bu tekshiruv yiqiladi.
  const uchinchi = build();
  uchinchi.start(['a1', 'a2'], 'j3');
  await pauzagaKirishiniKut(uchinchi);
  await new Promise((r) => setTimeout(r, 150));
  check(
    'to\'xtatilmagan ish pauzani hurmat qiladi',
    uchinchi.current()?.status === 'running' && uchinchi.current()?.done === 1,
    `${uchinchi.current()?.status} / ${uchinchi.current()?.done}`,
  );
  uchinchi.stop();
  await tugashiniKutYumshoq(uchinchi);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
