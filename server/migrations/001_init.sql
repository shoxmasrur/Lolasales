-- Debitor Agent — boshlang'ich sxema
-- Barcha pul maydonlari so'mda, NUMERIC(20,2)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Dashboard foydalanuvchilari ───────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator'
                CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Telegram akkauntlar (MTProto userbot) ────────────────────────────────
CREATE TABLE telegram_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT NOT NULL,
  phone           TEXT NOT NULL UNIQUE,
  api_id          INTEGER NOT NULL,
  api_hash_enc    TEXT NOT NULL,
  session_enc     TEXT,
  status          TEXT NOT NULL DEFAULT 'logged_out'
                  CHECK (status IN ('logged_out','awaiting_code','awaiting_password','connected','error','banned')),
  status_message  TEXT,
  tg_user_id      TEXT,
  tg_username     TEXT,
  daily_limit     INTEGER NOT NULL DEFAULT 40,
  sent_today      INTEGER NOT NULL DEFAULT 0,
  counter_date    DATE,
  flood_wait_until TIMESTAMPTZ,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Mijozlar ──────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id       TEXT UNIQUE,                 -- eksportdagi ID
  full_name         TEXT NOT NULL,
  phone             TEXT,                        -- E.164, masalan +998901234567
  extra_phones      TEXT[] NOT NULL DEFAULT '{}',
  telegram_user_id  TEXT,
  telegram_username TEXT,
  telegram_access_hash TEXT,
  telegram_status   TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (telegram_status IN ('unknown','searching','found','not_found','privacy_restricted','blocked')),
  telegram_checked_at TIMESTAMPTZ,
  do_not_contact    BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_phone ON clients (phone);
CREATE INDEX idx_clients_tg_user ON clients (telegram_user_id);
CREATE INDEX idx_clients_name ON clients USING gin (to_tsvector('simple', full_name));

-- ─── Shartnomalar ──────────────────────────────────────────────────────────
CREATE TABLE contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_no       TEXT NOT NULL UNIQUE,
  external_id       TEXT,
  object_name       TEXT,
  status            TEXT,                        -- eksportdagi СТАТУС
  virtual_status    TEXT,
  category          TEXT,                        -- A (-9), B (-18) ...
  total_price       NUMERIC(20,2),
  first_payment     NUMERIC(20,2),
  monthly_payment   NUMERIC(20,2),
  paid_total        NUMERIC(20,2),
  remaining_total   NUMERIC(20,2),
  contract_date     DATE,
  months            INTEGER,
  next_payment_date DATE,
  days_overdue      INTEGER NOT NULL DEFAULT 0,
  debt_first        NUMERIC(20,2) NOT NULL DEFAULT 0,
  debt_monthly      NUMERIC(20,2) NOT NULL DEFAULT 0,
  debt_total        NUMERIC(20,2) NOT NULL DEFAULT 0,
  warning_count     INTEGER NOT NULL DEFAULT 0,
  last_warning_type TEXT,
  last_warning_method TEXT,
  last_warning_manager TEXT,
  last_warning_at   TIMESTAMPTZ,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_client ON contracts (client_id);
CREATE INDEX idx_contracts_overdue ON contracts (days_overdue DESC);
CREATE INDEX idx_contracts_debt ON contracts (debt_total DESC);
CREATE INDEX idx_contracts_object ON contracts (object_name);

-- ─── Import partiyalari ────────────────────────────────────────────────────
CREATE TABLE import_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'debtors' CHECK (kind IN ('debtors','phones')),
  rows_total    INTEGER NOT NULL DEFAULT 0,
  rows_ok       INTEGER NOT NULL DEFAULT 0,
  rows_failed   INTEGER NOT NULL DEFAULT 0,
  clients_created  INTEGER NOT NULL DEFAULT 0,
  contracts_created INTEGER NOT NULL DEFAULT 0,
  contracts_updated INTEGER NOT NULL DEFAULT 0,
  errors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Suhbatlar ─────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  telegram_account_id UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL,
  peer_id             TEXT,
  peer_access_hash    TEXT,
  state               TEXT NOT NULL DEFAULT 'new'
                      CHECK (state IN ('new','contacted','negotiating','promised','agreed','refused','unreachable','escalated','closed')),
  stage               TEXT NOT NULL DEFAULT 'soft'
                      CHECK (stage IN ('soft','hard','legal')),
  agent_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  needs_human         BOOLEAN NOT NULL DEFAULT FALSE,
  human_reason        TEXT,
  agent_session_id    TEXT,
  last_message_at     TIMESTAMPTZ,
  last_inbound_at     TIMESTAMPTZ,
  last_outbound_at    TIMESTAMPTZ,
  unread_count        INTEGER NOT NULL DEFAULT 0,
  summary             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, telegram_account_id)
);

CREATE INDEX idx_conversations_last_msg ON conversations (last_message_at DESC NULLS LAST);
CREATE INDEX idx_conversations_state ON conversations (state);
CREATE INDEX idx_conversations_needs_human ON conversations (needs_human) WHERE needs_human = TRUE;

-- ─── Xabarlar ──────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('in','out')),
  author           TEXT NOT NULL CHECK (author IN ('agent','human','client','system')),
  author_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  body             TEXT NOT NULL,
  telegram_msg_id  BIGINT,
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('draft','queued','sending','sent','delivered','read','failed')),
  error            TEXT,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);

CREATE INDEX idx_messages_conv ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_status ON messages (status) WHERE status IN ('queued','sending','failed');
CREATE UNIQUE INDEX idx_messages_tg_unique ON messages (conversation_id, telegram_msg_id)
  WHERE telegram_msg_id IS NOT NULL;

-- ─── To'lov va'dalari (agent qayd qiladi) ─────────────────────────────────
CREATE TABLE payment_promises (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id      UUID REFERENCES contracts(id) ON DELETE SET NULL,
  amount           NUMERIC(20,2) NOT NULL,
  promised_date    DATE NOT NULL,
  quote            TEXT,                       -- mijozning aynan qaysi gapi asos bo'lgani
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','kept','broken','cancelled')),
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX idx_promises_date ON payment_promises (promised_date);
CREATE INDEX idx_promises_status ON payment_promises (status);

-- ─── Kampaniyalar ──────────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  filters       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','running','paused','completed','cancelled')),
  daily_limit   INTEGER NOT NULL DEFAULT 40,
  window_start  TIME NOT NULL DEFAULT '09:00',
  window_end    TIME NOT NULL DEFAULT '19:00',
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE TABLE campaign_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id   UUID REFERENCES contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  state         TEXT NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending','resolving','ready','sending','sent','skipped','failed')),
  skip_reason   TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, client_id)
);

CREATE INDEX idx_targets_state ON campaign_targets (campaign_id, state);

-- ─── Sozlamalar (key/value) ────────────────────────────────────────────────
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Audit jurnali ─────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,          -- 'agent' | 'system' | user email
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id);

-- ─── updated_at avtomatik yangilanishi ────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_touch       BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_clients_touch     BEFORE UPDATE ON clients           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_contracts_touch   BEFORE UPDATE ON contracts         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_conv_touch        BEFORE UPDATE ON conversations     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_campaigns_touch   BEFORE UPDATE ON campaigns         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_tg_touch          BEFORE UPDATE ON telegram_accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
