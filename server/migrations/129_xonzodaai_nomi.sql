-- O'zimizning STT nomi XonzodaAI (2026-10-15, foydalanuvchi qarori): 128 dagi
-- `transcript_gigaam*` ustunlari qayta nomlanadi. Ma'lumot saqlanadi.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'messages' AND column_name = 'transcript_gigaam') THEN
    ALTER TABLE messages RENAME COLUMN transcript_gigaam TO transcript_xonzoda;
    ALTER TABLE messages RENAME COLUMN transcript_gigaam_status TO transcript_xonzoda_status;
    ALTER TABLE messages RENAME COLUMN transcript_gigaam_error TO transcript_xonzoda_error;
    ALTER TABLE messages RENAME COLUMN transcript_gigaam_ms TO transcript_xonzoda_ms;
  END IF;
END $$;
