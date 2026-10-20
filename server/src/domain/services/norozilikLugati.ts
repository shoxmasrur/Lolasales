/**
 * Mijozning norozi ekanini xabar matnidan taxmin qilish.
 *
 * NEGA LUG'AT, MODEL EMAS: sahifa har kuni yuzlab xabarni ko'rib chiqadi
 * va bu ro'yxat faqat E'TIBORNI qaratadi — hech narsani hal qilmaydi.
 * Model uchun to'lash asossiz bo'lardi. Yanglishish narxi ham past:
 * boshliq suhbatni ochib o'zi o'qiydi.
 *
 * MOSLIK SO'Z BO'YICHA: "sud" ni matn ichidan qidirsak "sudralib" ham
 * tushardi. Shuning uchun so'z chegarasi bilan qidiriladi. O'zak
 * ("shikoyat") berilsa, uning qo'shimchali shakllari ham topiladi
 * ("shikoyatchi", "shikoyatingiz") — o'zbekcha qo'shimchalar so'z OXIRIGA
 * qo'shiladi.
 */

/** Hammasi kichik harfda; kirillcha variantlar alohida yozilgan. */
export const NOROZILIK_SOZLARI: readonly string[] = [
  'sudga', 'sudda', 'sudlash', 'sudya', 'судга', 'судда', 'судя',
  'shikoyat', 'шикоят', 'жалоба',
  'prokuratura', 'прокуратура',
  'aldadi', 'aldadingiz', 'aldov', 'алдади',
  'firibgar', 'фирибгар', 'мошенник',
  'bezor', 'безор',
  'uyat', 'уят',
  'huquq', 'advokat', 'адвокат',
  'qaytarib bering', 'shartnomani bekor',
];

/**
 * So'z chegarasi: lotin/kirill harfi yoki apostrof bo'lmagan joy.
 * `\b` yaramaydi — o'zbekcha "o'" dagi apostrofni chegara deb biladi.
 * Ikki turdagi apostrof: oddiy (U+0027) va qiya (U+2019).
 */
const CHEGARA = "[^a-zа-яёўқғҳ'’]";

function qidiruv(soz: string): RegExp {
  // So'z BOSHIDA chegara talab qilinadi, oxirida esa yo'q: qo'shimchali
  // shakllar ("shikoyatingiz") ham topilishi kerak.
  // Matn allaqachon kichikharfga o'tkazilgan, 'i' flagga kerak emas.
  return new RegExp(`(^|${CHEGARA})${soz}`);
}

const SHAKLLAR = NOROZILIK_SOZLARI.map((soz) => ({ soz, re: qidiruv(soz) }));

export function norozilikSozi(matn: string): string | null {
  if (!matn) return null;
  const past = matn.toLowerCase();
  return SHAKLLAR.find(({ re }) => re.test(past))?.soz ?? null;
}

export function norozilikBormi(matn: string): boolean {
  return norozilikSozi(matn) !== null;
}
