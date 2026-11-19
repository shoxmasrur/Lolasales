-- Hamyoncha (@hamyoncha_finance_bot) orqali tushgan pulni avtomatik tekshirish.
--
-- 1) `hamyoncha_tushumlar`: Hamyonchadagi har bir kirim (tranzaksiya) FAQAT BIR
--    chekka biriktirilishi mumkin — shu tufayli bitta pul ikki mijozga hisoblanmaydi.
--    `tx_id` birlamchi kalit: ikkinchi urinish `ON CONFLICT DO NOTHING` bilan to'xtaydi.
CREATE TABLE IF NOT EXISTS hamyoncha_tushumlar (
    tx_id      text PRIMARY KEY,
    check_id   uuid REFERENCES payment_checks(id) ON DELETE SET NULL,
    amount     numeric(14,0) NOT NULL,
    tx_date    timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Chekning Hamyoncha bo'yicha natijasi: NULL — hali hal bo'lmagan (kutilmoqda),
--    'mos' — pul topildi va tasdiqlandi, 'shubha' — admin ko'rishi kerak.
ALTER TABLE payment_checks
    ADD COLUMN IF NOT EXISTS hamyon_holati text,
    ADD COLUMN IF NOT EXISTS hamyon_sabab text,
    ADD CONSTRAINT payment_checks_hamyon_holati_check
        CHECK (hamyon_holati IS NULL OR hamyon_holati IN ('mos', 'shubha'));
