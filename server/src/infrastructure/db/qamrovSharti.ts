import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

/**
 * Obyekt cheklovi uchun SQL `WHERE` bo'laklari.
 *
 * Cheklanmagan qamrovda `'TRUE'` qaytadi va `params` ga TEGILMAYDI —
 * mavjud so'rovlar va ularning `$n` raqamlari aynan o'zgarmaydi.
 * Nomlar `trim()` bilan solishtiriladi; `lower()` yo'q (C collation).
 * Alias faqat koddan keladi (foydalanuvchi kiritmaydi).
 */

/** Mijoz ko'rinadimi: noma'lum emas va qamrovdagi obyektda tirik shartnomasi bor. */
export function mijozQamroviSharti(q: MijozQamrovi, mijozAlias: string, params: unknown[]): string {
  if (!q.cheklangan) return 'TRUE';
  params.push([...q.obyektlar]);
  const a = mijozAlias;
  return `(NOT ${a}.nomalum AND EXISTS (SELECT 1 FROM contracts qct WHERE qct.client_id = ${a}.id AND qct.deleted_at IS NULL AND trim(qct.object_name) = ANY($${params.length}::text[])))`;
}

/**
 * Shartnoma obyekti qamrovdami — FAQAT tushum uchun (to'lov tushgan
 * shartnoma obyekti bo'yicha). Boshqa joylarda mijoz darajasidagi shart.
 */
export function shartnomaQamroviSharti(q: MijozQamrovi, shartnomaAlias: string, params: unknown[]): string {
  if (!q.cheklangan) return 'TRUE';
  params.push([...q.obyektlar]);
  return `trim(${shartnomaAlias}.object_name) = ANY($${params.length}::text[])`;
}

/**
 * Mijozga JOIN qilinmagan jadvallar uchun (statistika): `fk` — qatorning
 * mijoz id'si ifodasi (masalan `conversations.client_id`). Qaytgan funksiya
 * `' AND EXISTS (... qamrovdagi mijoz ...)'` bo'lagini beradi; bir so'rovda
 * necha marta chaqirilsa ham parametr BIR marta qo'shiladi.
 *
 * Cheklanmaganda bo'sh satr (`params` ga tegilmaydi) — so'rov matni aynan
 * o'zgarmaydi.
 */
export function mijozOrqaliSharti(q: MijozQamrovi, params: unknown[]): (fk: string) => string {
  if (!q.cheklangan) return () => '';
  let shart: string | null = null;
  return (fk) => {
    shart ??= mijozQamroviSharti(q, 'qcl', params);
    return ` AND EXISTS (SELECT 1 FROM clients qcl WHERE qcl.id = ${fk} AND ${shart})`;
  };
}
