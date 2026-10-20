import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';

/**
 * Xabar `meta` siga uslub tamg'asini qo'shadi.
 *
 * Tamg'a bir marta yoziladi va keyin o'zgarmaydi: akkaunt uslubi
 * almashtirilsa ham eski xabarlar o'z versiyasida qolishi kerak,
 * aks holda hisobotdagi taqqoslash buziladi.
 */
export function uslubTamgasi(
  meta: Record<string, unknown> | undefined,
  style: StyleVersion,
): Record<string, unknown> {
  if (meta && meta.styleVersion !== undefined) return meta;
  return { ...(meta ?? {}), styleVersion: style };
}
