-- Claude modelini jadvaldan tanlash — YOLG'ON TANLOV (2026-09-29 ko'rik).
--
-- SABAB: `ClaudeAgentEngine` model nomini konstruktordan OLMAYDI, u doim
-- `.env` dagi `AGENT_MODEL`ni ishlatadi. `llm_models` jadvalida `claude`
-- qatorini akkauntga biriktirish imkoni bo'lsa, operator "modelni
-- tanladim" deb o'ylardi-yu, dvigatel baribir o'zgarmasdi — faqat narx
-- TANLANGAN qatorning tarifidan hisoblanib, hisobotni buzardi. Shu sabab
-- Claude endi jadvaldan umuman tanlanmaydi: u doim standart yo'l
-- (`AgentEngineFactory.standart()`), jadvalga esa FAQAT OpenAI modellari
-- qo'shiladi.
--
-- 112-migratsiyaga TEGILMAYDI — u jadvalni yaratgan, bu esa faqat
-- cheklovni toraytiradi.
--
-- XAVFSIZ QAYTA ISHGA TUSHIRISH: mavjut `claude` qatorlari (bo'lsa) avval
-- o'chiriladi — ular baribir yolg'on tanlov edi va yangi CHECK bilan mos
-- kelmaydi. Keyin eski cheklov `DROP CONSTRAINT IF EXISTS` bilan olib
-- tashlanadi va aynan shu nom bilan yangisi qo'shiladi — fayl ikkinchi
-- marta qo'lda ishga tushirilsa ham xato bermaydi (`schema_migrations`
-- baribir bir marta qo'llaydi, bu qo'shimcha kafolat).

DELETE FROM llm_models WHERE provider <> 'openai';

ALTER TABLE llm_models DROP CONSTRAINT IF EXISTS llm_models_provider_check;
ALTER TABLE llm_models ADD CONSTRAINT llm_models_provider_check CHECK (provider IN ('openai'));
