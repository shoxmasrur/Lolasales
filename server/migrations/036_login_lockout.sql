-- Parolni terib topishdan himoya: 3 ta xato urinishdan keyin hisob bloklanadi.
--
-- MUAMMO: kirish sahifasida hech qanday cheklov yo'q edi. Parolni cheksiz
-- marta sinab ko'rish mumkin — dashboardda esa mijozlarning shaxsiy
-- ma'lumotlari, telefon raqamlari va Telegram akkauntlari boshqaruvi bor.
--
-- YECHIM: har bir xato urinish sanaladi. Uchinchisidan keyin `locked_at`
-- qo'yiladi va foydalanuvchi to'g'ri parol bilan ham kira olmaydi —
-- administrator blokdan chiqarishi kerak.
--
-- Blok VAQT bo'yicha o'zi ochilmaydi (ataylab): avtomatik ochilish
-- hujumchiga kutib turib davom etish imkonini beradi va hodisa
-- e'tiborsiz qolib ketadi. Odam aralashuvi — hodisa ko'rilganining
-- kafolati.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

COMMENT ON COLUMN users.failed_login_attempts IS
  'Ketma-ket xato urinishlar soni. Muvaffaqiyatli kirishda nolga tushadi.';
COMMENT ON COLUMN users.locked_at IS
  'Hisob bloklangan vaqt. NULL bo''lmasa kirish taqiqlanadi — faqat '
  'administrator ochadi (yoki serverda `npm run seed`, admin hisobi uchun).';

-- ─── Ruxsat ────────────────────────────────────────────────────────────────
--
-- Blokdan chiqarish `users.manage` ruxsatiga bog'lanadi — bu allaqachon
-- parol tiklash va hisobni o'chirish huquqini beradi, ya'ni yangi
-- ruxsat kiritish shart emas.
