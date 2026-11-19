/**
 * Hamyoncha kirimini chekka moslash — sof funksiya (baza ham, tarmoq ham yo'q).
 *
 * Mijoz "to'ladim" deb chek yuborganda, kutilgan summa va chek vaqti bo'yicha
 * Hamyonchadagi kirimlar orasidan aynan bittasi izlanadi. Qoida ataylab qattiq:
 * shubha bo'lsa avtomatik tasdiqlanmaydi, admin ko'radi.
 */

export interface HamyonTushum {
  /** Hamyonchadagi tranzaksiya id'si. */
  readonly id: string;
  /** So'm. */
  readonly amount: number;
  /** Pul HAQIQATAN tushgan vaqt (Hamyonchaga yozilgan vaqt emas). */
  readonly date: Date;
}

export type MosQaror =
  /** Aynan bitta, boshqa chekka biriktirilmagan tushum topildi — ishonchli. */
  | { readonly kind: 'mos'; readonly tushum: HamyonTushum }
  /** Hozircha mos tushum yo'q (Hamyoncha ~15 daqiqa kechikishi mumkin). */
  | { readonly kind: 'topilmadi'; readonly boshqaSummalar: number[] }
  /** Avtomatik hal qilib bo'lmaydi — admin ko'rsin. */
  | { readonly kind: 'shubha'; readonly sabab: string };

/** Chekdagi vaqt va tushum vaqti orasidagi eng katta farq, daqiqa. */
export const VAQT_FARQI_DAQIQA = 20;
/** O'zbekiston vaqti: UTC+5, yozgi vaqtga o'tmaydi. */
const UTC_OFFSET_DAQIQA = 300;

export type ChekQarori = { readonly ok: true } | { readonly ok: false; readonly sabab: string };

/**
 * Chek rasmidan o'qilgan ma'lumotni Hamyonchadagi tushum va bizning karta bilan solishtiradi.
 *
 * Hammasi mos kelsagina `ok`. O'qib bo'lmagan maydon (summa) — shubha: tushum bilan
 * tasodifan mos kelgan boshqa odam to'lovini tasdiqlab yubormaslik uchun.
 * Karta va vaqt chekda ko'rinmasa (ba'zi ilovalar yashiradi) — shu maydon tekshirilmaydi.
 */
export function chekniSolishtir(i: {
  chek: { amount: number | null; paidAt: string | null; card4: string | null } | null;
  tushum: HamyonTushum;
  /** Bizning faol karta oxirgi 4 raqami; `null` — karta yo'q. */
  bizningKarta4: string | null;
}): ChekQarori {
  const c = i.chek;
  if (!c || c.amount === null) return { ok: false, sabab: "Chekdan summani o'qib bo'lmadi (rasm xira yoki chek emas)" };

  if (c.amount !== i.tushum.amount) {
    return { ok: false, sabab: `Chekda ${c.amount} so'm, Hamyonchada ${i.tushum.amount} so'm tushgan` };
  }

  if (c.card4 && i.bizningKarta4 && c.card4 !== i.bizningKarta4) {
    return { ok: false, sabab: `Chekdagi karta (…${c.card4}) bizning karta (…${i.bizningKarta4}) emas` };
  }

  if (c.paidAt) {
    const [sana, vaqt] = c.paidAt.split(' ') as [string, string];
    const chekUtc = Date.parse(`${sana}T${vaqt}:00Z`) - UTC_OFFSET_DAQIQA * 60_000;
    const farq = Math.abs(chekUtc - i.tushum.date.getTime()) / 60_000;
    if (Number.isNaN(farq) || farq > VAQT_FARQI_DAQIQA) {
      return { ok: false, sabab: `Chekdagi vaqt (${c.paidAt}) Hamyonchadagi tushum vaqtidan ${Math.round(farq)} daqiqa farq qiladi` };
    }
  }

  return { ok: true };
}

/** Chekdan oldingi necha soatlik tushumlar ko'riladi. */
export const OYNA_SOAT = 3;
/** Soat farqi chegarasi: kelajakdagi tushum (soat noaniqligi) uchun zaxira, daqiqa. */
const KELAJAK_DAQIQA = 10;

export function tushumniTanla(i: {
  tushumlar: readonly HamyonTushum[];
  /** Mijoz to'lashi kerak summa; `null` — aniqlab bo'lmadi. */
  kutilgan: number | null;
  /** Chek kelgan vaqt. */
  chekVaqti: Date;
  hozir: Date;
  /** Boshqa chekka allaqachon biriktirilgan tushum id'lari. */
  band: ReadonlySet<string>;
}): MosQaror {
  if (i.kutilgan === null || i.kutilgan <= 0) {
    return { kind: 'shubha', sabab: "Kutilgan summa aniqlanmadi (kurs narxi yoki bo'lib to'lash qismi yo'q)" };
  }

  const boshi = i.chekVaqti.getTime() - OYNA_SOAT * 3_600_000;
  const oxiri = i.hozir.getTime() + KELAJAK_DAQIQA * 60_000;
  const oynada = i.tushumlar.filter((t) => t.date.getTime() >= boshi && t.date.getTime() <= oxiri);

  const bosh = oynada.filter((t) => !i.band.has(t.id));
  const bir = bosh.filter((t) => t.amount === i.kutilgan);

  if (bir.length === 1) return { kind: 'mos', tushum: bir[0]! };
  if (bir.length > 1) {
    return { kind: 'shubha', sabab: `Bir xil summali (${i.kutilgan}) bir nechta tushum bor — qaysi biri ekani noaniq` };
  }

  // Shu summaning o'zi bor, lekin boshqa chekka biriktirilgan: takroriy chek.
  if (oynada.some((t) => t.amount === i.kutilgan)) {
    return { kind: 'shubha', sabab: "Shu summali tushum allaqachon boshqa chekka biriktirilgan (takroriy chek bo'lishi mumkin)" };
  }

  return { kind: 'topilmadi', boshqaSummalar: bosh.map((t) => t.amount) };
}
