-- Agent shartnoma haqida aniq gapira olishi uchun uy ma'lumoti va
-- to'lanmagan oylarning ANIQ soni.
--
-- MUAMMO 1: shartnomalar bazasi uy ma'lumotini beradi (blok, raqam,
-- qavat, xonalar soni, maydon), lekin uni saqlaydigan joy yo'q edi —
-- ma'lumot mapper'dan chiqib yo'qolardi. Agent "shartnomangiz bo'yicha"
-- deyishdan nariga o'ta olmasdi, mijoz esa o'z uyini raqami bilan taniydi.
--
-- MUAMMO 2: qoldirilgan oylar soni `debt_monthly / monthly_payment`
-- bo'linmasi orqali TAXMIN qilinardi. Real shartnomada: 17 356 000 /
-- 8 339 000 = 2, aslida esa 3 oy to'lanmagan — mayda qismi to'langan oy
-- bo'linmada yo'qoladi. Agent mijozga xato son aytadi, mijoz uni darhol
-- tuzatadi va butun hisob-kitobga ishonchi qoladi.
--
-- YECHIM: ikkalasi ham sinxronizatsiyada to'ldiriladi. Oy soni
-- `contractDebt.computeDebt` dan keladi — u grafikni qator-baqator
-- sanaydi, bo'lmaydi.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS apartment_number   TEXT,
  ADD COLUMN IF NOT EXISTS apartment_floor    INTEGER,
  ADD COLUMN IF NOT EXISTS apartment_rooms    INTEGER,
  ADD COLUMN IF NOT EXISTS apartment_entrance TEXT,
  ADD COLUMN IF NOT EXISTS apartment_block    TEXT,
  ADD COLUMN IF NOT EXISTS apartment_area     NUMERIC(10,2),
  -- To'lanmagan OYLIK to'lovlar soni. Boshlang'ich to'lov qarzi bunga
  -- kirmaydi — u oy emas.
  ADD COLUMN IF NOT EXISTS missed_months      INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN contracts.missed_months IS
  'To''lanmagan oylik to''lovlar soni — grafikdan qator-baqator sanalgan. '
  'debt_monthly / monthly_payment bo''linmasi EMAS: qisman to''langan oy '
  'bo''linmada yo''qolib ketadi.';
