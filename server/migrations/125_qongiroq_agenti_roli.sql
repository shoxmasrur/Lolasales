-- «Qo'ng'iroq agenti» roli (2026-10-14).
--
-- Bulutdagi ovozli agent `/api/mcp` ga shu rolga bog'langan API kalit
-- bilan ulanadi. Rolda FAQAT qo'ng'iroq ruxsatlari bor: u mijozlar
-- ro'yxatini ko'ra olmaydi, xabar yubora olmaydi va panelga kira olmaydi.
-- Spec: docs/superpowers/specs/2026-10-14-qongiroq-mcp-design.md
--
-- `ON CONFLICT (key)` ishlatilmaydi: 032-migratsiya `roles_key_key`
-- cheklovini olib tashlagan, uning o'rniga faqat tirik qatorlar uchun
-- qisman indeks (`WHERE deleted_at IS NULL`) qolgan. Postgres bunday
-- indeksni `ON CONFLICT (key)` bilan topa olmaydi va migratsiya xato
-- bilan to'xtardi. Shuning uchun tirik rol borligini oddiy tekshiramiz.
--
-- Qayta ishga tushirilsa takrorlanmaydi; operator rolni o'zgartirgan bo'lsa
-- ruxsatlari ustidan yozilmaydi.
INSERT INTO roles (key, name, description, is_system, permissions)
SELECT 'call_agent', 'Qo''ng''iroq agenti',
       'Ovozli qo''ng''iroq platformasi uchun: shartnoma bo''yicha qo''ng''iroqdan oldingi ma''lumot va natijani yozish. Mijozga xabar yubora olmaydi.',
       TRUE,
       ARRAY['calls.brief', 'calls.record']
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE key = 'call_agent' AND deleted_at IS NULL
);
