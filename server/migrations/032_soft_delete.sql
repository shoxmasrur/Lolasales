-- "Yumshoq o'chirish" — bazadan hech qanday ma'lumot yo'qolmaydi.
--
-- NEGA: qarz undirish tarixi — yuridik hujjat. "Mijozni o'chirdik" degani
-- "u bilan ishlamaymiz" degani, "u bilan nima gaplashganimiz yo'qoldi"
-- degani EMAS. Qattiq o'chirish (DELETE) CASCADE bo'yicha shartnoma,
-- suhbat, xabar, to'lov va'dasini ham olib ketadi va keyin "bu odamga
-- qachon, kim, nima yozgan edi?" degan savolga javob qolmaydi.
--
-- Shuning uchun har bir jadvalda `deleted_at` bor:
--   deleted_at IS NULL     → tirik, hamma joyda ko'rinadi
--   deleted_at NOT NULL    → o'chirilgan, faqat "O'chirilgan" ro'yxatida
--
-- 026-migratsiyada telegram_accounts uchun aynan shu yondashuv qo'llangan
-- edi — endi u butun bazaga yoyilyapti.
--
-- Kim o'chirgani `audit_log` da qoladi (`client.deleted` / `client.restored`
-- va h.k.), mijozda qulaylik uchun `deleted_by` ham saqlanadi.

-- ─── deleted_at ustunlari ──────────────────────────────────────────────────

ALTER TABLE clients          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clients          ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE contracts        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE conversations    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payment_promises ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE client_profiles  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campaign_targets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE roles            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE agent_rules      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE agent_lessons    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN clients.deleted_at IS
  'Yumshoq o''chirish belgisi. NULL bo''lmasa — mijoz ro''yxatlarda ko''rinmaydi, '
  'lekin shartnoma, suhbat va xabarlari bazada turadi va tiklash mumkin.';

-- ─── Unique cheklovlar faqat TIRIK qatorlar orasida ────────────────────────
--
-- Aks holda o'chirilgan yozuv o'z o'rnini band qilib turadi: o'chirilgan
-- mijozni qaytadan import qilib bo'lmaydi, o'chirilgan xodimning pochtasi
-- bilan yangi hisob ochilmaydi, tozalangan suhbatni qayta boshlab
-- bo'lmaydi (conversations dagi (client_id, telegram_account_id) juftligi).

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_external_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_external_id_alive
  ON clients (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_contract_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_no_alive
  ON contracts (contract_no) WHERE deleted_at IS NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_client_id_telegram_account_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_client_account_alive
  ON conversations (client_id, telegram_account_id) WHERE deleted_at IS NULL;

ALTER TABLE campaign_targets DROP CONSTRAINT IF EXISTS campaign_targets_campaign_id_client_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_targets_campaign_client_alive
  ON campaign_targets (campaign_id, client_id) WHERE deleted_at IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_alive
  ON users (email) WHERE deleted_at IS NULL;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_key_alive
  ON roles (key) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_messages_tg_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tg_unique
  ON messages (conversation_id, telegram_msg_id)
  WHERE telegram_msg_id IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_promises_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS idx_promises_one_pending
  ON payment_promises (conversation_id, promised_date, amount)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- ─── Tirik qatorlar bo'yicha indekslar ─────────────────────────────────────
--
-- Endi deyarli har bir so'rovda `deleted_at IS NULL` bor, shuning uchun
-- eng ko'p ishlatiladigan yo'llarga qisman indeks qo'yamiz.

CREATE INDEX IF NOT EXISTS idx_clients_alive ON clients (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_client_alive ON contracts (client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_alive
  ON conversations (last_message_at DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conv_alive
  ON messages (conversation_id, created_at) WHERE deleted_at IS NULL;

-- ─── Ruxsat ────────────────────────────────────────────────────────────────
--
-- `clients.edit` dan ajratildi: tahrirlash — kundalik ish, o'chirish esa
-- mijozni butun ro'yxatdan olib tashlaydi. Bitta ruxsat o'chirish va
-- tiklashni birga boshqaradi — o'chirgan odam qaytara olishi kerak.

UPDATE roles
   SET permissions = array_append(permissions, 'clients.delete')
 WHERE key = 'admin'
   AND NOT ('clients.delete' = ANY (permissions));
