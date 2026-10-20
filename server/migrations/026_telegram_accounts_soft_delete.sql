-- Telegram akkauntini o'chirish endi "yumshoq" bo'ladi: yozuv bazada qoladi,
-- lekin hech qayerda ko'rinmaydi.
--
-- NEGA: akkaunt o'chirilganda uning orqasida tarix qoladi — qaysi mijozlarga
-- qaysi raqamdan yozilgani, audit yozuvlari, eski suhbatlar. Qattiq o'chirish
-- bu bog'lanishlarni uzib yuboradi va "bu xabar qaysi raqamdan ketgan edi?"
-- degan savolga javob topib bo'lmaydi.
--
-- `is_enabled` bilan aralashtirmaslik kerak:
--   is_enabled = FALSE  → vaqtincha to'xtatilgan, ro'yxatda TURADI
--   deleted_at NOT NULL → o'chirilgan, ro'yxatda YO'Q

ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Telefon raqami faqat TIRIK akkauntlar orasida takrorlanmasligi kerak.
-- Aks holda o'chirilgan raqamni qaytadan qo'shib bo'lmasdi.
ALTER TABLE telegram_accounts DROP CONSTRAINT IF EXISTS telegram_accounts_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_accounts_phone_alive
  ON telegram_accounts (phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_accounts_alive
  ON telegram_accounts (deleted_at)
  WHERE deleted_at IS NULL;
