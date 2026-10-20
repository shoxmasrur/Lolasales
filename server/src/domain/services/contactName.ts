import { addressForm, givenName } from '@/shared/gender';

export interface ContactName {
  /** Telegram `first_name` — qisqartirilgan shartnoma raqami. */
  readonly first: string;
  /** Telegram `last_name` — murojaat shakli yoki faqat ism. */
  readonly last: string;
}

/**
 * Shartnoma raqamining boshidagi "raqam + obyekt kodi" qismi:
 * `3090MSO25A5` → `3090MSO`. Yil va oxirgi belgilar tashlanadi.
 *
 * Naqshga tushmasa raqam TO'LIQ qoladi — kesib tashlashdan ko'ra uzun
 * bo'lgani yaxshi, aks holda raqamni tanib bo'lmaydi.
 */
function shortContractNo(contractNo: string): string {
  return /^(\d+[A-Za-z]+)/.exec(contractNo)?.[1] ?? contractNo;
}

/**
 * Telegram kontakti uchun nom: `3090MSO Aziz aka`.
 *
 * Raqam BIRINCHI maydonda — shunda kontakt ro'yxati shartnoma bo'yicha
 * tartiblanadi va operator qidirganda darhol topadi.
 *
 * Jins aniqlanmasa murojaat shakli tashlanadi va faqat ism qoladi —
 * agent ham xuddi shunday ishlaydi ("aka/opa" ni taxmin qilmaydi).
 */
export function contactName(
  contractNo: string | null,
  fullName: string,
  /** CRM bergan aniq ism — bo'lsa taxminiy ajratish ishlatilmaydi. */
  knownFirstName?: string | null,
): ContactName {
  return {
    first: contractNo ? shortContractNo(contractNo) : '',
    last: addressForm(fullName, knownFirstName) ?? givenName(fullName, knownFirstName) ?? '',
  };
}
