import { addressForm, givenName } from '@/shared/gender';

export interface ContactName {
  /** Telegram `first_name` — murojaat shakli yoki faqat ism. */
  readonly first: string;
  /** Telegram `last_name` — bo'sh (familiya kontaktga yozilmaydi). */
  readonly last: string;
}

/**
 * Telegram kontakti uchun nom: `Aziz aka`.
 *
 * Jins aniqlanmasa murojaat shakli tashlanadi va faqat ism qoladi —
 * agent ham xuddi shunday ishlaydi ("aka/opa" ni taxmin qilmaydi).
 */
export function contactName(
  fullName: string,
  /** Aniq ism (masalan Telegram profilidan) — bo'lsa taxminiy ajratish ishlatilmaydi. */
  knownFirstName?: string | null,
): ContactName {
  return {
    // Telegram bo'sh `first_name` ni rad etadi — hech narsa chiqmasa "Mijoz".
    first: (addressForm(fullName, knownFirstName) ?? givenName(fullName, knownFirstName) ?? '').trim() || 'Mijoz',
    last: '',
  };
}
