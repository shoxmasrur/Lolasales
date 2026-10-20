-- Ovozli xabarning GigaAM (o'zimizning STT) matni — FAQAT solishtirish uchun
-- (2026-10-15). Asosiy matn hamon `transcript` (Aisha) va agentga shu boradi;
-- bular chatda uning ostida ko'rinadi, GigaAM sifatini kuzatish uchun.
--
-- transcript_gigaam_ms — so'rov yuborilgandan javobgacha (navbat va yuklash
-- bilan), kuzatuv uchun.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_gigaam TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_gigaam_status TEXT
  CHECK (transcript_gigaam_status IN ('done', 'failed'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_gigaam_error TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_gigaam_ms INTEGER;
