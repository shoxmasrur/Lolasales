-- Chek xaridga bog'lanadi, rad etish va tasdiqlangan summa (10-vazifa).
--
-- `crm_watch` (CRM'dan to'lov qidirish) sotuv agentida yo'q: to'lovni faqat
-- menejer chek bo'yicha tasdiqlaydi. Eski dev ma'lumotida bunday qatorlar
-- qolgan bo'lsa, ular o'chiriladi — keyin `kind` faqat `receipt_review`.

DELETE FROM payment_checks WHERE kind = 'crm_watch';

ALTER TABLE payment_checks
    DROP CONSTRAINT IF EXISTS payment_checks_kind_check,
    DROP CONSTRAINT IF EXISTS payment_checks_receipt_source_check,
    DROP CONSTRAINT IF EXISTS payment_checks_status_check,
    DROP CONSTRAINT IF EXISTS payment_checks_watch_until_check;

DROP INDEX IF EXISTS payment_checks_watching_idx;

ALTER TABLE payment_checks
    ALTER COLUMN kind SET DEFAULT 'receipt_review',
    ALTER COLUMN status SET DEFAULT 'reviewing',
    ADD COLUMN purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
    ADD COLUMN confirmed_amount numeric(14,0),
    ADD COLUMN rejected_reason text,
    ADD CONSTRAINT payment_checks_kind_check CHECK (kind = 'receipt_review'),
    ADD CONSTRAINT payment_checks_receipt_source_check
        CHECK (receipt_source IS NOT NULL AND receipt_source IN ('tolov', 'aniqlanmagan')),
    ADD CONSTRAINT payment_checks_status_check
        CHECK (status IN ('reviewing', 'confirmed_by_operator', 'rejected', 'cancelled')),
    ADD CONSTRAINT payment_checks_confirmed_amount_check
        CHECK (confirmed_amount IS NULL OR confirmed_amount > 0);

CREATE INDEX idx_payment_checks_purchase ON payment_checks (purchase_id);

UPDATE roles SET permissions = array_append(permissions, 'receipts.confirm')
 WHERE key IN ('admin', 'operator') AND NOT ('receipts.confirm' = ANY(permissions));
