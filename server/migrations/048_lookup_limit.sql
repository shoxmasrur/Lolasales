-- Telefon qidiruvi (contacts.importContacts) uchun alohida kunlik chegara.
--
-- NEGA ALOHIDA: qidiruv Telegramning spam filtri uchun xabar yuborishdan
-- kam bo'lmagan signal. Shu paytgacha u umuman cheklanmagan edi —
-- hisoblagich faqat xabar ketganda oshardi, ya'ni 0 ta xabar yuborib
-- kuniga yuzlab raqam qidirish mumkin edi.
--
-- Sana ustuni yangi emas: `counter_date` ikkala hisoblagich uchun
-- ishlatiladi va ular bir vaqtda nolga tushadi.
ALTER TABLE telegram_accounts
  ADD COLUMN lookup_limit  INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN lookups_today INTEGER NOT NULL DEFAULT 0;

-- Yangi akkauntlar uchun kunlik xabar chegarasi 30 ga tushadi.
ALTER TABLE telegram_accounts ALTER COLUMN daily_limit SET DEFAULT 30;

-- Mavjud akkauntlar: aynan 40 bo'lganlar eski STANDART qiymatda turibdi,
-- ya'ni ularga hech kim qo'lda tegmagan — ularni 30 ga tushiramiz.
-- Boshqa songa qo'yilgan akkaunt ongli qaror deb hisoblanadi va
-- tegilmaydi.
UPDATE telegram_accounts SET daily_limit = 30 WHERE daily_limit = 40;
