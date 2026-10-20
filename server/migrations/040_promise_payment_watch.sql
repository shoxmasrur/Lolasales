-- Va'da qilingan to'lovni kuzatib borish va kelgani uchun rahmat aytish.
--
-- MUAMMO: mijoz "15-avgustda to'layman" degach, tizim o'sha kuni bitta
-- eslatma yuborardi va sana o'tishi bilanoq va'dani `broken` deb
-- belgilab, suhbatni operatorga tashlardi. To'lov kelgan-kelmagani
-- umuman tekshirilmasdi — tekshiradigan manba yo'q edi.
--
-- Natijada 15-avgust kechqurun to'lagan mijoz ham "va'dasini buzgan"
-- bo'lib chiqardi: bank o'tkazmasi ertasi kuni ko'rinishi odatiy hol.
-- Va to'lagan odam bizdan hech qanday e'tirof olmasdi.
--
-- YECHIM (1-rejadagi `contract_payment_events` jadvali tufayli mumkin
-- bo'ldi): va'dadan keyin kelgan to'lovlar kuzatiladi.
--   • to'liq kelsa   → rahmat, va'da `kept`
--   • qisman kelsa   → rahmat + qancha qolgani, va'da `partial`
--   • 7 kun kelmasa  → `broken`, operatorga
--
-- Sana o'tishi bilanoq `broken` qo'yish mantig'i olib tashlanadi
-- (PromiseWatcher.check) — u endi `watch_until` bo'yicha ishlaydi.

ALTER TABLE payment_promises
  -- Va'da berilganidan KEYIN kelgan jami to'lov.
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
  -- Qaysi summagacha rahmat aytilgan. Ikkinchi qisman to'lov kelganda
  -- faqat YANGI summa uchun rahmat aytilishini ta'minlaydi.
  ADD COLUMN IF NOT EXISTS thanked_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  -- Oxirgi tekshiruv — kuniga bir marta so'rash uchun.
  ADD COLUMN IF NOT EXISTS checked_at     TIMESTAMPTZ,
  -- Shu sanadan keyin va'da buzilgan deb belgilanadi.
  ADD COLUMN IF NOT EXISTS watch_until    DATE;

-- Mavjud va'dalarga kuzatuv oynasi beriladi.
UPDATE payment_promises
   SET watch_until = promised_date + INTERVAL '7 days'
 WHERE watch_until IS NULL;

-- ─── `partial` holati ─────────────────────────────────────────────────────
-- Mijoz va'dasining bir qismini to'lagan: rahmat aytilgan, lekin kuzatuv
-- davom etadi. `pending` dan farqi — biz allaqachon pul olganmiz.

ALTER TABLE payment_promises DROP CONSTRAINT IF EXISTS payment_promises_status_check;
ALTER TABLE payment_promises ADD CONSTRAINT payment_promises_status_check
  CHECK (status = ANY (ARRAY['pending','partial','kept','broken','cancelled']));

COMMENT ON COLUMN payment_promises.paid_amount IS
  'Va''da BERILGANIDAN KEYIN kelgan jami to''lov (contract_payment_events dan).';
COMMENT ON COLUMN payment_promises.thanked_amount IS
  'Qaysi summagacha rahmat aytilgan. paid_amount undan katta bo''lsa — yangi pul kelgan.';
COMMENT ON COLUMN payment_promises.watch_until IS
  'Kuzatuv tugash sanasi. Shundan keyin to''lov to''liq kelmasa — broken.';

-- Kuzatuvchining har tsiklidagi so'rovi: ochiq va'dalar.
CREATE INDEX IF NOT EXISTS idx_promises_watch
  ON payment_promises (checked_at NULLS FIRST)
  WHERE status IN ('pending','partial') AND deleted_at IS NULL;

-- Bitta ochiq va'da qoidasi `partial` ni ham qamrashi kerak, aks holda
-- qisman to'langan va'da yonida ayni shu shartnoma bo'yicha ikkinchisi
-- yaratilib qolishi mumkin edi.
DROP INDEX IF EXISTS idx_promises_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS idx_promises_one_pending
  ON payment_promises (conversation_id, promised_date, amount)
  WHERE status IN ('pending','partial') AND deleted_at IS NULL;

-- Eslatma indeksi ham `partial` ni hisobga oladi: qisman to'lagan mijozga
-- ham va'da kunida eslatma ketishi mumkin (qolgani haqida).
DROP INDEX IF EXISTS idx_promises_due_reminder;
CREATE INDEX IF NOT EXISTS idx_promises_due_reminder
  ON payment_promises (promised_date)
  WHERE status IN ('pending','partial') AND reminded_at IS NULL;
