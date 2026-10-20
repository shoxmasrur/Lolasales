import { aliasgaMosmi, findPhoneColumns, normalizeHeader } from '@/infrastructure/import/columnMap';

/** Mijozlar ro'yxati faylining sarlavhalari (normallashtirilgan). */
const ISM_NOMLARI = ['ism', 'fio', 'ф и о', 'фио', 'имя', 'клиент', 'name', 'mijoz', 'мижоз'];
const KURS_NOMLARI = ['kurs', 'курс', 'course'];

export interface LeadUstunlari {
  /** 0-based ustun tartibi; topilmasa `null`. */
  name: number | null;
  phone: number | null;
  course: number | null;
}

function birinchi(headers: string[], aliases: readonly string[]): number | null {
  const i = headers.findIndex((h) => h !== '' && aliasgaMosmi(h, aliases));
  return i === -1 ? null : i;
}

/** Sarlavhalardan ism / telefon / kurs ustunlarini topadi (0-based). */
export function leadUstunlari(headers: string[]): LeadUstunlari {
  const norm = headers.map(normalizeHeader);
  const phone = findPhoneColumns(headers)[0];
  return {
    name: birinchi(norm, ISM_NOMLARI),
    phone: phone === undefined ? null : phone - 1,
    course: birinchi(norm, KURS_NOMLARI),
  };
}

/** Qator qanchalik sarlavhaga o'xshaydi: topilgan ustun turlari soni (0–3). */
export function leadSarlavhaBali(cells: unknown[]): number {
  const u = leadUstunlari(cells.map((c) => String(c ?? '')));
  return [u.name, u.phone, u.course].filter((v) => v !== null).length;
}
