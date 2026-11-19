-- Kurs narx variantlari (masalan, seminarda qatorlar bo'yicha narx).
--
-- `price` — eng arzon variant (tizimda > 0 bo'lishi shart). Mijoz tanlagan variantning
-- narxi xaridning `total_amount` iga yoziladi, karta xabarida shu summa chiqadi.
-- Format: [{"label": "1-qator", "price": 1200000}, ...]
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS price_options jsonb NOT NULL DEFAULT '[]'::jsonb;
