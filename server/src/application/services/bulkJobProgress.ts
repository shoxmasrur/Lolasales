/**
 * Ommaviy suhbat boshlash ish yozuvi va uni O'ZGARTIRISH qoidalari.
 *
 * NEGA ALOHIDA FAYL: yozuv endi bir nechta parallel oqimdan yangilanadi.
 * `job.done + 1` deb o'qib-yozish `await` bor joyda jimgina buziladi —
 * ikki oqim bir xil qiymatni o'qisa bitta oshirish yo'qoladi va progress
 * hech qachon oxiriga yetmaydi. Qoidalarni sof funksiyaga chiqarib,
 * ularni bazasiz va Telegramsiz sinovda qo'riqlaymiz.
 */

export type BulkStartStatus = 'running' | 'done' | 'stopped' | 'failed';

/** Bitta o'tkazib yuborilgan mijoz — progressdagi "batafsil" ro'yxati uchun. */
export interface SkippedClient {
  readonly clientId: string;
  readonly fullName: string;
  readonly reason: string;
}

/**
 * Ro'yxatda saqlanadigan eng ko'p yozuv.
 *
 * Bu ro'yxat har progress yangilanishida veb-soket orqali TO'LIQ
 * uzatiladi, ya'ni 5000 talik ishda u xabarni haddan tashqari
 * shishirardi. Tashxis uchun bir necha o'nlab yozuv yetarli.
 */
export const SKIP_DETAILS_LIMIT = 200;

/**
 * Bitta akkauntning oqimi.
 *
 * NEGA KERAK: uch oqim bir vaqtda ishlaganda bitta umumiy "keyingi xabar"
 * vaqti ma'nosini yo'qotadi va operator qaysi akkaunt orqada qolgani yoki
 * cheklovga tushib to'xtaganini ko'rolmaydi.
 */
export interface BulkStartAccountProgress {
  /** `null` — rejaga kirmaganlarning "qoldiq" oqimi; u qator sifatida ko'rsatilmaydi. */
  readonly accountId: string | null;
  readonly label: string;
  /** Mijoz ko'radigan ism. */
  readonly personaName: string;
  readonly total: number;
  readonly done: number;
  readonly started: number;
  readonly skipped: number;
  readonly failed: number;
  readonly nextAt: string | null;
  readonly paceMinutes: number | null;
  /** `flood` — akkaunt Telegram cheklovига tushdi va shu oqim to'xtadi. */
  readonly status: 'waiting' | 'running' | 'done' | 'stopped' | 'flood';
  readonly error: string | null;
}

export interface BulkStartJob {
  readonly id: string;
  readonly total: number;
  readonly done: number;
  readonly started: number;
  readonly skipped: number;
  readonly failed: number;
  readonly status: BulkStartStatus;
  readonly currentName: string | null;
  /**
   * Keyingi xabar taxminan qachon ketadi (ISO).
   *
   * Parallel ishda — oqimlar ichidagi ENG YAQINI.
   */
  readonly nextAt: string | null;
  /**
   * O'rtacha necha daqiqada bitta xabar ketadi (jami, hamma oqim bo'ylab).
   *
   * Progressda ochiq ko'rsatiladi: 40 daqiqalik jimlikda operator
   * "osilib qoldi" deb o'ylamasligi kerak.
   */
  readonly paceMinutes: number | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly error: string | null;
  /** Nega o'tkazib yuborilgani — sabab bo'yicha guruhlangan. */
  readonly skipReasons: Record<string, number>;
  /** Kim o'tkazib yuborilgani — tashxis uchun. */
  readonly skippedItems: SkippedClient[];
  /** Cheklovdan oshgani uchun ro'yxatga kirmaganlari. */
  readonly skippedItemsTruncated: number;
  /**
   * Operator "ism mos kelmasa ham yuborilsin" deb tasdiqlaganmi.
   * Progressda ko'rinib turadi — bu oddiy ish rejimi emas.
   */
  readonly allowNameMismatch: boolean;
  /**
   * Har akkauntning o'z oqimi.
   *
   * Eski ketma-ket yo'lda (operator akkaunt tanlamagan) BO'SH bo'ladi —
   * web tomoni jadvalni umuman chizmaydi.
   */
  readonly accounts: BulkStartAccountProgress[];
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  readonly resumedCount?: number;
  /**
   * Vazifani kim boshlagan (`users.id`). Obyekt cheklovi: cheklangan
   * foydalanuvchiga boshqaning vazifasi ismsiz ko'rsatiladi va u uni
   * to'xtata olmaydi. Eski (maydonsiz) vazifa — egasi noma'lum.
   */
  readonly boshlaganUserId?: string | null;
}

/** `boshIsh` uchun bitta akkaunt qatorining boshlang'ich ma'lumoti. */
export interface AccountSeed {
  readonly accountId: string | null;
  readonly label: string;
  readonly personaName: string;
  readonly total: number;
}

