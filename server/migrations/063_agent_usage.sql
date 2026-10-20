-- Agent chaqiruvlarining narxi.
--
-- MUAMMO: har bir model chaqiruvi pul turadi, lekin bu raqam faqat
-- jurnalga chiqib izsiz yo'qolardi (`ClaudeAgentEngine` dagi `costUsd`).
-- Shu sababli "bitta javob necha sentga tushadi", "oyiga qancha ketyapti"
-- degan savollarga javob yo'q edi — boshqa provayderga o'tish foydali
-- yoki foydasiz ekanini ham solishtirib bo'lmasdi.
--
-- Har bir chaqiruv uchun bitta qator. Yozuv chaqiruv TUGAGAN zahoti
-- qo'yiladi, javob qo'llanishidan oldin: operator "To'xtatish"ni bosib,
-- javob mijozga ketmay qolsa ham tokenlar allaqachon sarflangan — pul
-- ketgan. Aks holda hisob haqiqiy xarajatdan past chiqardi.
CREATE TABLE IF NOT EXISTS agent_usage (
  id                 BIGSERIAL PRIMARY KEY,
  -- Suhbat o'chirilsa ham narx tarixi qolishi kerak — shuning uchun
  -- CASCADE emas, SET NULL. Xarajat jamlanmasi mijozlar ro'yxati
  -- tozalanganda kamayib ketmasligi shart.
  conversation_id    UUID REFERENCES conversations(id) ON DELETE SET NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('first','reply','reminder','thanks')),
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  -- Keshdan o'qilgan token arzon, keshga yozilgani qimmat. Boshqa
  -- provayder bilan solishtirganda bu ikkisi alohida kerak bo'ladi:
  -- bizning prompt katta va deyarli o'zgarmaydi, ya'ni keshning ulushi
  -- solishtiruvning natijasini butunlay o'zgartirib yuborishi mumkin.
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12,6) NOT NULL DEFAULT 0,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hisobot doim davr bo'yicha o'qiladi.
CREATE INDEX IF NOT EXISTS idx_agent_usage_created ON agent_usage (created_at);
