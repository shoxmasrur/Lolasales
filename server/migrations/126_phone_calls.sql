-- Ovozli agentning qo'ng'iroqlari (2026-10-14, qo'ng'iroq MCP 2-bosqich).
--
-- Platforma qo'ng'iroqdan keyin `qongiroq_natijasi` bilan yozadi. Keyingi
-- safar Telegram agenti yozishdan oldin telefonda nima gaplashilganini
-- ko'radi. Spec: docs/superpowers/specs/2026-10-14-qongiroq-mcp-design.md
--
-- external_id — platformadagi qo'ng'iroq id'si; bir foydalanuvchi (kalit
-- egasi) ichida yagona: platforma qayta urinsa yangi qator ochilmaydi.
CREATE TABLE IF NOT EXISTS phone_calls (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id        TEXT NOT NULL,
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id        UUID REFERENCES contracts(id) ON DELETE SET NULL,
  agent_key          TEXT NOT NULL,
  agent_name         TEXT NOT NULL,
  phone              TEXT,
  started_at         TIMESTAMPTZ NOT NULL,
  duration_sec       INTEGER NOT NULL CHECK (duration_sec >= 0),
  outcome            TEXT NOT NULL CHECK (outcome IN ('gaplashildi','kotarmadi','band','boshqa_odam','raqam_notogri')),
  summary            TEXT,
  transcript         TEXT,
  promise_date       DATE,
  promise_amount     NUMERIC(20,2),
  promise_id         UUID REFERENCES payment_promises(id) ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by_user_id, external_id)
);

CREATE INDEX IF NOT EXISTS phone_calls_client_idx ON phone_calls (client_id, started_at DESC);

-- Va'da qayerdan kelgani. Mavjud qatorlar — Telegram agentiniki.
ALTER TABLE payment_promises ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram'
  CHECK (source IN ('telegram', 'phone'));
ALTER TABLE payment_promises ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES phone_calls(id) ON DELETE SET NULL;
