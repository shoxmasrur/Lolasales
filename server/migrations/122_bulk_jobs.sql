-- Ommaviy vazifalar holati (2026-10-09).
--
-- Suhbat boshlash, qayta aloqa, Telegram qidiruvi va CRM sinxronlash
-- faqat xotirada yashardi: har deploy (systemctl restart) ishlab turgan
-- vazifani yo'qotardi va operator qolganini qo'lda qayta boshlardi.
--
-- Endi holat shu yerda. Qator `running` bo'lib qolsa, server ko'tarilgach
-- vazifa `processed_ids` da yo'q mijozlardan davom ettiriladi.
--
-- clean_stop     — oxirgi to'xtash tartibli (deploy) bo'lganmi. FALSE
--                  bo'lib qolgan `running` qator — jarayon o'lgan degani.
-- crash_resumes  — oldinga siljimagan avariyaviy tiklanishlar; 3 da
--                  vazifa yopiladi (nosoz vazifa serverni aylantirmasin).
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id            UUID PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('start', 'recontact', 'lookup', 'contract_sync')),
  status        TEXT NOT NULL CHECK (status IN ('running', 'done', 'stopped', 'failed')),
  input         JSONB NOT NULL,
  plan          JSONB,
  snapshot      JSONB NOT NULL,
  processed_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  clean_stop    BOOLEAN NOT NULL DEFAULT FALSE,
  crash_resumes INTEGER NOT NULL DEFAULT 0,
  resumed_count INTEGER NOT NULL DEFAULT 0,
  started_day   DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Har turda bir vaqtda bitta vazifa — `isRunning()` qoidasining bazadagi ko'zgusi.
CREATE UNIQUE INDEX IF NOT EXISTS bulk_jobs_one_running
  ON bulk_jobs (kind) WHERE status = 'running';
