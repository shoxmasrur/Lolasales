-- Task 12: reklama (kiruvchi) va raqam importi.
--
-- 1) Import turi: faqat 'leads' (mijozlar ro'yxati). Eski qarz turlari (14-vazifa)
--    001 dan ham olib tashlangan — deploy qilingan baza yo'q.
-- 2) Bir Telegram foydalanuvchisi — bitta tirik mijoz. Ikki xabar bir vaqtda kelganda
--    ikkinchi INSERT unique xatosi bilan yiqiladi va mavjud mijoz qayta o'qiladi.

ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_kind_check;
ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_kind_check CHECK (kind = 'leads');

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_telegram_user_alive
  ON clients (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL AND deleted_at IS NULL;
