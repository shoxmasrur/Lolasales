/**
 * Xabar ketganidan keyin mijoz "jim" hisoblanishi uchun o'tishi kerak
 * bo'lgan kun soni.
 *
 * NEGA KUTAMIZ: xabar hozirgina ketgan bo'lsa, mijoz javob berishga
 * ulgurmagan. Kutish vaqtisiz ro'yxatning boshida doim bugun
 * yuborilganlar turardi va u "haqiqatan jim qolganlar" ro'yxati
 * bo'lmasdi.
 */
export const JAVOBSIZ_KUN = 3;

/**
 * Mijoz bilan aloqa qay bosqichda uzilgani.
 *
 *   • `javobsiz`  — xabar ketdi, mijoz bironta ham javob yozmadi
 *   • `oqilmagan` — xabar ketdi, uning o'qilgani TASDIQLANMADI
 *
 * NEGA IKKI XIL: bu ikki mijozga yondashuv boshqacha. Birinchisi
 * xabarni ko'rib e'tiborsiz qoldiryapti, ikkinchisiga esa boshqa kanal
 * (qo'ng'iroq, boshqa raqam) kerak bo'lishi mumkin.
 *
 * Ro'yxat `as const`: HTTP sxemasi (`z.enum`) shundan quriladi, ya'ni
 * kalitlar ikki joyda qo'lda takrorlanmaydi.
 */
export const ALOQA_KALITLARI = ['javobsiz', 'oqilmagan'] as const;

export type AloqaHolati = (typeof ALOQA_KALITLARI)[number];

/**
 * Filtrning SQL sharti — `WHERE` ga qo'shiladigan bo'lak.
 *
 * `clients` jadvali `c` aliasi bilan nomlangan deb hisoblaydi
 * (`buildSearchBase` shunday quradi).
 *
 * DIQQAT: matnga faqat `JAVOBSIZ_KUN` qo'shiladi va u KODDAGI
 * konstanta — so'rovdan kelmaydi. Bu yerga foydalanuvchi kiritgan
 * qiymat hech qachon tushmasligi kerak; kerak bo'lsa `params` orqali
 * uzatiladi.
 *
 * NEGA "3 KUNLIK JIMLIK" HAM MIJOZ BO'YICHA TEKSHIRILADI: mijozda bir
 * nechta suhbat bo'lishi mumkin (har biri boshqa Telegram hisob uchun,
 * `idx_conversations_client_account_alive`). Shart BITTA suhbat qatoriga
 * bog'langanda, 1-akkauntdan 40 kun oldin ketgan eski xabar "3 kundan
 * ko'p o'tdi" shartini qondirar, 2-akkauntdan BUGUN ketgan xabar esa
 * "hali javob yo'q" shartini ham qondirardi — mijozga hozirgina yozib
 * turib uni "jim qolgan" deb ko'rsatardik. Shuning uchun tekshiruv
 * ikkiga bo'lingan: "mijozga umuman xabar ketganmi" (BIRORTA suhbatda)
 * va "oxirgi ${JAVOBSIZ_KUN} kun ichida biror suhbatda xabar ketmaganmi"
 * (HAMMA suhbat bo'yicha) — ya'ni mijozning ENG YAQINDA yozilgan
 * suhbati hisobga olinadi, qaysi akkauntda bo'lishidan qat'i nazar.
 *
 * `last_outbound_at IS NULL` bo'lgan (xabar hali ketmagan) yagona
 * suhbat ikkala shartga ham tushmaydi: birinchi `EXISTS` uni
 * "chiquvchi xabar bor" deb sanamaydi. Bu to'g'ri — hali yozilmagan
 * mijoz "javob bermagan" emas.
 */
const SHARTLAR: Record<AloqaHolati, string> = {
  // Mijoz bir nechta suhbat (har biri boshqa Telegram hisob uchun) bo'lishi
  // mumkin. Agar BIRORTA suhbatda ham o'qilgan javob bo'lsa, u "jim qolgan"
  // emas — yangi kanal yoki boshqa raqam sinab ko'rish kerak.
  javobsiz: `EXISTS (SELECT 1 FROM conversations cv
                     WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                       AND cv.last_outbound_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM conversations cv
                       WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                         AND cv.last_outbound_at >= now() - INTERVAL '${JAVOBSIZ_KUN} days')
      AND NOT EXISTS (SELECT 1 FROM conversations cv
                       WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                         AND cv.last_inbound_at IS NOT NULL)`,

  // "Bironta ham chiquvchi xabar o'qilgan deb belgilanmagan" — ya'ni
  // NOT EXISTS. Suhbat bir nechta bo'lsa, ularning BIRORTASIDA o'qilgan
  // xabar bo'lsa mijoz bu ro'yxatga tushmaydi. O'chirilgan xabarlar
  // hisobga olinmaydi.
  oqilmagan: `EXISTS (SELECT 1 FROM conversations cv
                   WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                     AND cv.last_outbound_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM conversations cv
                       WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                         AND cv.last_outbound_at >= now() - INTERVAL '${JAVOBSIZ_KUN} days')
      AND NOT EXISTS (SELECT 1 FROM messages m
                        JOIN conversations cv ON cv.id = m.conversation_id
                       WHERE cv.client_id = c.id AND cv.deleted_at IS NULL
                         AND m.deleted_at IS NULL
                         AND m.direction = 'out' AND m.read_at IS NOT NULL)`,
};

/**
 * `Record<AloqaHolati, …>` ATAYLAB: yangi kalit qo'shilib, sharti
 * yozilmasa kod kompilyatsiya bo'lmaydi. `if/else` bilan bunday kalit
 * jimgina oxirgi shoxga tushib ketardi.
 */
export function aloqaSharti(key: AloqaHolati): string {
  return SHARTLAR[key];
}
