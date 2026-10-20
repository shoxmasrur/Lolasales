-- Dashboardda ko'rsatiladigan tizim jurnali.
--
-- NEGA BAZAGA: `journalctl` ni faqat serverga SSH bilan kira oladigan
-- odam ko'radi va faqat keyin — muammo yuz berayotgan paytda emas.
-- Bazadagi nusxa xizmat qayta ishga tushgandan keyin ham qoladi.
--
-- Faqat `warn` va `error` yoziladi: `info` hajmi bir necha barobar
-- katta va muammoni topishni qiyinlashtiradi. To'liq tarix baribir
-- journald'da qoladi.
CREATE TABLE app_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  level      TEXT NOT NULL,
  scope      TEXT,
  msg        TEXT NOT NULL,
  -- Aynan shu uchtasi bo'yicha filtrlanadi, shuning uchun JSONB ichida
  -- emas, alohida ustunlarda.
  shartnoma  TEXT,
  akkaunt    TEXT,
  mijoz      TEXT,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Ro'yxat doim eng yangisidan boshlanadi.
CREATE INDEX idx_app_log_at ON app_log (at DESC);
CREATE INDEX idx_app_log_akkaunt ON app_log (akkaunt) WHERE akkaunt IS NOT NULL;
