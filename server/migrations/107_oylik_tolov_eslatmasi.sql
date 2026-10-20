-- Oylik to'lov eslatmasi (2026-09-22).
--
-- Avval yozilgan mijozga yangi oylik to'lov sanasi kelganda bir marta
-- eslatma ketadi (`OylikEslatmaWatcher`). Jadval HAR BIR to'lov qatori
-- uchun eslatma ketganini qayd etadi — (contract_id, date_payment)
-- yagona, ya'ni bir oy uchun ikkinchi eslatma bo'lmaydi.
--
-- `holat`:
--   sent    — agent chaqirildi (kunlik chegara shu bo'yicha sanaladi);
--   skipped — yuborilmadi (`sabab`: tolangan / yuborilmadi / agent_xato).

CREATE TABLE IF NOT EXISTS oylik_eslatmalar (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  date_payment  DATE NOT NULL,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  guruh         TEXT NOT NULL CHECK (guruh IN ('B', 'C')),
  holat         TEXT NOT NULL CHECK (holat IN ('sent', 'skipped')),
  sabab         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, date_payment)
);

CREATE INDEX IF NOT EXISTS idx_oylik_eslatmalar_created
  ON oylik_eslatmalar (created_at) WHERE holat = 'sent';

ALTER TABLE agent_usage DROP CONSTRAINT IF EXISTS agent_usage_mode_check;
ALTER TABLE agent_usage ADD CONSTRAINT agent_usage_mode_check
  CHECK (mode IN ('first', 'reply', 'reminder', 'thanks', 'nudge', 'operator', 'oylik_eslatma'));
