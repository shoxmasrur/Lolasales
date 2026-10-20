-- Agent ishlatadigan til modellari (2026-09-29).
--
-- Model qator bo'lib yashaydi: provayder, aniq nomi va narxlari. Narx
-- panelda kiritiladi — tariflar tez o'zgaradi va kodga yozilgan raqam
-- jimgina eskiradi.
--
-- `telegram_accounts.llm_model_id IS NULL` — akkaunt HOZIRGI yo'l bilan
-- ishlaydi (ClaudeAgentEngine va .env dagi AGENT_MODEL). Bu migratsiya
-- qo'llanganda barcha akkauntlar shu holatda qoladi, ya'ni xatti-harakat
-- o'zgarmaydi.
--
-- `ON DELETE SET NULL` — model o'chirilsa akkaunt javobsiz qolmaydi,
-- standart yo'lga qaytadi.

CREATE TABLE IF NOT EXISTS llm_models (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              TEXT NOT NULL CHECK (provider IN ('claude','openai')),
  model                 TEXT NOT NULL,
  label                 TEXT NOT NULL,
  input_price_per_mtok  NUMERIC(12,4),
  output_price_per_mtok NUMERIC(12,4),
  is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

ALTER TABLE telegram_accounts
  ADD COLUMN IF NOT EXISTS llm_model_id UUID REFERENCES llm_models(id) ON DELETE SET NULL;

COMMENT ON TABLE llm_models IS
  'Agent ishlatadigan til modellari. Narx 1 mln token uchun, NULL — kiritilmagan.';
COMMENT ON COLUMN telegram_accounts.llm_model_id IS
  'Akkaunt qaysi model bilan yozadi. NULL — standart (Claude, .env dagi AGENT_MODEL).';
