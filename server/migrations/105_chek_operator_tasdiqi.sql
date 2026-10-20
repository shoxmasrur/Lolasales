-- Chekni operator tasdiqlaydi — "To'lov qabul qilindi" tugmasi (2026-09-17).
--
-- MUAMMO: chek kelganda tizim CRM'da pulni o'zi qidirardi (`baseline_paid`
-- + 24 soat delta). Prodda bu ikki marta pulni yutdi: Komiljonov Doniyorbek
-- 5 mln ni chekdan OLDIN to'lagan edi — pul baseline'ga qo'shilib ketdi,
-- delta hech qachon > 0 bo'lmadi, sukut xabarlari esa "chekingizni hali
-- tekshiryapmiz" deb takrorlandi.
--
-- QAROR (foydalanuvchi): chekni ODAM tasdiqlaydi. `payment_checks` ikki
-- jarayonni saqlaydi va ular `kind` bilan ajratiladi:
--   • `crm_watch`      — "to'ladim" da'vosi: watching → confirmed / not_found / cancelled
--   • `receipt_review` — chek rasmi/fayl:   reviewing → confirmed_by_operator / cancelled
--
-- Mavjud yozuvlarning hammasi `crm_watch` (xatti-harakati shunday edi).
-- Deploy paytida ochiq qolgan eski chek kuzatuvlari o'z 24 soatini eski
-- yo'l bilan tugatadi — ma'lumot ko'chirilmaydi.
--
-- Qayta ishga tushirilsa natija o'zgarmaydi.

ALTER TABLE payment_checks
  ADD COLUMN IF NOT EXISTS kind            TEXT NOT NULL DEFAULT 'crm_watch',
  -- `tolov` — vision chek dedi; `aniqlanmagan` — noaniq, tasnif yiqildi,
  -- tasnifchi o'chiq, PDF yoki fayl yuklanmadi.
  ADD COLUMN IF NOT EXISTS receipt_source  TEXT,
  -- Agent mijozga "Chekni oldim…" deb javob bergan payt.
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  -- Tekshiruv ochiqligida boshqa yo'ldan (va'da, da'vo) rahmat ketgan payt:
  -- tugma shunda tekshiruvni rahmatsiz yopadi.
  ADD COLUMN IF NOT EXISTS thanks_sent_at  TIMESTAMPTZ,
  -- Tugmani bosgan operatorning emaili — audit bilan bir xil.
  ADD COLUMN IF NOT EXISTS confirmed_by    TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ;

-- Chekni operator muddatsiz ko'radi.
ALTER TABLE payment_checks ALTER COLUMN watch_until DROP NOT NULL;

ALTER TABLE payment_checks DROP CONSTRAINT IF EXISTS payment_checks_kind_check;
ALTER TABLE payment_checks ADD CONSTRAINT payment_checks_kind_check
  CHECK (kind IN ('crm_watch', 'receipt_review'));

-- 055 dagi ustun CHECK'i Postgres tomonidan shu nom bilan yaratilgan.
ALTER TABLE payment_checks DROP CONSTRAINT IF EXISTS payment_checks_status_check;
ALTER TABLE payment_checks ADD CONSTRAINT payment_checks_status_check
  CHECK (
    (kind = 'crm_watch' AND status IN ('watching', 'confirmed', 'not_found', 'cancelled'))
    OR (kind = 'receipt_review' AND status IN ('reviewing', 'confirmed_by_operator', 'cancelled'))
  );

ALTER TABLE payment_checks DROP CONSTRAINT IF EXISTS payment_checks_watch_until_check;
ALTER TABLE payment_checks ADD CONSTRAINT payment_checks_watch_until_check
  CHECK (kind = 'receipt_review' OR watch_until IS NOT NULL);

-- `IS NOT NULL` shart: `NULL IN (...)` NULL beradi, CHECK esa NULL ni
-- o'tkazib yuboradi — manbasiz chek tekshiruvi yozilib qolardi.
ALTER TABLE payment_checks DROP CONSTRAINT IF EXISTS payment_checks_receipt_source_check;
ALTER TABLE payment_checks ADD CONSTRAINT payment_checks_receipt_source_check
  CHECK (
    (kind = 'receipt_review' AND receipt_source IS NOT NULL AND receipt_source IN ('tolov', 'aniqlanmagan'))
    OR (kind = 'crm_watch' AND receipt_source IS NULL)
  );

-- Suhbatda bir vaqtda bitta OCHIQ tekshiruv — da'vo ham, chek ham.
DROP INDEX IF EXISTS payment_checks_one_open_idx;
CREATE UNIQUE INDEX IF NOT EXISTS payment_checks_one_open_idx
  ON payment_checks (conversation_id)
  WHERE status IN ('watching', 'reviewing');

-- Tasdiqdan keyingi 7 kunlik jimlik tekshiruvi (`findOperatorConfirmedSince`).
CREATE INDEX IF NOT EXISTS payment_checks_operator_confirmed_idx
  ON payment_checks (conversation_id, confirmed_at)
  WHERE status = 'confirmed_by_operator';

-- Media qoidalari `knowledgeBase.ts` dagi `MEDIA_RULES` bilan bir xil.
-- Qoidalar id bo'yicha emas, matn boshi bo'yicha topiladi: id har bazada boshqa.
UPDATE agent_rules
   SET body = 'CHEK kelganda: tizim uni hamkasbingga tekshirishga beradi. Bir marta qisqa yoz: chekni olding, hamkasbing tekshiradi, tasdiqlanishi bilan yozasan. O''ZING TASDIQLAMA, vaqt va''da qilma, to''lov so''rama.',
       updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'CHEK kelganda:%';

UPDATE agent_rules
   SET body = 'NIMALIGI ANIQLANMAGAN rasm yoki PDF kelsa: tizim uni hamkasbingga beradi. Rasm haqida taxmin qilma, uni chek deb ATAMA va "chekni oldim" DEMA.',
       updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'NIMALIGI ANIQLANMAGAN rasm kelsa:%';
