import {
  BulkConversationStart,
  type BulkStartJob,
} from '@/application/services/BulkConversationStart';
import type {
  StartConversationOptions,
  StartConversationUseCase,
} from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AbortedError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-stop-llm --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: `bulkStopDarhol.spec.ts` mijozlar ORASIDAGI pauza uzilishini
 * qo'riqlaydi. Bu yerda boshqa, og'irroq holat: operator "To'xtatish"ni
 * aynan MODEL javob yozayotgan paytda bosadi. Signal model chaqiruvigacha
 * yetib bormasa javob oxirigacha yozilardi va tayyor xabar mijozga
 * KETARDI — ya'ni to'xtatish bir mijozga kechikardi.
 *
 * Sinov ikkita narsani birga ushlaydi: uzilish soniya ichida sezilishini
 * VA to'xtatilgan mijoz "xato" deb sanalmasligini.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-11T10:00:00Z');

/** Ish tugaguncha kutamiz; tugamasa ham oxirgi holatni qaytaramiz. */
async function tugashiniKut(
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

/** Berilgan shart bajarilguncha kutamiz. */
async function kut(shart: () => boolean, nima: string, urinish = 200): Promise<void> {
  for (let i = 0; i < urinish; i += 1) {
    if (shart()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`kutilmadi: ${nima}`);
}

/** Sekin model chaqiruvining kuzatuvi. */
interface Kuzatuv {
  /** `execute` chaqirilgan mijozlar — tartibi bilan. */
  kirganlar: string[];
  /** Har chaqiruvda signal berilganmi (ya'ni `undefined` emasmi). */
  signallar: boolean[];
}

/**
 * Model qancha "o'ylashi" — ish orasida O'ZGARTIRILADI.
 *
 * Sekinlik o'zgaruvchan bo'lishi shart, chunki ikkinchi ish AYNAN o'sha
 * `BulkConversationStart` nusxasida boshlanishi kerak: eski bekor
 * qilingan signal keyingi ishga meros bo'lib qolgani faqat shunda
 * ko'rinadi, yangi nusxada esa yashirinib qolardi.
 */
interface Rejim {
  sekinMs: number;
}

function build(): { bulk: BulkConversationStart; kuzatuv: Kuzatuv; rejim: Rejim } {
  const kuzatuv: Kuzatuv = { kirganlar: [], signallar: [] };
  const rejim: Rejim = { sekinMs: 0 };

  const startConversation = {
    execute: async (id: string, options: StartConversationOptions = {}) => {
      kuzatuv.kirganlar.push(id);
      // Aynan shu — plombaning o'zi. Signal uzatilmay qolsa bu yerda
      // `false` yozilib qoladi va quyidagi tekshiruv yiqiladi. Busiz
      // sinov "o'tgandek" ko'rinardi: model shunchaki tez tugagani
      // uchun ham hamma narsa joyida chiqardi.
      kuzatuv.signallar.push(options.signal !== undefined);

      const signal = options.signal;

      // Model chaqiruvi taqlidi: uzoq kutadi, lekin signal kelsa DARHOL
      // `AbortedError` bilan uziladi va hech qanday matn qaytmaydi —
      // haqiqiy engine ham aynan shunday qiladi.
      await new Promise<void>((resolve, reject) => {
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

      return { status: 'started' };
    },
  } as unknown as StartConversationUseCase;

  const settings = {
    get: async () => ({
      killSwitch: false,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      // Pauza ATAYLAB nol: bu sinovda o'lchanayotgan narsa mijozlar
      // ORASIDAGI kutish emas (u `bulkStopDarhol.spec.ts` da), balki
      // model chaqiruvining o'zi uzilishi.
      minDelaySec: 0,
      maxDelaySec: 0,
      outreachDailyLimit: 1000,
    }),
  } as unknown as RuntimeSettings;

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: null }),
  } as unknown as IClientRepository;

  const contracts = {
    findPrimaryForClient: async (id: string) => ({ contractNo: `SH-${id}` }),
  } as unknown as IContractRepository;

  const bulk = new BulkConversationStart(
    startConversation,
    settings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-11' } as unknown as IClock,
    {} as unknown as BulkStartPlanner,
    clients,
    {
      // Ulangan akkaunt yo'q → kunlik sig'im nol → pauza yuqoridagi
      // `minDelaySec`/`maxDelaySec` ga, ya'ni nolga tushadi.
      listConnected: async () => [],
      list: async () => [],
    } as unknown as ITelegramAccountRepository,
    contracts,
    { labelOf: () => null } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
  );

  return { bulk, kuzatuv, rejim };
}

/** Chegara saxiy: gap 999 ms emas, 30 000 ms dan yiroqligida. */
const DARHOL_MS = 1000;
/** Model shuncha "o'ylaydi" — uzilish ishlamasa sinov shu yerda qotib qolardi. */
const SEKIN_MS = 30_000;

const { bulk, kuzatuv, rejim } = build();

// ─── To'xtatish model javobini yarim yo'lda uzadi ────────────────────────
{
  rejim.sekinMs = SEKIN_MS;
  bulk.start(['c1', 'c2', 'c3'], 'j1');

  // Birinchi mijoz model chaqiruviga KIRGUNICHA kutamiz — to'xtatish
  // aynan generatsiya paytiga tushishi kerak.
  await kut(() => kuzatuv.kirganlar.length >= 1, 'birinchi mijoz modelga kirmadi');

  const boshlandi = Date.now();
  bulk.stop();
  const job = await tugashiniKut(bulk);
  const ketganMs = Date.now() - boshlandi;

  check(
    'signal `execute` ga uzatildi',
    kuzatuv.signallar.length > 0 && kuzatuv.signallar.every(Boolean),
    JSON.stringify(kuzatuv.signallar),
  );
  check('holat "stopped"', job.status === 'stopped', job.status);
  check(
    `to'xtash darhol sezildi (${ketganMs} ms)`,
    ketganMs < DARHOL_MS,
    `model chaqiruvi uzilmagan — ${ketganMs} ms kutildi`,
  );
  check(
    'to\'xtatilgan mijoz xato deb sanalmadi',
    job.failed === 0,
    `failed=${job.failed}`,
  );
  check('hech kimga xabar ketmadi', job.started === 0, String(job.started));
  check(
    'qolgan mijozlar umuman ishlanmadi',
    kuzatuv.kirganlar.length === 1 && kuzatuv.kirganlar[0] === 'c1',
    JSON.stringify(kuzatuv.kirganlar),
  );
  check('tugagan vaqti yozildi', job.finishedAt !== null);
}

// ─── To'xtatilgandan KEYINGI ish oxirigacha boradi ───────────────────────
// AYNAN o'sha nusxada: bekor qilingan signal meros bo'lib qolsa, ikkinchi
// ish birinchi mijozdayoq uzilib, bitta ham xabar ketmasdi.
{
  rejim.sekinMs = 0;
  kuzatuv.kirganlar = [];
  kuzatuv.signallar = [];

  // Birinchi ish hamon "ketyapti" bo'lsa (ya'ni yuqoridagi tekshiruvlar
  // allaqachon yiqilgan), `start()` xato tashlaydi va butun faylni
  // yiqitib, qaysi tekshiruv buzilganini yashirardi. Shu holatni oddiy
  // ✗ qatoriga aylantiramiz.
  if (bulk.isRunning()) {
    check('oldingi ish to\'xtadi — yangisini boshlash mumkin', false, 'hamon "running"');
  } else {
    bulk.start(['d1', 'd2', 'd3'], 'j2');
    const job = await tugashiniKut(bulk);

    check('yangi ish oxirigacha bordi', job.status === 'done', job.status);
    check('uchchalasiga ham xabar ketdi', job.started === 3, String(job.started));
    check('yangi ishda yiqilgani yo\'q', job.failed === 0, String(job.failed));
    check(
      'uchchalasi ham modelga kirdi',
      kuzatuv.kirganlar.length === 3,
      JSON.stringify(kuzatuv.kirganlar),
    );
  }
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
