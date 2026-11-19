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
