-- Yuborilgan xabarni tahrirlash va o'chirish uchun uchta ustun.
--
-- NEGA `deleted_at` EMAS: u allaqachon band va ma'nosi boshqa — YOZUV
-- o'chirilgan. Uni mijoz o'chirilganda (`PgClientRepository`), suhbat
-- reset qilinganda (`PgConversationRepository`) va `clearClients` CLI
-- qo'yadi, tiklanganda esa NULL ga qaytaradi. Agent tarixi
-- `deleted_at IS NULL` bo'yicha filtrlanadi; operator o'chirishini o'sha
-- ustunga yozsak, filtrni olib tashlash kerak bo'lardi va o'chirilgan
-- mijozlarning xabarlari promptga qaytib kirardi.
--
-- Alohida `revoked_at` bilan bironta so'rov o'zgarmaydi: operator
-- o'chirgan xabarda `deleted_at` NULL bo'lib qolaveradi va xabar agent
-- tarixida o'z-o'zidan qoladi — dizaynda kerak bo'lgani ham shu.
--
-- `original_body` faqat BIRINCHI tahrirda to'ldiriladi va keyin
-- o'zgarmaydi: u mijoz dastlab ko'rgan matn. Oraliq tahrirlar `audit`
-- jadvaliga tushadi.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at     TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_body TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS revoked_at    TIMESTAMPTZ;
