/**
 * Import fayllari ustun sarlavhalarini tanish uchun umumiy yordamchilar.
 * Mijozlar ro'yxati ustunlari (`ism`, `telefon`, `kurs`) — `leadColumns.ts` da.
 */

/** Sarlavhani solishtirish uchun normallashtirish. */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.:;,()«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sarlavha shu nomlardan biriga teng yoki ularning biridan boshlanadimi ("telefon raqam"). */
export function aliasgaMosmi(header: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => header === alias || header.startsWith(`${alias} `));
}

/** Telefon ustuni sarlavhalari (normallashtirilgan). */
export const PHONE_ALIASES: readonly string[] = [
  'телефон', 'тел', 'номер телефона', 'номер', 'контакт', 'контактный телефон',
  'phone', 'telefon', 'telefon raqami', 'raqam', 'mobil', 'моб', 'сотовый',
];

/**
 * Telefon ustunlari (1-based, ExcelJS uslubi). Uy/mobil/qo'shimcha bo'lishi mumkin.
 *
 * DIQQAT — BIR XIL NOMLI TAKRORIY USTUN OLINMAYDI: eksportlarda bir xil
 * nomli ikkinchi "Телефon" ustuni fayl oxirida butunlay boshqa odamning
 * raqamini saqlagan holatlar bo'lgan. Bir xil sarlavha ikkinchi marta
 * uchrasa tashlab yuboriladi; "Телефон 2", "Qo'shimcha telefon" kabi
 * farqlanadigan nomlar qabul qilinadi.
 */
export function findPhoneColumns(headerCells: unknown[]): number[] {
  const normalized = headerCells.map(normalizeHeader);
  const out: number[] = [];
  const seen = new Set<string>();

  normalized.forEach((header, i) => {
    if (!header) return;
    if (!aliasgaMosmi(header, PHONE_ALIASES)) return;
    if (seen.has(header)) return;
    seen.add(header);
    out.push(i + 1);
  });

  return out;
}
