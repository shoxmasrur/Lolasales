/**
 * `ClientTelegramResolver.resolve` rad javoblarining operatorga ko'rinadigan
 * sababi. Bitta mijoz va ommaviy suhbat boshlash bir xil matnni ko'rsatadi —
 * operator bitta muammoni ikki xil so'z bilan o'qimasin.
 *
 * Sof modul (config yo'q), shuning uchun istalgan joydan import qilinadi.
 */
export const RESOLVE_REASONS: Record<string, string> = {
  no_phone: 'Mijozning telefon raqami yo\'q',
  not_on_telegram: 'Raqam Telegramda ro\'yxatdan o\'tmagan',
  privacy_restricted: 'Mijoz maxfiylik sozlamasi bilan qidiruvni yopgan',
  profile_taken: 'Bu Telegram profil boshqa mijozda',
  name_mismatch: 'Telegramdagi ism mijozning ismiga mos kelmadi — raqam boshqa odamda bo\'lishi mumkin',
  no_account: 'Yaroqli Telegram akkaunt yo\'q — avval akkaunt qo\'shing yoki yoqing',
  // Akkauntni operator tanlagan, lekin bu mijoz taqsimotga tushmagan
  // (unga allaqachon chiquvchi xabar ketgan, akkaunti esa bo'shatilgan).
  // Bunga tanlanmagan akkauntdan yozib yubormaymiz — operator o'zi hal qilsin.
  not_assigned:
    'Mijozga akkaunt biriktirilmagan — Telegram sahifasida mijozlarni akkauntlarga qayta taqsimlang',
};
