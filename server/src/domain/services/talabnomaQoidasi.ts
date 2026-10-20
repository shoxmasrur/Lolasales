import { type Bayram, ishKunimi } from '@/domain/entities/bayram';
import type { SchedulePayment } from '@/domain/repositories/IContractPaymentRepository';

/**
 * Elektron talabnoma: kimga yuboriladi va muddatlar qachon tugaydi.
 *
 * NEGA SOF: bazaga, soatga va config'ga tegmaydi — shuning uchun CI'dagi
 * «Birlik testlari»da ishlaydi. Bayramlar va "bugun" tashqaridan beriladi.
 */

/** Dushanba–juma. Shanba talabnoma muddatiga sanalmaydi (qonuniy ish haftasi). */
export const ISH_HAFTASI = [1, 2, 3, 4, 5];

/** Kuchga kirish: yuborilgandan keyingi 3-ish kuni. */
const KUCHGA_KIRISH_ISH_KUNI = 3;
/** Javob muddati: kuchga kirgandan keyingi 5-ish kuni. */
const MUDDAT_ISH_KUNI = 5;

/**
 * Oxirgi ikki o'tgan oylik to'lov ikkalasi ham umuman to'lanmaganmi.
 *
 * NEGA "oxirgi ikkitasi": eski oylar qarzdor bo'lib, hozirgilari to'langan
 * mijozga talabnoma yuborish noto'g'ri — u allaqachon to'lashni boshlagan.
 * Qisman to'langan oy ham "tushmagan" emas. Hisoblagich va boshlang'ich
 * to'lov oylik jadvalga kirmaydi, summasi 0 qator esa oy hisoblanmaydi.
 * `status === 'paid'` oy `paid` summasi 0 bo'lsa ham yopilgan: CRM oyni
 * boshqa yo'l bilan (o'tkazma, chegirma) yopgan bo'lishi mumkin.
 */
export function ikkiOyTushmagan(jadval: SchedulePayment[], todayIso: string): boolean {
  const otgan = jadval
    .filter((p) => p.type === 'monthly' && p.amount > 0 && p.dateIso < todayIso)
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
  const [oxirgi, undan] = otgan;
  const tushmagan = (p: SchedulePayment): boolean => p.status !== 'paid' && p.paid <= 0;
  return oxirgi !== undefined && undan !== undefined && tushmagan(oxirgi) && tushmagan(undan);
}

/** `2026-09-02` → `2026-09-03` (mintaqadan mustaqil, UTC). */
function ertasiKun(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Boshdan keyingi N-ish kuni; boshning o'zi sanalmaydi. */
export function ishKuniQosh(boshIso: string, kun: number, bayramlar: Bayram[]): string {
  let iso = boshIso;
  let qoldi = kun;
  // Chegara: ish haftasi bo'sh emas, shuning uchun bu hech qachon cheksiz
  // aylanmaydi, lekin butun yil bayram deb belgilansa baribir to'xtashi kerak.
  for (let i = 0; qoldi > 0; i += 1) {
    if (i > 3650) throw new Error(`${boshIso} dan keyin ${kun} ish kuni topilmadi — bayramlarni tekshiring`);
    iso = ertasiKun(iso);
    if (ishKunimi(iso, bayramlar, ISH_HAFTASI)) qoldi -= 1;
  }
  return iso;
}

export function talabnomaMuddatlari(
  yuborilganIso: string,
  bayramlar: Bayram[],
): { kuchgaKirishIso: string; muddatIso: string } {
  const kuchgaKirishIso = ishKuniQosh(yuborilganIso, KUCHGA_KIRISH_ISH_KUNI, bayramlar);
  return { kuchgaKirishIso, muddatIso: ishKuniQosh(kuchgaKirishIso, MUDDAT_ISH_KUNI, bayramlar) };
}
