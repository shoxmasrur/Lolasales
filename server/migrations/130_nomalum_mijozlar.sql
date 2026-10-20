-- Noma'lum mijozlar (2026-10-15): Telegramda o'zi yozgan, bazada yo'q
-- odamlar. Spec: docs/superpowers/specs/2026-10-15-nomalum-mijozlar-design.md
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nomalum BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS clients_nomalum_idx ON clients (nomalum) WHERE nomalum;

CREATE TABLE IF NOT EXISTS nomalum_suhbatlar (
  conversation_id    UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  holat              TEXT NOT NULL DEFAULT 'kutilmoqda'
                     CHECK (holat IN ('kutilmoqda','tasdiq_kutilmoqda','operatorda','mijoz_emas','boglandi')),
  agent_javoblari    INTEGER NOT NULL DEFAULT 0,
  urinishlar         INTEGER NOT NULL DEFAULT 0,
  -- Shartnoma raqami necha marta topilmagani. `urinishlar` dan ALOHIDA:
  -- u agentning "raqam so'rash" hisoblagichi; bitta ustun bo'lsa salom
  -- bergan odam birinchi noto'g'ri raqamdayoq operatorga tushardi.
  topilmagan         INTEGER NOT NULL DEFAULT 0,
  shartnoma_raqami   TEXT,
  topilgan_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Telegram ko'rsatgan telefon (yashirin bo'lsa NULL). `clients.phone` ga
  -- YOZILMAYDI: aks holda keyin import qilingan haqiqiy mijoz `findByPhone`
  -- bilan noma'lum yozuvga tushib qolardi.
  telegram_telefon   TEXT,
  sabab              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
