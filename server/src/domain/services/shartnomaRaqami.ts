/**
 * Odam yozgan shartnoma raqamini bazadagi ko'rinishga keltiradi:
 * bosh harf, bo'sh joy/chiziqchasiz. Lotin harf va raqamdan boshqa
 * belgi qolsa (masalan kirill) — `null`: bunday raqam bazada yo'q.
 */
export function shartnomaRaqaminiTozala(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const toza = raw.toUpperCase().replace(/[\s\-_.]/g, '');
  if (toza.length < 5 || toza.length > 32) return null;
  return /^[0-9A-Z]+$/.test(toza) ? toza : null;
}
