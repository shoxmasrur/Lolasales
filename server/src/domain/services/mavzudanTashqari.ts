/**
 * Mijozning xabari to'lovga aloqasi yo'q topshiriqmi — modelni chaqirmasdan
 * aniqlaydi.
 *
 * NEGA KODDA, PROMPTDA EMAS: qoida sifatida uch marta yozib ko'rildi
 * (114-116 migratsiyalari). Og'ir topshiriqni (tenglama) model rad eta
 * boshladi, lekin "5+9 nechchi?" ga har safar javob berdi — arzimas hisobni
 * rad etish unga mantiqsiz tuyuladi. Bunday xabar uchun modelni umuman
 * chaqirmaslik ham arzonroq, ham ishonchliroq.
 *
 * QAMROV ATAYLAB TOR. Qo'riqchi ishga tushsa mijoz modelning javobini emas,
 * tayyor rad jumlasini oladi — ya'ni xato ushlash haqiqiy mijozga noto'g'ri
 * javob demak. Shuning uchun avval "ushlama" ro'yxati tekshiriladi va
 * shubhali holatda qo'riqchi ISHLAMAYDI (xabar odatdagidek modelga ketadi).
 */

export type TashqariSabab = 'arifmetika' | 'topshiriq';

export interface TashqariNatija {
  readonly tashqarimi: boolean;
  readonly sabab?: TashqariSabab;
}

/**
 * To'lov konteksti — bittasi uchrasa qo'riqchi umuman ishlamaydi.
 *
 * "5-7 oktabrda to'layman" ham, "12+8 mln so'm tashladim" ham arifmetika
 * naqshiga tushadi; ularni aynan shu ro'yxat qutqaradi.
 */
const TOLOV_KONTEKSTI =
  /(to.?l(ov|a|ay|adi|angan)|тўлов|толов|so.?m\b|сўм|сум\b|mln|million|ming\b|минг|oylik|ойлик|shartnoma|шартнома|qarz|қарз|карз|chek|чек|kvitan|квитан|karta|карта|bank|банк|hisob raqam|plastik|oktabr|sentabr|noyabr|dekabr|yanvar|fevral|mart|aprel|iyun|iyul|avgust|октябр|сентябр)/i;

/** Raqam — amal — raqam: "5+9", "2 * 3", "5-7". */
const RAQAM_AMAL_RAQAM = /\d\s*[+\-*/×÷]\s*\d/;

/** Noma'lumli tenglama: "x + x/2 = 121". */
const TENGLAMA = /[xyXY]\s*[+\-*/=]/;

/** So'z bilan aytilgan hisob: "10 ni 2 ga bo'l", "5 ni 3 ga ko'paytir". */
const SOZLI_HISOB =
  /\d+\s*(ni|ta)?\s*\d*\s*(ga)?\s*(bo.?l|ko.?paytir|qo.?sh|ayir|ko.?pay)/i;

/**
 * Aniq topshiriq iboralari — faqat ibora shaklida.
 *
 * "kod yoz" ushlanadi, "shartnoma kodini yozib bering" esa yo'q: birinchisida
 * so'zlar yonma-yon, ikkinchisida orasida qo'shimcha bor va u baribir to'lov
 * kontekstiga tushadi.
 */
const TOPSHIRIQ =
  /(tarjima\s*qil|kod\s*yoz|dastur\s*yoz|insho\s*yoz|hikoya\s*yoz|she.?r\s*(ayt|yoz)|rasm\s*chiz|masala\w*\s*yech|tenglama\w*\s*yech)/i;

/** Arifmetika uchun uzunlik chegarasi — uzun matn odatda haqiqiy suhbat. */
const ENG_KOP_SOZ = 12;

export function mavzudanTashqari(matn: string): TashqariNatija {
  const tozalangan = (matn ?? '').replace(/[‘’`´]/g, "'").trim();
  if (!tozalangan) return { tashqarimi: false };

  // Shubhali holatda ishlamaymiz: to'lov haqidagi gap hech qachon
  // qo'riqchiga tushmasin.
  if (TOLOV_KONTEKSTI.test(tozalangan)) return { tashqarimi: false };

  if (TOPSHIRIQ.test(tozalangan)) return { tashqarimi: true, sabab: 'topshiriq' };

  const sozlar = tozalangan.split(/\s+/).length;
  if (sozlar <= ENG_KOP_SOZ) {
    if (RAQAM_AMAL_RAQAM.test(tozalangan)) return { tashqarimi: true, sabab: 'arifmetika' };
    if (tozalangan.includes('=') && TENGLAMA.test(tozalangan)) {
      return { tashqarimi: true, sabab: 'arifmetika' };
    }
    if (SOZLI_HISOB.test(tozalangan)) return { tashqarimi: true, sabab: 'arifmetika' };
  }

  return { tashqarimi: false };
}

/** Qo'riqchi ishga tushganda mijozga ketadigan matn (116-qoida bilan bir xil). */
export const TASHQARI_JAVOBI =
  "Men to'lov bo'yicha yordam beraman, boshqa masalalarda yordam bera olmayman.";
