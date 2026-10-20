/**
 * Bayram va dam olish kunlari.
 *
 * NEGA KERAK: bayram kunlari banklar ishlamaydi — mijoz to'lay olmaydi.
 * O'sha kunlari xabar yuborish ham, va'dani "buzildi" deb belgilash ham
 * noto'g'ri: mijoz aybdor emas, kanal yopiq.
 *
 * Bu modul bazaga ham, soatga ham tegmaydi — sanani satr sifatida oladi.
 */

export interface Bayram {
  readonly id: string;
  readonly name: string;
  /** YYYY-MM-DD */
  readonly startsOn: string;
  /** YYYY-MM-DD; bir kunlik bayramda `startsOn` ga teng. */
  readonly endsOn: string;
  /** `true` — YIL e'tiborga olinmaydi, faqat oy-kun solishtiriladi. */
  readonly yillik: boolean;
}

/** `2026-08-28` → `08-28`. */
const oyKun = (iso: string): string => iso.slice(5);

/**
 * Shu sana bayramga tushsa — o'sha bayram, aks holda `null`.
 *
 * Sanalar `YYYY-MM-DD` satri sifatida solishtiriladi: bu formatda
 * leksikografik tartib xronologik tartib bilan bir xil, ya'ni `Date`
 * yaratish va vaqt mintaqasi bilan ovora bo'lish shart emas.
 *
 * `yillik` yozuvda solishtiruv `MM-DD` bo'yicha ketadi. Bunday oraliq
 * yil chegarasidan o'ta olmaydi (`endsOn` ning oy-kuni `startsOn`
 * nikidan kichik bo'lmasligi kiritishda tekshiriladi), shuning uchun
 * oddiy ikki tomonlama solishtiruv yetarli.
 */
export function bayramKuni(sanaIso: string, bayramlar: Bayram[]): Bayram | null {
  const md = oyKun(sanaIso);
  return (
    bayramlar.find((h) =>
      h.yillik
        ? oyKun(h.startsOn) <= md && md <= oyKun(h.endsOn)
        : h.startsOn <= sanaIso && sanaIso <= h.endsOn,
    ) ?? null
  );
}

/** `2026-09-09` → 3 (chorshanba). 1 = Dushanba … 7 = Yakshanba. */
function haftaKuni(sanaIso: string): number {
  // `T00:00:00Z` — UTC yarim tuni; kun raqami mintaqadan qat'i nazar
  // bir xil chiqadi, chunki sana allaqachon mintaqa bo'yicha hisoblangan
  // satr sifatida keladi (`zonedParts().isoDate`).
  const kun = new Date(`${sanaIso}T00:00:00Z`).getUTCDay();
  return kun === 0 ? 7 : kun;
}

/** Ish kunimi: bayram ham emas, `weekdays` ichida ham bor. */
export function ishKunimi(sanaIso: string, bayramlar: Bayram[], weekdays: number[]): boolean {
  if (bayramKuni(sanaIso, bayramlar)) return false;
  // Bo'sh `weekdays` — dushanbadan shanbagacha (1-6), `evaluateWindow`
  // (`SendWindowPolicy.ts`) bilan BIR XIL sukut. Ikkalasi bitta
  // `runtime.weekdays` sozlamasini oladi: bu yerda bo'shni "hech qanday
  // kun ish kuni emas" deb o'qisak, ular kelishmay qoladi — `ishKuniga`
  // 60 marta aylanib xato tashlaydi, u esa `PromiseWatcher.verify()`
  // ichida bo'lgani uchun BUTUN tsikl jimgina o'lib qoladi.
  const kunlar = weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6];
  return kunlar.includes(haftaKuni(sanaIso));
}

/** `2026-09-02` → `2026-09-03`. */
function ertasiKun(sanaIso: string): string {
  const d = new Date(`${sanaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Shu sana ish kuni bo'lsa — o'zini, aks holda KEYINGI ish kunini
 * qaytaradi.
 *
 * NEGA CHEGARA BOR: `weekdays` bo'sh qolsa (sozlamada xato) yoki butun
 * yil bayram deb belgilansa, sikl cheksiz aylanardi va kuzatuvchi
 * jarayonni qotirib qo'yardi. 60 kun — har qanday haqiqiy bayramdan
 * ancha uzun, ya'ni bu chegaraga urilish sozlama xatosi degani.
 */
export function ishKuniga(sanaIso: string, bayramlar: Bayram[], weekdays: number[]): string {
  let kun = sanaIso;
  for (let i = 0; i < 60; i += 1) {
    if (ishKunimi(kun, bayramlar, weekdays)) return kun;
    kun = ertasiKun(kun);
  }
  throw new Error(`${sanaIso} dan keyin 60 kun ichida ish kuni topilmadi — sozlamani tekshiring`);
}
