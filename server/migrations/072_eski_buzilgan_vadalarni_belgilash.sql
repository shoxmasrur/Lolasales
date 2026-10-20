-- Eski buzilgan va'dali suhbatlarga `human_kind` orqaga to'ldiriladi.
--
-- MUAMMO: `human_kind = 'broken_promise'` ushbu deploy'dan boshlab, FAQAT
-- `PromiseWatcher.breakPromise` YANGI va'dani buzgan deb belgilaganda
-- yoziladi (server/src/application/services/PromiseWatcher.ts:456-458).
-- Shu deploy'dan OLDIN buzilgan va'dali suhbatlar `human_kind = NULL`
-- bilan qolgan — ular `canAgentNudge` uchun ko'rinmas (R1 ga qarang:
-- server/src/domain/entities/Conversation.ts), ya'ni sukut kuzatuvchisi
-- ularga HECH QACHON qayta murojaat qilmaydi. Faqat operator ro'yxatida
-- kutib qoladi, garchi "buzilgan va'da" ssenariysi aynan shular uchun
-- yaratilgan bo'lsa ham.
--
-- BELGILASH MEZONI — `human_reason` matnidan: faqat `PromiseWatcher`
-- yozadigan ANIQ PREFIKS (`Va'da bajarilmadi: `) qidiriladi, umumiy
-- `needs_human = true` EMAS — operator qo'lda yozgan yoki boshqa
-- sababdan (masalan tasdiqlanmagan kvitansiya) `needs_human` bo'lgan
-- suhbatlarga tegilmasligi kerak.
--
-- IDEMPOTENT: `human_kind IS NULL` sharti borligi uchun bu UPDATE necha
-- marta ishga tushirilsa ham, allaqachon belgilangan qatorlarga (yoki
-- shartga mos kelmaydiganlarga) qayta tegmaydi — ikkinchi yurgizishda
-- 0 qator o'zgaradi.
UPDATE conversations
   SET human_kind = 'broken_promise'
 WHERE needs_human = true
   AND human_kind IS NULL
   AND human_reason LIKE 'Va''da bajarilmadi:%';
