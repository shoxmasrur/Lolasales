-- Cheklov QACHON tushganini saqlash.
--
-- Hozir bazada faqat "qachon ochiladi" bor (flood_wait_until, spam_until).
-- Operator uchun boshlanish vaqti ham kerak: "PEER_FLOOD 3 kun oldin
-- tushgan" — cheklov qancha davom etayotgani, kutish foydasi bormi
-- degan savolga javob beradi.
--
-- NEGA ALOHIDA IKKI USTUN: flood wait va peer flood bir vaqtda faol
-- bo'lishi mumkin (akkaunt ham tez yozgan, ham spam filtriga tushgan).
-- Bitta umumiy "restricted_since" ustuni birini ikkinchisi bilan
-- yo'q qilib yuborardi.
--
-- Ikkalasi ham NULL bo'lishi mumkin: cheklovsiz akkaunt va shu
-- migratsiyagacha yozilgan cheklovlar uchun boshlanish vaqti noma'lum.
ALTER TABLE telegram_accounts
  ADD COLUMN flood_wait_since TIMESTAMPTZ,
  ADD COLUMN peer_flood_since TIMESTAMPTZ;
