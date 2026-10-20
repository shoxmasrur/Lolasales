/**
 * Karta raqami va yopiq guruh havolasini LLM YOZMAYDI va KO'RMAYDI.
 *
 * Ikki tomonlama himoya:
 *   • kirish — tizim yuborgan karta/havola xabari suhbat tarixiga xom holda
 *     tushmaydi, o'rniga belgi qo'yiladi (model eski kartani ko'chirmasin);
 *   • chiqish — model javobida karta raqami yoki yopiq havola bo'lsa, javob
 *     yuborilmaydi va suhbat menejerga o'tadi.
 */

export const KARTA_BELGISI = "[tizim to'lov kartasini alohida xabar qilib yubordi]";
export const HAVOLA_BELGISI = '[tizim yopiq guruh havolasini alohida xabar qilib yubordi]';

/** Tarixga tushadigan matn: tizimning karta/havola xabari belgiga almashadi. */
export function tarixMatni(meta: Record<string, unknown> | null | undefined, matn: string): string {
  const kind = meta?.kind;
  if (kind === 'karta') return KARTA_BELGISI;
  if (kind === 'havola') return HAVOLA_BELGISI;
  return matn;
}

/** 16 ta raqam (bo'shliq yoki chiziqcha bilan ham) — karta raqami. */
const KARTA_RAQAMI = /(?<!\d)\d(?:[ \-  ]?\d){15}(?!\d)/;
/** Telegram yopiq taklif havolasi. */
const YOPIQ_HAVOLA = /t\.me\/(?:\+|joinchat\/)/i;

/** Model javobida karta raqami yoki yopiq havola bormi. */
export function maxfiyQiymatBormi(matn: string | null | undefined): boolean {
  if (!matn) return false;
  return KARTA_RAQAMI.test(matn) || YOPIQ_HAVOLA.test(matn);
}

export const MAXFIY_SABAB = 'Agent javobida karta/havola bor edi — yuborilmadi';
