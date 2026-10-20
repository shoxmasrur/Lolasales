/**
 * Shartnomaning CRM'dagi holati — mijozga yozamizmi yoki yo'q.
 *
 * Uch holatdagi shartnoma bo'yicha yoziladi (`YOZILADIGAN_KALITLAR`):
 * "Сотилди", "К оплате" va "Проц. отказ". "К возврату" da pul mijozga
 * qaytarilyapti, "В ожидании" esa hali sotilmagan — ularga yozilmaydi.
 *
 * TARIX: 2026-08-10 dan 2026-10-13 gacha FAQAT "Сотилди" yozilardi —
 * "Проц. отказ" (bekor qilinayotgan shartnoma) dan pul talab qilish
 * noto'g'ri deb hisoblangan. 2026-10-13 da rahbariyat qarori bilan
 * "К оплате" va "Проц. отказ" ham qo'shildi. Agent bunday shartnomaning
 * holatini kontekstda ko'radi (`agentUchunHolat`) va mijoz bekor qilish
 * yoki pul qaytarish haqida gapirsa menejerga uzatadi (agent qoidasi
 * "SHARTNOMA HOLATI", 123-migratsiya).
 *
 * NEGA `status` EMAS, `virtual_status`: `status.type` juda qo'pol va bekor
 * qilinayotgan shartnomada ham `sold` bo'lib qolaveradi. 6816MSO26HE aynan
 * shunday edi — `status.type = sold`, `virtual_status = cancellation_process`
 * ("Проц. отказ") — va unga xabar ketib qolgan edi (2026-08-10).
 *
 * CRM'da uchraydigan qiymatlar: `sold` (Сотилди), `waiting` (В ожидании),
 * `for_payment` (К оплате), `for_return` (К возврату),
 * `cancellation_process` (Проц. отказ).
 */

/**
 * "Сотилди" ning bazadagi barcha yozilishi.
 *
 * Ustunga IKKI manba yozadi va ular boshqa-boshqa lug'atda:
 *   • CRM sinxronizatsiyasi — KALIT (`sold`)
 *   • Excel eksporti        — ko'rinadigan NOM ("Сотилди")
 *
 * Sinxronizatsiya har safar kalit bilan ustiga yozadi, ya'ni vaqt o'tib
 * hammasi `sold` ga keladi. Nomlar esa hali sinxronlanmagan qatorlar uchun
 * qoladi — shuning uchun ikkalasi ham qabul qilinadi.
 *
 * "Продан" ATAYLAB yo'q: u `status` ustunining nomi va bekor qilinayotgan
 * shartnomada ham turadi. Uni bu ro'yxatga qo'shish filtrni teshib qo'yardi.
 */
export const SOTILDI_QIYMATLARI: readonly string[] = ['sold', 'сотилди', 'sotildi', 'sotilgan'];

/**
 * CRM holatlari lug'ati: kalit → ko'rinadigan nom va bazadagi yozilishlari.
 *
 * NEGA KERAK: bitta holat bazada IKKI XIL yozilgan bo'lishi mumkin —
 * sinxronizatsiya kalitni (`cancellation_process`), Excel esa nomni
 * ("Проц. отказ") yozadi. Prodda ikkalasi ham bor (2026-08-11: 80 va 2 ta).
 * Filtrda ular bitta variant bo'lib ko'rinishi kerak, aks holda operator
 * bir xil holatni ikki marta tanlashga majbur bo'lardi.
 */
export interface ShartnomaHolati {
  readonly key: string;
  readonly label: string;
  /** Bazadagi barcha yozilishlari — kichik harfda, qirqilgan holda. */
  readonly values: readonly string[];
}

export const SHARTNOMA_HOLATLARI: readonly ShartnomaHolati[] = [
  { key: 'sold', label: 'Сотилди', values: SOTILDI_QIYMATLARI },
  {
    key: 'cancellation_process',
    label: 'Проц. отказ',
    values: ['cancellation_process', 'проц. отказ', 'проц.отказ'],
  },
  { key: 'for_payment', label: 'К оплате', values: ['for_payment', 'к оплате'] },
  { key: 'for_return', label: 'К возврату', values: ['for_return', 'к возврату'] },
  { key: 'waiting', label: 'В ожидании', values: ['waiting', 'в ожидании'] },
];

