-- Shartnomalar bazasi (app-api.xonsaroy.uz) bilan integratsiya.
--
-- MUAMMO: shartnoma ma'lumotlari faqat Excel eksportidan kelardi va fayl
-- yuklangan kundan keyingi to'lovlar ko'rinmasdi. Natijada kecha to'lagan
-- mijozga "to'lovingiz kechikkan" deb yozilishi mumkin edi. Telefon
-- raqamlari ham eksportda ko'pincha eskirgan bo'lardi.
--
-- YECHIM: to'lov grafigi va bankdan kelgan real to'lovlar API'dan olinib
-- shu yerda saqlanadi. Kechikkan summa grafikdan hisoblanadi
-- (domain/services/contractDebt.ts) — API'ning `total_debt` maydoni
-- umumiy qoldiq bo'lgani uchun ishlatilmaydi.

ALTER TABLE contracts
  -- Ularning order.id si. Bir marta contract_no bo'yicha topiladi va qoladi.
  ADD COLUMN IF NOT EXISTS external_order_id INTEGER,
  ADD COLUMN IF NOT EXISTS synced_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_external_order_id_key
  ON contracts (external_order_id)
  WHERE external_order_id IS NOT NULL;

-- Kechasi sinxronizatsiya eng eski yangilanganidan boshlanadi.
CREATE INDEX IF NOT EXISTS contracts_synced_at_idx ON contracts (synced_at NULLS FIRST);

-- ─── To'lov grafigi ────────────────────────────────────────────────────────
-- Shartnomaga ~49 qator. Grafik qayta tuzilishi mumkin, shuning uchun
-- sinxronizatsiyada API'da qolmagan qatorlar o'chiriladi.

CREATE TABLE IF NOT EXISTS contract_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  external_id  INTEGER NOT NULL,
  type         TEXT NOT NULL,              -- initial_payment | monthly | other
  amount       NUMERIC(20,2) NOT NULL DEFAULT 0,
  amount_paid  NUMERIC(20,2) NOT NULL DEFAULT 0,
  date_payment DATE NOT NULL,
  date_paid    DATE,
  status       TEXT NOT NULL,              -- paid | partially | waiting
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, external_id)
);

CREATE INDEX IF NOT EXISTS contract_payments_contract_idx
  ON contract_payments (contract_id, date_payment);

-- ─── Bankdan kelgan real to'lovlar ────────────────────────────────────────
-- Mijozning "men to'ladim" da'vosini tekshirish, va'da kuzatuvi va
-- tushum hisoboti shu jadvalga tayanadi. Yozuvlar o'chirilmaydi.

CREATE TABLE IF NOT EXISTS contract_payment_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  external_id    TEXT NOT NULL,
  amount         NUMERIC(20,2) NOT NULL DEFAULT 0,
  date_paid      DATE NOT NULL,
  payment_type   TEXT,
  purpose        TEXT,
  is_problematic BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, external_id)
);

CREATE INDEX IF NOT EXISTS contract_payment_events_contract_idx
  ON contract_payment_events (contract_id, date_paid DESC);
