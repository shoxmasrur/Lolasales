-- Chek rasmidan o'qilgan ma'lumot (vision): summa, to'lov vaqti, qabul qiluvchi karta oxirgi 4 raqami.
-- Hamyoncha tushumi bilan solishtirish uchun. Format:
--   {"amount": 200000, "paidAt": "2026-11-19 14:46", "card4": "2996"}  (har biri null bo'lishi mumkin)
ALTER TABLE payment_checks
    ADD COLUMN IF NOT EXISTS receipt_info jsonb;
