-- 1) Mijoz bitta Telegram akkauntga DOIMIY biriktiriladi.
--    Sabab: mijoz uchun suhbat bitta odam bilan ketayotgandek ko'rinishi kerak.
--    Akkaunt almashsa, u boshqa raqamdan yozilganini ko'radi va ishonch yo'qoladi.
ALTER TABLE clients
  ADD COLUMN telegram_account_id UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL,
  ADD COLUMN account_assigned_at TIMESTAMPTZ;

CREATE INDEX idx_clients_account ON clients (telegram_account_id);

-- 2) Akkauntning @SpamBot bo'yicha holati.
ALTER TABLE telegram_accounts
  ADD COLUMN spam_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (spam_status IN ('unknown', 'clean', 'limited', 'banned', 'check_failed')),
  ADD COLUMN spam_checked_at TIMESTAMPTZ,
  ADD COLUMN spam_message TEXT,
  -- Cheklov qachongacha (SpamBot sanani aytsa).
  ADD COLUMN spam_until TIMESTAMPTZ;

-- Mavjud suhbatlar qaysi akkauntda ketgan bo'lsa, mijoz ham o'shanga biriktiriladi.
UPDATE clients c
   SET telegram_account_id = cv.telegram_account_id,
       account_assigned_at = now()
  FROM conversations cv
 WHERE cv.client_id = c.id
   AND cv.telegram_account_id IS NOT NULL
   AND c.telegram_account_id IS NULL;
