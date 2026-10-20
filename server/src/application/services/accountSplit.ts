/**
 * Tanlangan mijozlarni tanlangan Telegram akkauntlari orasida taqsimlaydi.
 *
 * Sof funksiya: kimni taqsimlash kerakligini O'ZI hal qilmaydi —
 * chaqiruvchi unga faqat yaroqli mijozlarni beradi (chiquvchi xabari
 * borlar va bog'lanish taqiqlanganlar oldindan chiqarib tashlanadi).
 *
 * NEGA SOF: operator oynada ko'rgan son bilan haqiqatda bajariladigan ish
 * bir xil bo'lishi shart. Ikkalasi ham shu funksiyani chaqiradi, shuning
 * uchun natija deterministik bo'lishi kerak — tasodif ham, vaqtga
 * bog'liqlik ham yo'q.
 */
export interface SplitAccount {
  readonly id: string;
  /** Hozir shu akkauntga biriktirilgan mijozlar soni. */
  readonly currentLoad: number;
  /** Bugun yana nechta YANGI murojaat qila oladi. */
  readonly remainingQuota: number;
}

export interface SplitResult {
  /** clientId → accountId */
  readonly assignments: Map<string, string>;
  /** accountId → shu ishda unga tushgan mijozlar soni */
  readonly perAccount: Map<string, number>;
  /**
   * Bugungi kvotaga sig'maydiganlar soni.
   *
   * Taqsimlashni CHEKLAMAYDI: hamma mijoz baribir biriktiriladi, shunchaki
   * bugun hammasiga xabar ketmaydi. Biriktirish saqlangani uchun ertaga
   * ular o'sha akkauntdan ketadi.
   */
  readonly overQuota: number;
}

export function planAccountSplit(clientIds: string[], accounts: SplitAccount[]): SplitResult {
  const assignments = new Map<string, string>();
  const perAccount = new Map<string, number>();
  if (!clientIds.length || !accounts.length) {
    return { assignments, perAccount, overQuota: 0 };
  }

  // Yuk hisoblagichi: har safar eng kam yuklanganga beramiz. Teng bo'lsa
  // `accounts` dagi tartib hal qiladi — shu tufayli natija deterministik.
  const load = new Map(accounts.map((a) => [a.id, a.currentLoad]));
  for (const a of accounts) perAccount.set(a.id, 0);

  for (const clientId of clientIds) {
    let target = accounts[0]!;
    for (const a of accounts) {
      if ((load.get(a.id) ?? 0) < (load.get(target.id) ?? 0)) target = a;
    }
    assignments.set(clientId, target.id);
    load.set(target.id, (load.get(target.id) ?? 0) + 1);
    perAccount.set(target.id, (perAccount.get(target.id) ?? 0) + 1);
  }

  let overQuota = 0;
  for (const a of accounts) {
    overQuota += Math.max(0, (perAccount.get(a.id) ?? 0) - a.remainingQuota);
  }

  return { assignments, perAccount, overQuota };
}

/**
 * Operator O'ZI kiritgan sonlar bo'yicha taqsimlash.
 *
 * `planAccountSplit` dan farqi tub: bu yerda hech narsa hisoblanmaydi —
 * qaysi akkauntga nechta mijoz tushishini odam aytadi. Operator akkauntlar
 * yukini tizimdan yaxshiroq biladigan holatlar bor (biri yangi, biri
 * ishonchli, biri sinovda), avtomatik taqsimot esa buni bilmaydi.
 *
 * Mijozlar `clientIds` TARTIBIDA bo'lib beriladi: birinchi akkauntga
 * boshidan N ta, keyingisiga undan keyingi M ta. Tartib chaqiruvchidan
 * keladi va deterministik (`findReassignableForBulkStart` id bo'yicha
 * saralaydi), ya'ni oynada ko'rsatilgan reja bilan haqiqiy ish bir xil.
 *
 * Sonlar yig'indisi mijozlar sonidan KAM bo'lsa, ortiqchasi biriktirilmay
 * qoladi — chaqiruvchi ularni o'tkazib yuboradi. Bu ataylab: operator
 * "bugun faqat shuncha" deb chegaralashi mumkin.
 */
export function planManualSplit(
  clientIds: string[],
  accounts: SplitAccount[],
  /** accountId → operator kiritgan son. */
  counts: Readonly<Record<string, number>>,
): SplitResult {
  const assignments = new Map<string, string>();
  const perAccount = new Map<string, number>();
  for (const a of accounts) perAccount.set(a.id, 0);

  let i = 0;
  for (const a of accounts) {
    // Manfiy yoki kasr son kiritilsa ham ish buzilmasligi kerak.
    const want = Math.max(0, Math.floor(counts[a.id] ?? 0));
    const take = Math.min(want, clientIds.length - i);
    for (let n = 0; n < take; n += 1, i += 1) {
      assignments.set(clientIds[i]!, a.id);
    }
    perAccount.set(a.id, take);
  }

  let overQuota = 0;
  for (const a of accounts) {
    overQuota += Math.max(0, (perAccount.get(a.id) ?? 0) - a.remainingQuota);
  }

  return { assignments, perAccount, overQuota };
}
