import type { LinkAfter } from '@/domain/entities/Course';

/**
 * Kursning yopiq guruh havolasini hozir yuborish kerakmi.
 *
 * Qoida: `birinchi_qism` — birinchi tasdiqlangan to'lovdan keyin; `toliq` —
 * to'liq to'langanda. Havola bir xaridga bir marta (`linkSentAt`) ketadi.
 * Havola kiritilmagan bo'lsa (`groupLink` null) — `false`: chaqiruvchi
 * suhbatni menejerga beradi.
 */
export function havolaYuborilsinmi(i: {
  linkAfter: LinkAfter;
  linkSentAt: Date | null;
  paid: number;
  total: number;
  groupLink: string | null;
}): boolean {
  if (i.linkSentAt || !i.groupLink) return false;
  return havolaQoidasiBajarildimi(i);
}

/** Faqat qoida (havola va avval yuborilgani hisobga olinmaydi). */
export function havolaQoidasiBajarildimi(i: { linkAfter: LinkAfter; paid: number; total: number }): boolean {
  if (i.paid <= 0) return false;
  return i.linkAfter === 'birinchi_qism' ? true : i.paid >= i.total;
}

/** Havola xabarining aniq matni — LLM emas, tizim yuboradi. */
export function havolaXabari(link: string): string {
  return `Yopiq guruhga havola: ${link}\nQo'shilish so'rovini yuboring, tez orada qabul qilamiz.`;
}