/**
 * Shu holatdagi shartnoma bo'yicha mijozga yoziladi — KALITLAR.
 * Yagona manba: `yoziladimi` (JS) va `YOZILADIGAN_SQL_QIYMATLARI` (SQL)
 * ikkalasi ham shundan quriladi.
 */
export const YOZILADIGAN_KALITLAR: readonly string[] = ['sold', 'for_payment', 'cancellation_process'];

/** Yoziladigan holatlarning bazadagi barcha yozilishi — kichik harfda. */
const YOZILADIGAN_QIYMATLAR: readonly string[] = SHARTNOMA_HOLATLARI
  .filter((h) => YOZILADIGAN_KALITLAR.includes(h.key))
  .flatMap((h) => h.values);

/**
 * SQL solishtiruvi uchun barcha harf variantlari.
 *
 * NEGA KERAK: baza `lc_collate = C` bilan yaratilgan va Postgres'ning
 * `lower()` funksiyasi bunda KIRILL harflarni tushirmaydi — `lower('Сотилди')`
 * o'zgarishsiz qaytadi. Ya'ni `lower(x) = 'сотилди'` solishtiruvi Excel'dan
 * kelgan "Сотилди" ni HECH QACHON topmasdi va o'sha mijozlarga xabar
 * jimgina yubormay qo'yardi (2026-08-11 da aniqlandi).
 *
 * Shu sabab harf variantlari SQL'da emas, JS'da yasaladi: bu yerda
 * `toLowerCase()` kirill bilan to'g'ri ishlaydi va natija bazaning
 * kollatsiyasiga umuman bog'liq emas.
 */
function harfVariantlari(value: string): string[] {
  const v = value.trim();
  const bosh = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return [...new Set([v, v.toLowerCase(), v.toUpperCase(), bosh])];
}

/**
 * SQL `= ANY(...)` uchun qiymatlar ro'yxati.
 *
 * Solishtirish `trim(ustun)` bilan ketadi — `lower()` ISHLATILMAYDI
 * (yuqoridagi izohga qarang).
 */
export function holatSqlQiymatlari(key: string): string[] {
  return holatQiymatlari(key).flatMap(harfVariantlari);
}

/** Yoziladigan holatlarning SQL uchun barcha yozilishi — harf variantlari bilan. */
export const YOZILADIGAN_SQL_QIYMATLARI: readonly string[] = [
  ...new Set(YOZILADIGAN_KALITLAR.flatMap(holatSqlQiymatlari)),
];

/** Bazadagi xom qiymat qaysi holatga tegishli. Tanilmasa `null`. */
export function holatniAniqla(virtualStatus: string | null | undefined): ShartnomaHolati | null {
  const v = virtualStatus?.trim().toLowerCase();
  if (!v) return null;
  return SHARTNOMA_HOLATLARI.find((h) => h.values.includes(v)) ?? null;
}

/** Sahifada ko'rsatiladigan holat: kanonik kalit va CRM'dagi nomi. */
export interface HolatKorinishi {
  readonly kalit: string;
  readonly nomi: string;
}

/**
 * Bazadagi xom qiymatni ko'rinishga aylantiradi (kalit YOKI nom kelishi
 * mumkin — yuqoridagi izoh). Tanilmagan qiymat qirqilgan holda o'zi
 * qoladi: CRM yangi holat qo'shsa ham ustunda va filtrda ko'rinadi
 * (`holatSqlQiymatlari` uni xom qiymat sifatida qidiradi). Bo'sh — `null`.
 */
export function holatKorinishi(virtualStatus: string | null | undefined): HolatKorinishi | null {
  const v = virtualStatus?.trim();
  if (!v) return null;
  const holat = holatniAniqla(v);
  return holat ? { kalit: holat.key, nomi: holat.label } : { kalit: v, nomi: v };
}