export function boshIsh(
  id: string,
  total: number,
  allowNameMismatch: boolean,
  accounts: AccountSeed[],
): BulkStartJob {
  return {
    id,
    total,
    done: 0,
    started: 0,
    skipped: 0,
    failed: 0,
    status: 'running',
    currentName: null,
    nextAt: null,
    paceMinutes: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    skipReasons: {},
    skippedItems: [],
    skippedItemsTruncated: 0,
    allowNameMismatch,
    accounts: accounts.map((a) => ({
      ...a,
      done: 0,
      started: 0,
      skipped: 0,
      failed: 0,
      nextAt: null,
      paceMinutes: null,
      status: 'waiting' as const,
      error: null,
    })),
  };
}

export interface JobDelta {
  readonly done?: number;
  readonly started?: number;
  readonly skipped?: number;
  readonly failed?: number;
  readonly skipReason?: string;
  /**
   * O'tkazib yuborilgan mijoz tafsiloti.
   *
   * `'truncated'` — ro'yxat allaqachon to'lgani uchun tafsilot UMUMAN
   * olinmagan. Chaqiruvchi buni oldindan biladi va ikkita keraksiz baza
   * so'rovini qilmaydi: 5000 talik ishda bu minglab so'rov demakdir va
   * o'tkazib yuborish yo'lida pauza yo'q, ya'ni hammasi bir zumda ketardi.
   */
  readonly skippedItem?: SkippedClient | 'truncated';
}

/**
 * Hisoblagichlarni oshiradi — global va o'sha akkaunt qatorida.
 *
 * `accountId` `null` bo'lsa (qoldiq oqimi) faqat global sonlar oshadi:
 * qoldiq uchun alohida qator ko'rsatilmaydi, chunki u akkaunt emas.
 *
 * MUHIM: chaqiruvchi natijani DARHOL saqlashi kerak (`this.job = bumpJob(this.job, ...)`),
 * o'rtada `await` qilmasdan. Aks holda poyga qaytadan paydo bo'ladi.
 */
export function bumpJob(job: BulkStartJob, accountId: string | null, delta: JobDelta): BulkStartJob {
  const skipReasons = { ...job.skipReasons };
  if (delta.skipReason) {
    skipReasons[delta.skipReason] = (skipReasons[delta.skipReason] ?? 0) + 1;
  }

  let skippedItems = job.skippedItems;
  let skippedItemsTruncated = job.skippedItemsTruncated;
  if (delta.skippedItem) {
    if (delta.skippedItem !== 'truncated' && skippedItems.length < SKIP_DETAILS_LIMIT) {
      skippedItems = [...skippedItems, delta.skippedItem];
    } else {
      skippedItemsTruncated += 1;
    }
  }

  return {
    ...job,
    done: job.done + (delta.done ?? 0),
    started: job.started + (delta.started ?? 0),
    skipped: job.skipped + (delta.skipped ?? 0),
    failed: job.failed + (delta.failed ?? 0),
    skipReasons,
    skippedItems,
    skippedItemsTruncated,
    accounts: job.accounts.map((a) =>
      a.accountId !== accountId
        ? a
        : {
            ...a,
            done: a.done + (delta.done ?? 0),
            started: a.started + (delta.started ?? 0),
            skipped: a.skipped + (delta.skipped ?? 0),
            failed: a.failed + (delta.failed ?? 0),
          },
    ),
  };
}

/** Bitta akkaunt qatorining holatini yangilaydi (hisoblagichlarga tegmaydi). */
export function akkauntQatoriniYangila(
  job: BulkStartJob,
  accountId: string | null,
  changes: Partial<Omit<BulkStartAccountProgress, 'accountId'>>,
): BulkStartJob {
  return {
    ...job,
    accounts: job.accounts.map((a) => (a.accountId === accountId ? { ...a, ...changes } : a)),
  };
}

/**
 * Bir nechta oqimning JAMI sur'ati (daqiqa).
 *
 * Har oqim mustaqil ishlaganda ular ustma-ust tushadi: uchta oqim har
 * biri 27 daqiqada bitta yozsa, operator o'rtacha 9 daqiqada bitta xabar
 * ko'radi. Bu Puasson oqimlarining qo'shilishi — tezliklar qo'shiladi,
 * oraliqlar emas: 1 / Σ(1/mean).
 *
 * `null` oqimlar (sur'ati hisoblanmaganlar) chiqarib tashlanadi;
 * hammasi `null` bo'lsa natija ham `null`.
 */
export function jamiSurat(means: Array<number | null>): number | null {
  const yaroqli = means.filter((m): m is number => m !== null && m > 0);
  if (!yaroqli.length) return null;
  const tezlik = yaroqli.reduce((sum, m) => sum + 1 / m, 0);
  return 1 / tezlik;
}
