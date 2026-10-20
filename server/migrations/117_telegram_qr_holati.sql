-- QR orqali kirish (2026-10-02).
--
-- Akkaunt QR skanerlanishini kutayotgan paytda alohida holatda turadi —
-- "Kod kutilmoqda" bilan aralashmasligi uchun. 001 dagi CHECK ichki
-- (nomsiz) e'lon qilingan, PostgreSQL unga `telegram_accounts_status_check`
-- nomini bergan.

ALTER TABLE telegram_accounts DROP CONSTRAINT IF EXISTS telegram_accounts_status_check;

ALTER TABLE telegram_accounts ADD CONSTRAINT telegram_accounts_status_check
  CHECK (status IN (
    'logged_out', 'awaiting_code', 'awaiting_password', 'awaiting_qr',
    'connected', 'error', 'banned'
  ));
