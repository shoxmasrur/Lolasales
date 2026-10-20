-- Hozirgi uslub bo'limlarini v1 deb belgilash (2026-09-28).
--
-- Faqat ikkita bo'lim versiyalanadi — ular uslubga tegishli:
--   real_team_style — ohang, salomlashuv rituali, murojaat shakli
--   first_messages  — suhbatni boshlash tuzilmalari
--
-- human_tone, soft_skills, anti_repetition ATAYLAB tegilmaydi: ular til
-- sifatiga tegishli (majhul nisbat, ayblamaslik, takrorlanmaslik) va ikkala
-- uslubda ham bir xil kerak. Versiyalansa, bir xil matn ikki joyda yotib,
-- vaqt o'tib ajralib ketadi.

UPDATE agent_rule_sections
   SET style_version = 'v1'
 WHERE key IN ('real_team_style', 'first_messages')
   AND style_version IS NULL;