/**
 * Server filtri uchun: bazadagi xom qiymatlardan aynan shu kalitga
 * KO'RINADIGANLARI (`holatKorinishi`), o'zgarishsiz.
 *
 * NEGA `holatSqlQiymatlari` yetmaydi: u faqat butun satr harf variantlarini
 * yasaydi ("Проц. отказ", "ПРОЦ. ОТКАЗ", …). Aralash yozilish ("Проц. Отказ")
 * ustunda «Проц. отказ» bo'lib ko'rinardi-yu, filtr uni topmasdi. Bazadagi
 * xom qiymatlarni JS'da (`toLowerCase` kirillni to'g'ri tushiradi) tasniflab,
 * aynan o'zlari bilan `= ANY(...)` qilish ko'rinish va filtrni BIR XIL qiladi —
 * `lower()` siz (C kollatsiya).
 */
export function kalitgaMosXomlar(xomlar: Iterable<string | null | undefined>, kalit: string): string[] {
  const natija = new Set<string>();
  for (const x of xomlar) {
    const v = x?.trim();
    if (v && holatKorinishi(v)?.kalit === kalit) natija.add(v);
  }
  return [...natija];
}

/**
 * Filtr variantlari: xom qiymatlardan takrorsiz ko'rinishlar. Tartib —
 * `SHARTNOMA_HOLATLARI` dagi kabi, tanilmaganlar oxirida (nomi bo'yicha).
 */
export function holatVariantlari(xomlar: Iterable<string | null | undefined>): HolatKorinishi[] {
  const map = new Map<string, HolatKorinishi>();
  for (const x of xomlar) {
    const k = holatKorinishi(x);
    if (k && !map.has(k.kalit)) map.set(k.kalit, k);
  }
  const tartib = (k: HolatKorinishi): number => {
    const i = SHARTNOMA_HOLATLARI.findIndex((h) => h.key === k.kalit);
    return i === -1 ? SHARTNOMA_HOLATLARI.length : i;
  };
  return [...map.values()].sort((a, b) => tartib(a) - tartib(b) || a.nomi.localeCompare(b.nomi));
}

/**
 * Filtr uchun: berilgan kalitga mos keladigan barcha xom qiymatlar.
 *
 * Tanilmagan kalit kelsa uning O'ZI qaytariladi — CRM yangi holat
 * qo'shsa, u ro'yxatda "xom" nomi bilan chiqadi va filtr baribir ishlaydi.
 */
export function holatQiymatlari(key: string): string[] {
  const holat = SHARTNOMA_HOLATLARI.find((h) => h.key === key);
  return holat ? [...holat.values] : [key.trim().toLowerCase()];
}

/**
 * Shu shartnoma bo'yicha mijozga yozish mumkinmi.
 *
 * NULL — hali sinxronlanmagan yoki holati noma'lum shartnoma. Bunda ham
 * YOZILMAYDI: shubha bo'lganda jim turish, puli qaytarilayotgan mijozdan
 * pul talab qilishdan arzonroq. Operator buni ko'radi — ommaviy boshlash
 * oynasida "holati yozishga mos emas" degan alohida sabab chiqadi.
 */
export function yoziladimi(virtualStatus: string | null | undefined): boolean {
  const v = virtualStatus?.trim().toLowerCase();
  return Boolean(v) && YOZILADIGAN_QIYMATLAR.includes(v!);
}

/**
 * Agent kontekstida ko'rsatiladigan holat nomi.
 *
 * "Сотилди" — odatdagi holat, qator chiqmaydi (`null`). Qolgan
 * yoziladigan holatlarda agent holatni bilishi kerak: mijoz "bekor
 * qilishga ariza berganman" desa, to'lov talab qilishda davom etmasin.
 */
export function agentUchunHolat(virtualStatus: string | null | undefined): string | null {
  const holat = holatniAniqla(virtualStatus);
  return holat && holat.key !== 'sold' ? holat.label : null;
}

/** Ro'yxatdan faqat yoziladigan holatdagilarini qoldiradi. */
export function faqatYoziladiganlar<T extends { virtualStatus: string | null }>(items: readonly T[]): T[] {
  return items.filter((c) => yoziladimi(c.virtualStatus));
}
