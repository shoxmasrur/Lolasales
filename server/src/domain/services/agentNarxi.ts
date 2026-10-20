/**
 * Agent xarajatining prognozi.
 *
 * Sof hisob — bazaga ham, vaqtga ham bog'liq emas, shuning uchun sinovdan
 * o'tkazsa bo'ladi. Maqsad: to'plangan bir necha kunlik ma'lumotdan
 * "bitta javob qancha" va "shu tezlikda oyiga qancha" degan ikki raqamni
 * chiqarish — boshqa provayder bilan solishtirish aynan shu ikkisi
 * ustida boradi.
 */

export interface NarxPrognozi {
  /** Bitta model chaqiruvining o'rtacha narxi. */
  readonly perCall: number;
  /** Kunlik o'rtacha xarajat. */
  readonly perDay: number;
  /** Shu tezlik saqlansa — 30 kunlik xarajat. */
  readonly perMonth: number;
}

/** Prognoz oyi — 30 kun. Kalendar oyi emas, taqqoslash uchun barqaror birlik. */
export const PROGNOZ_KUNLARI = 30;

/**
 * @param costUsd davr davomidagi jami xarajat
 * @param calls   davr davomidagi chaqiruvlar soni
 * @param days    davr necha kunni qamragani (kamida 1)
 */
export function narxPrognozi(costUsd: number, calls: number, days: number): NarxPrognozi {
  // Nol bo'luvchi — hisobsiz holat, "0" deb ko'rsatgan ma'qul: `Infinity`
  // yoki `NaN` hisobotda ma'nosiz raqam bo'lib chiqardi va uni jadvalda
  // formatlab ham bo'lmasdi.
  const perCall = calls > 0 ? costUsd / calls : 0;
  // Davr har doim kamida bir kun: o'lchov bugun boshlangan bo'lsa ham
  // kunlik o'rtacha bugungi xarajatga teng bo'lishi kerak, nolga emas.
  const perDay = costUsd / Math.max(1, days);
  return { perCall, perDay, perMonth: perDay * PROGNOZ_KUNLARI };
}

/**
 * Davr necha kunni qamraganini hisoblaydi (ikkala chekka ham kiradi).
 *
 * O'lchov boshlangan sanani (`since`) hisobga oladi: davr 1-avgustdan
 * so'ralgan, lekin yozuvlar 10-avgustdan boshlangan bo'lsa, kunlik
 * o'rtachani 13 kunga emas, 4 kunga bo'lish kerak — aks holda xarajat
 * uch barobar past ko'rinadi.
 */
export function davrKunlari(from: string, to: string, since: string | null): number {
  const boshlanish = since && since > from ? since : from;
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${boshlanish}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}
