/**
 * To'lov hodisasini boshqasidan ajratadigan BARQAROR kalit.
 *
 * NEGA ALOHIDA MODUL: kalit noto'g'ri tanlangani real pulga ta'sir qildi.
 * 19-avgustda bitta 5 091 000 so'mlik to'lov bazaga ikki marta tushdi va
 * mijoz o'sha pul uchun ikki marta rahmat oldi — qoldig'i "yopilgan"
 * bo'lib ko'rindi, ertasi kuni to'lamoqchi bo'lganida agent uni
 * to'xtatdi.
 *
 * Sabab — `external_id` ni kalit deb olganimiz. U CRM'dagi TASHQI
 * HAVOLA va vaqt o'tib almashadi:
 *
 *   17-avgust  external_id = 8569a71b-…            (xonpay tranzaksiyasi)
 *   18-avgust  external_id = 6472625597_34430_…    (bank ko'chirmasi)
 *
 * Yozuvning O'Z kimligi esa `uuid` da va u o'zgarmaydi. Ikkalasi bitta
 * javobda yonma-yon keladi, biz shu paytgacha noto'g'risini olganmiz.
 */

export interface TolovKaliti {
  /** CRM yozuvining o'z identifikatori — barqaror. */
  readonly uuid: string | null;
  /** Tashqi tizimdagi havola — bank ko'chirmasi kelganda ALMASHADI. */
  readonly externalId: string | null;
}

const bormi = (s: string | null): s is string => Boolean(s && s.trim());

/**
 * Hodisaning barqaror kaliti.
 *
 * `uuid` siz javob hali uchramadi (8 shartnoma, 444 yozuv tekshirilgan),
 * lekin bo'lmasa `external_id` ga qaytamiz: beqaror kalit ham kalitsiz
 * qolib yozuvni butunlay yo'qotgandan yaxshi.
 */
export function tolovKaliti(e: TolovKaliti): string | null {
  if (bormi(e.uuid)) return e.uuid.trim();
  if (bormi(e.externalId)) return e.externalId.trim();
  return null;
}

/**
 * Bazada bor, CRM ro'yxatida yo'q kalitlar — o'chirilishi kerak.
 *
 * Kalit `external_id` dan `uuid` ga ko'chgani uchun bazada eski kalit
 * bilan yozilgan qatorlar qoladi; ular tozalanmasa o'sha pul ikki marta
 * sanalaveradi. Grafik uchun bu allaqachon shunday ishlaydi
 * (`replaceSchedule`), tarix esa e'tibordan chetda qolgan edi.
 *
 * HIMOYA: kelgan ro'yxat BO'SH bo'lsa hech narsa o'chirilmaydi. API
 * javobida `payment_histories` kelmasa `mapHistory` bo'sh ro'yxat
 * qaytaradi va bu yerda "hammasi yetim" degan xulosa butun to'lov
 * tarixini o'chirib yuborardi — bitta shartnomani emas, sinxrondan
 * o'tgan hammasini.
 */
export function yetimKalitlar(
  saqlangan: readonly string[],
  kelgan: readonly string[],
): string[] {
  if (!kelgan.length) return [];
  const tirik = new Set(kelgan);
  return saqlangan.filter((k) => !tirik.has(k));
}
