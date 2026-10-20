-- Bayram va dam olish kunlari.
--
-- NEGA KERAK: bayramda banklar ishlamaydi va mijoz to'lay olmaydi.
-- Tizim buni bilmasa, o'sha kunlari xabar yuboradi va va'dani "buzildi"
-- deb belgilaydi — mijoz aybdor bo'lmagan holda bosim ko'radi.
--
-- `yillik` — har yili qaytadigan bayram (1-yanvar, 21-mart, 9-may…).
-- Bunda YIL e'tiborga olinmaydi, faqat oy-kun solishtiriladi, ya'ni
-- yozuv bir marta kiritiladi. Hayitlar va hukumat ko'chirgan ish
-- kunlari esa har yili o'zgaradi — ular `yillik = FALSE` bo'lib, aniq
-- sana bilan kiritiladi.

CREATE TABLE IF NOT EXISTS holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  yillik      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  CONSTRAINT holidays_oraliq CHECK (ends_on >= starts_on)
);

-- Ro'yxat har tekshiruvda to'liq o'qiladi va u kichik (yiliga o'nlab
-- yozuv), shuning uchun indeks kerak emas. Saralash uchun esa:
CREATE INDEX IF NOT EXISTS idx_holidays_starts ON holidays (starts_on);
