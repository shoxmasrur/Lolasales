-- Telegramda odam O'ZINI qanday nomlagani.
--
-- Ilgari faqat `telegram_username` saqlanardi, lekin ko'p foydalanuvchida
-- username umuman yo'q. Debitor bo'limi xodimi "bu haqiqatan bizning
-- mijozimizmi?" degan savolga javob topishi uchun aynan ko'rsatiladigan
-- ISM kerak.
--
-- `name_mismatch` holatida ham to'ldiriladi — xodim kimga tushib qolganini
-- ko'rib, raqamni tuzatishi yoki qo'lda tasdiqlashi mumkin bo'lsin.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_name TEXT;

COMMENT ON COLUMN clients.telegram_name IS
  'Telegramdagi ko''rsatiladigan ism (first + last). Mijozning F.I.O. si bilan '
  'solishtirish uchun saqlanadi — raqamlar qo''ldan qo''lga o''tadi.';
