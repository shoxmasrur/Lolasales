export interface Contract {
  readonly id: string;
  readonly clientId: string;
  readonly contractNo: string;
  readonly externalId: string | null;
  readonly objectName: string | null;
  /** Obyekt manzili — talabnomada yoziladi; faqat sinxronizatsiyadan keladi. */
  readonly objectAddress: string | null;
  /**
   * Obyekt kompaniyasining INN'i — talabnoma rekvizitini kompaniyalar
   * ro'yxatidan tanlash kaliti; faqat sinxronizatsiyadan keladi.
   */
  readonly companyInn: string | null;
  /** Uy — mijoz o'z shartnomasini aynan shu bilan taniydi. */
  readonly apartment: {
    readonly number: string | null;
    readonly floor: number | null;
    readonly rooms: number | null;
    readonly entrance: string | null;
    readonly block: string | null;
    readonly area: number | null;
  } | null;
  /**
   * Xonadonni bitish muddati, `YYYY-MM-DD` — shartnomalar bazasidan.
   *
   * SATR, `Date` EMAS: bu kun, vaqt emas. `pool.ts` DATE ni satr qilib
   * qaytaradi; `Date` ga o'girish UTC yarim tunidan siljish xavfini
   * qo'shardi.
   */
  readonly completionDate: string | null;
  readonly status: string | null;
  readonly virtualStatus: string | null;
  readonly category: string | null;
  readonly totalPrice: number | null;
  readonly firstPayment: number | null;
  readonly monthlyPayment: number | null;
  readonly paidTotal: number | null;
  readonly remainingTotal: number | null;
  readonly contractDate: Date | null;
  readonly months: number | null;
  readonly nextPaymentDate: Date | null;
  readonly daysOverdue: number;
  /** To'lanmagan oylik to'lovlar soni — grafikdan sanalgan, aniq. */
  readonly missedMonthsExact: number;
  readonly debtFirst: number;
  readonly debtMonthly: number;
  readonly debtTotal: number;
  /**
   * Hisoblagichlar uchun to'lovdagi kechikish (CRM `for_electrocity`).
   * Oylik to'lov emas — `kechikkanSumma` ga KIRMAYDI, agent alohida aytadi.
   */
  readonly debtMeter: number;
  readonly warningCount: number;
  readonly lastWarningType: string | null;
  readonly lastWarningMethod: string | null;
  readonly lastWarningManager: string | null;
  readonly lastWarningAt: Date | null;
  /** Shartnomalar bazasidan oxirgi muvaffaqiyatli yangilanish. */
  readonly syncedAt: Date | null;
  /** Oxirgi yangilash xatosi (`not_found`, HTTP xatosi va h.k.). */
  readonly syncError: string | null;
  readonly raw: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * `apartment`, `missedMonthsExact`, `completionDate`, `objectAddress` va
 * `companyInn` bu yerda YO'Q: ular faqat
 * shartnomalar bazasidan sinxronizatsiyada to'ldiriladi. Excel eksportida
 * bunday ustunlar yo'q, va importga ularni majburlash har yuklashda
 * jonli ma'lumotni `null` bilan o'chirib yuborish xavfini tug'dirardi.
 */
export type ContractUpsert = Omit<
  Contract,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'apartment'
  | 'missedMonthsExact'
  | 'debtMeter'
  | 'completionDate'
  | 'objectAddress'
  | 'companyInn'
  | 'syncedAt'
  | 'syncError'
> & {
  importBatchId?: string | null;
  /**
   * Shartnomani YARATGAN import. Keyingi importlar uni yangilaganda bu
   * qiymat o'zgarmaydi — qaytarish faqat yaratilganini olib tashlaydi.
   */
  createdImportBatchId?: string | null;
};

/**
 * Nechta oylik to'lov qoldirilgan (TAXMINIY, oylik to'lovga bo'lib).
 *
 * @deprecated Grafikdan sanalgan aniq son uchun `contract.missedMonthsExact`
 * ishlating. Bu bo'linma qisman to'langan oyni yo'qotadi: real shartnomada
 * 17 356 000 / 8 339 000 = 2, aslida esa 3 oy to'lanmagan.
 *
 * Shartnoma hali shartnomalar bazasidan sinxronlanmagan bo'lsa (grafik
 * bo'sh, `missedMonthsExact = 0`) zaxira sifatida qoladi.
 */
export function missedMonths(contract: Contract): number {
  if (!contract.monthlyPayment || contract.monthlyPayment <= 0) return 0;
  return Math.floor(contract.debtMonthly / contract.monthlyPayment);
}

/**
 * Mijozning barcha shartnomalari bo'yicha jami kechikkan to'lov.
 *
 * NEGA `debtTotal` EMAS: ma'no jihatidan `debtTotal` ("Долг (Общ)") xuddi
 * shu summa, lekin Excel importida uchta ustun (boshlang'ich, oylik, jami)
 * ALOHIDA o'qiladi va bir qatorda bir-biriga mos kelmay qolishi mumkin.
 * Ikki qismni to'g'ridan-to'g'ri qo'shish bitta ustunning yo'qolishiga
 * yoki kelishmovchiligiga bog'liq emas. Ayni ta'rif suhbat boshlash
 * darvozasida (`StartConversationUseCase`) va `previewBulkStart` SQL'ida
 * ham ishlatiladi — butun funksiya bo'ylab bitta raqam.
 */
export function kechikkanSumma(contracts: readonly Contract[]): number {
  return contracts.reduce((sum, c) => sum + c.debtFirst + c.debtMonthly, 0);
}

/**
 * Kechikkan summa berilgan chegaradan katta emasmi — YAGONA ta'rif.
 *
 * NEGA BITTA JOYDA: bu qaror uch yo'ldan chiqadi — va'da bo'yicha kelgan
 * to'lov uchun rahmat (`PromiseWatcher`), kvitansiya tasdiqlangandagi
 * rahmat (`PaymentCheckService`) va sukutdan keyin qayta yozish
 * (`SilenceWatcher`). Ular ayri yozilgan edi va birinchisi faqat
 * VA'DANING O'Z shartnomasiga qarardi: ikki shartnomali mijoz
 * birinchisini yopsa, ikkinchisida 12 mln kechikish turganda ham
 * "kechikkan to'lovingiz yo'q" degan xabar ketardi. Mijoz bunday xabarni
 * darhol rad etadi va butun hisob-kitobga ishonchi qoladi.
 *
 * IKKI XIL ISHLATILISH BOR, VA ULARDA `threshold` BOSHQA-BOSHQA:
 *
 *  1. SUKUT (jim turish) — "hozircha bu mijozga yozmaylik". Xato narxi
 *     ARZON: noto'g'ri "yopildi" desak, bir siklga kechikib yozamiz,
 *     xolos. Shu yo'lda `threshold` sifatida `OutreachSettings.minDebt`
 *     beriladi (`SilenceWatcher.nudge`, `StartConversationUseCase`
 *     darvozasi): 800-1000 so'mlik yaxlitlash qoldig'i mijozni
 *     bezovta qilishga arzimaydi.
 *
 *  2. DA'VO — agent mijozga AYNAN "kechikkan to'lovingiz yo'q" deb
 *     yozadi (`PromiseWatcher.thank`, `PaymentCheckService.thank`).
 *     Xato narxi QIMMAT: mijoz o'z hisobida 99 000 so'm qoldiq ko'rsa,
 *     "yo'q" degan xabarni darhol rad etadi va butun hisob-kitobga
 *     ishonchi so'nadi. Shu yo'lda `threshold` doim LITERAL `0` bo'lishi
 *     KERAK — `minDebt` EMAS. Chegara faqat jim turishga ruxsat beradi,
 *     "qarzingiz yo'q" deyishga emas.
 *
 * Chaqiruv joyida qaysi holat ekanini ANIQ ko'rsating (`0` yoki
 * `runtime.minDebt`) — o'zgaruvchiga yashirmang, keyingi o'qiguvchi
 * ikkalasini ADASHTIRMASIN.
 *
 * NEGA `daysOverdue` GA QARALMAYDI: ilgari shart `debtTotal > 0 ||
 * daysOverdue > 0` edi. 800 so'm kechikkan mijozda `daysOverdue` ham 30
 * bo'ladi, ya'ni ikkinchi shart chegarani AYNAN u kerak bo'lgan holatda
 * bekor qilardi. Qaror endi faqat summaga tayanadi — u ikkala manbada
 * ham (CRM sinxronizatsiyasi va Excel importi) to'ldiriladi.
 *
 * Ro'yxat MIJOZNING barcha tirik shartnomalari bo'lishi kerak
 * (`faqatYoziladiganlar` dan o'tkazilgan). Bo'sh ro'yxatda javob "yo'q":
 * tekshiradigan narsa bo'lmasa, tasdiqlab ham bo'lmaydi.
 */
export function kechikishYopildi(
  contracts: readonly Contract[],
  threshold: number,
): boolean {
  return contracts.length > 0 && kechikkanSumma(contracts) <= threshold;
}
