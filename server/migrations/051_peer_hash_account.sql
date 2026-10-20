-- Keshlangan Telegram peer'ini QAYSI akkaunt topgani.
--
-- NEGA: MTProto'da `access_hash` mijozga emas, (akkaunt, peer) juftligiga
-- bog'langan. Shu paytgacha `telegram_access_hash` mijozga bog'lab
-- saqlanardi va uni kim topgani hech qayerda yozilmasdi.
--
-- Oqibati prodda ko'rindi (2026-08-08): ommaviy suhbat boshlashda operator
-- akkaunt tanlaganda mijozlar qayta taqsimlanadi, keyin YANGI akkaunt eski
-- hash bilan yozmoqchi bo'ladi va Telegram `PEER_ID_INVALID` qaytaradi —
-- suhbat umuman boshlanmaydi.
ALTER TABLE clients
  ADD COLUMN telegram_hash_account_id UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL;

-- Mavjud qatorlarni to'ldirish.
--
-- Hash'ni kim topganini to'g'ridan-to'g'ri bilmaymiz, lekin xulosa qilsa
-- bo'ladi: akkaunt oxirgi qidiruvdan KEYIN almashtirilmagan bo'lsa, hash
-- hozirgi akkauntniki. `account_assigned_at > telegram_checked_at` bo'lgan
-- qatorlar esa aynan buzilganlari — ular NULL qoladi va birinchi
-- murojaatda avtomatik qayta qidiriladi.
--
-- NEGA HAMMASINI NULL QOLDIRMAYMIZ: har bir qayta qidiruv `importContacts`
-- so'rovi, ya'ni spam filtri uchun signal va kunlik qidiruv kvotasidan
-- yeydi. Buzilmagan mijozlarni behuda qayta qidirish akkauntlarni
-- cheklovga yaqinlashtirardi.
UPDATE clients
   SET telegram_hash_account_id = telegram_account_id
 WHERE telegram_user_id    IS NOT NULL
   AND telegram_account_id IS NOT NULL
   AND telegram_checked_at IS NOT NULL
   AND (account_assigned_at IS NULL OR account_assigned_at <= telegram_checked_at);
