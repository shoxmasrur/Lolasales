import { zonedParts } from '@/shared/datetime';

/**
 * Oxirgi xabardan keyin kun almashganmi.
 *
 * Qarorni KOD qabul qiladi: promptga vaqt tamg'alarini berib "yangi kunmi"
 * deb modeldan so'rash — har safar boshqacha javob keladigan joy, salom esa
 * bor yoki yo'q bo'lishi kerak. Tarix bo'sh bo'lsa ham yangi kun: bu suhbatdagi
 * birinchi xabar.
 */
export function yangiKunmi(lastMessageAt: Date | null, now: Date, timeZone: string): boolean {
  if (!lastMessageAt) return true;
  return zonedParts(lastMessageAt, timeZone).isoDate !== zonedParts(now, timeZone).isoDate;
}

/**
 * Tarixdagi oxirgi CHIQUVCHI xabarning vaqti.
 *
 * Salom "bugun bizning birinchi xabarimizmi?" degan savolga bog'langan,
 * shuning uchun mijozning xabarlari sanalmaydi: javob rejimida mijozning
 * endigina kelgan xabari tarixda allaqachon turadi va har safar "bugun
 * yozishgan ekanmiz" degan noto'g'ri xulosa chiqardi.
 *
 * Operator qo'lda yozgan xabar ham chiquvchi hisoblanadi — u yozgandan keyin
 * agent qayta salomlashsa, mijoz ikki marta salom oladi.
 *
 * Operatorning agentga TOPSHIRIG'I (`operator` roli) esa sanalmaydi: u
 * mijozga ketmagan ichki qayd. Sanalsa, topshiriqdan keyingi xabar "bugun
 * yozishganmiz" deb salomsiz ketardi — mijoz esa bugun hech narsa olmagan.
 */
export function oxirgiChiquvchiVaqti(
  history: ReadonlyArray<{ role: 'client' | 'agent' | 'operator'; at: Date }>,
): Date | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item && item.role === 'agent') return item.at;
  }
  return null;
}

/**
 * Tizim boshlaydigan xabarning salomlashish qoidasi.
 *
 * Yangi kun boshlangan bo'lsa xabar salomdan va hol-ahvol so'rashdan boshlanadi.
 * Aks holda taqiq: o'sha kunning ichida ikkinchi marta salomlashish yozishmani
 * "botga" o'xshatib qo'yadi.
 *
 * `asosiyGap` — salomdan keyin keladigan qismning nomi ("eslatma", "rahmat"):
 * modelga "shundan keyin nimaga o'tish" kerakligi aniq aytiladi.
 */
export function salomlashuvQoidasi(yangiKun: boolean, asosiyGap = 'asosiy gap'): string {
  if (!yangiKun) {
    return (
      '- Bugun bu mijoz bilan allaqachon yozishgansan — QAYTA SALOMLASHMA, ' +
      `to'g'ridan-to'g'ri ${asosiyGap}dan boshla.`
    );
  }
  return (
    '- YANGI KUN BOSHLANDI (oxirgi xabardan keyin kun almashgan). Xabarni ALBATTA ' +
    '"Assalomu alaykum" bilan boshla, keyin hol-ahvolini so\'ra ("yaxshimisiz?", ' +
    `"ishlaringiz yaxshimi?") va faqat SHUNDAN KEYIN ${asosiyGap}ga o't. ` +
    'Kirill alifbosida yozadigan mijozga — "Ассалому алайкум". ' +
    'Salomlashuv va hol-ahvol so\'rashni tashlab ketma.'
  );
}
