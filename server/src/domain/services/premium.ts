import { formatPhone } from '@/shared/phone';

/**
 * Telegram Premium obunasi (2026-10-09).
 *
 * Sana QO'LDA kiritiladi: Telegram akkauntning hozir Premium ekanini
 * bildiradi, lekin obuna qachon tugashini bermaydi. Shu sabab tugash
 * sanasi — operator kiritgan sotib olingan sana + muddat.
 *
 * Premium tizim ishiga ta'sir QILMAYDI (limitlar, akkaunt tanlash) —
 * faqat belgi va eslatma.
 */

/** Panelda tanlanadigan muddatlar, oyda. */
export const PREMIUM_MUDDATLARI = [1, 3, 6, 12, 24] as const;

/**
 * Eslatma bosqichlari: tugashiga shuncha kun qolganda xabar ketadi.
 * `0` — tugagan kuni. Kattadan kichikka.
 */
export const PREMIUM_BOSQICHLARI = [30, 7, 1, 0] as const;
export type PremiumBosqichi = (typeof PREMIUM_BOSQICHLARI)[number];

/**
 * Boshlanish sanasiga `oy` oy qo'shadi.
 *
 * Qisqa oyda kun oyning oxiriga tushadi (31-yanvar + 1 oy = 28-fevral) —
 * JS `Date` ning o'zi bunda martga o'tkazib yuborardi.
 */
export function premiumTugashi(boshlanishIso: string, oy: number): string {
  const [y, m, d] = boshlanishIso.split('-').map(Number) as [number, number, number];
  const jami = y * 12 + (m - 1) + oy;
  const yil = Math.floor(jami / 12);
  const oyIdx = jami % 12;
  const oxirgiKun = new Date(Date.UTC(yil, oyIdx + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yil, oyIdx, Math.min(d, oxirgiKun))).toISOString().slice(0, 10);
}

/** Tugashiga necha kun qolgani. Manfiy — o'tib ketgan. */
export function premiumKunQoldi(untilIso: string, todayIso: string): number {
  const farq = Date.parse(`${untilIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round(farq / 86_400_000);
}

/** Shuncha kun qolganda qaysi bosqichdamiz. `null` — hali erta. */
export function premiumBosqichi(kunQoldi: number): PremiumBosqichi | null {
  if (kunQoldi <= 0) return 0;
  if (kunQoldi <= 1) return 1;
  if (kunQoldi <= 7) return 7;
  if (kunQoldi <= 30) return 30;
  return null;
}

/**
 * Bugun qaysi bosqich eslatmasi ketishi kerak. `null` — hech qaysi.
 *
 * `eslatildi` — shu tugash sanasi uchun oxirgi yuborilgan bosqich.
 * Bosqich faqat KICHRAYGANDA xabar ketadi, shuning uchun server aynan
 * 30-kuni o'chiq bo'lsa ham eslatma yo'qolmaydi (ertasiga ketadi), qayta
 * ishga tushganda esa takrorlanmaydi.
 */
export function premiumEslatmasi(
  untilIso: string | null,
  eslatildi: number | null,
  todayIso: string,
): PremiumBosqichi | null {
  if (!untilIso) return null;
  const bosqich = premiumBosqichi(premiumKunQoldi(untilIso, todayIso));
  if (bosqich === null) return null;
  if (eslatildi !== null && eslatildi <= bosqich) return null;
  return bosqich;
}

/** Eslatma matni. Oddiy matn — `parse_mode` berilmaydi. */
export function premiumXabari(
  akkaunt: { label: string; phone: string; premiumUntil: string },
  todayIso: string,
  panel: string | null,
): string {
  const kun = premiumKunQoldi(akkaunt.premiumUntil, todayIso);
  const [y, m, d] = akkaunt.premiumUntil.split('-');
  return [
    kun <= 0 ? '⭐ Telegram Premium tugadi' : '⭐ Telegram Premium tugayapti',
    '',
    `Akkaunt: ${akkaunt.label} (${formatPhone(akkaunt.phone)})`,
    `Tugash sanasi: ${d}.${m}.${y}`,
    kun > 0 ? `${kun} kun qoldi` : kun === 0 ? 'Bugun tugaydi' : `${-kun} kun oldin tugagan`,
    '',
    panel
      ? `Uzaytirgach, sanani yangilang: ${panel}/telegram`
      : 'Uzaytirgach, panelda Telegram sahifasidan sanani yangilang.',
  ].join('\n');
}
