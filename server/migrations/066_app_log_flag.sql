-- Telegram chaqiruvlarining audit izi uchun bayroq.
--
-- 052-migratsiya "jurnalga faqat `warn` va `error`" degan edi va bu qoida
-- kuchida qoladi — BITTA istisno bilan: bayrog'i `telegram` bo'lgan
-- qatorlar `info` darajada ham saqlanadi. Ular operatorning odatdagi
-- ro'yxatiga tushmaydi, alohida filtrdan ko'riladi.
--
-- NEGA USTUN, `payload` ICHIDA EMAS: shu maydon bo'yicha HAR BIR ro'yxat
-- so'rovi filtrlanadi. JSONB ichidagi kalit bo'yicha filtrlash indeksga
-- tushmaydi va jadval o'sgani sayin sekinlashadi.
ALTER TABLE app_log ADD COLUMN flag TEXT;

-- "Telegram" ko'rinishi uchun.
CREATE INDEX idx_app_log_flag ON app_log (id DESC) WHERE flag IS NOT NULL;

-- Odatdagi "Hammasi" ko'rinishi uchun. Bu indekssiz jadvalning katta
-- qismi `info` bo'lib qolgach, eng ko'p ochiladigan ro'yxat butun
-- jadvalni skanerlashga tushardi.
CREATE INDEX idx_app_log_muhim ON app_log (id DESC) WHERE level <> 'info';
