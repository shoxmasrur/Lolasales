import type { TelegramAccount } from '@/domain/entities/TelegramAccount';

/**
 * Muvaffaqiyatsiz urinishdan keyingi tanaffus.
 *
 * NEGA KERAK: o'lik proksiga qayta ulanish `connectionRetries: 5` bilan
 * ~60 soniya yeydi. Kuzatuvchi har 2 daqiqada yursa, tanaffussiz bu
 * deyarli uzluksiz urinish bo'lardi — akkaunt uchun ham, proksi uchun
 * ham foydasiz yuk.
 */
export const QAYTA_URINISH_TANAFFUSI_MS = 5 * 60 * 1000;

export type UlanishQarori = 'ulangan' | 'qayta_ulash' | 'otkazib_yuborish';

/**
 * Akkauntni hozir qayta ulash kerakmi.
 *
 * Qoidalar QAT'IY TARTIBDA tekshiriladi — tartib xatti-harakatni
 * o'zgartiradi va spec'da asoslangan.
 */
export function ulanishQarori(input: {
  account: Pick<TelegramAccount, 'isEnabled' | 'session' | 'status'>;
  /** Klient hozir tirikmi — `client.connected === true`. */
  ulanganmi: boolean;
  /** Oxirgi MUVAFFAQIYATSIZ urinish. `null` — hali yiqilmagan. */
  oxirgiXatoUrinishi: Date | null;
  hozir: Date;
}): UlanishQarori {
  const { account, ulanganmi, oxirgiXatoUrinishi, hozir } = input;

  // 1. Operator ataylab o'chirgan — tizim uni qayta ko'tarmaydi.
  if (!account.isEnabled) return 'otkazib_yuborish';

  // 2. Ulanadigan narsa yo'q.
  if (!account.session) return 'otkazib_yuborish';

  // 3. Sessiya eskirgan. Qayta ulanish buni TUZATMAYDI — faqat panelda
  //    qo'lda qayta login tuzatadi. Cheksiz urinish foydasiz.
  if (account.status === 'logged_out') return 'otkazib_yuborish';

  // 4. Telegram bloklagan.
  if (account.status === 'banned') return 'otkazib_yuborish';

  // 5. Tirik klient — 6-qoidadan OLDIN: yaqinda yiqilib, keyin o'zi
  //    tiklangan akkaunt tanaffus tufayli "o'lik" ko'rsatilmasin.
  if (ulanganmi) return 'ulangan';

  // 6. Tanaffus.
  if (oxirgiXatoUrinishi) {
    // Soat orqaga siljisa (NTP tuzatishi) `hozir` xato vaqtidan oldinroq
    // ko'rinishi mumkin va farq manfiy chiqadi. Manfiyni 0 ga qisqartiramiz
    // — aks holda keyingi hisob-kitoblarda "o'tgan vaqt manfiy" degan
    // ma'nosiz qiymat bilan ishlashga to'g'ri kelardi; tanaffus qoidasi
    // esa har doim "hali yetarli vaqt o'tmadi" deb talqin qilinishi kerak.
    const otgan = Math.max(0, hozir.getTime() - oxirgiXatoUrinishi.getTime());
    if (otgan < QAYTA_URINISH_TANAFFUSI_MS) return 'otkazib_yuborish';
  }

  // 7. Qayta ulanadi.
  return 'qayta_ulash';
}
