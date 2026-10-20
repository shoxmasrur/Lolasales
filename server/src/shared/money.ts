/**
 * Eksport faylida pul qiymatlari suzuvchi nuqtali son sifatida keladi
 * (masalan 394913999.99879998) — tiyingacha yaxlitlaymiz.
 */
export function parseAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Kechikkan to'lov ustunlari (`Долг (Общ)`, `Долг (мес.)`, `Долг (1 взнос)`) eksportda
 * manfiy ishora bilan keladi — bu "kamomad" belgisi, qiymatning o'zi emas.
 * Shuning uchun modul olamiz: -1 000 000 → 1 000 000 so'm kechikkan to'lov.
 */
export function toDebt(value: unknown): number {
  return Math.abs(parseAmount(value));
}

/**
 * `Дни просрочки` ham manfiy keladi (-25 = 25 kun kechikish).
 * Musbat qiymat — to'lov muddati hali kelmagan, kechikish yo'q.
 */
export function toOverdueDays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? Math.round(-n) : 0;
}

const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** "12 450 000 so'm" */
export function formatSom(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '0 so\'m';
  return `${fmt.format(Math.round(n))} so'm`;
}
