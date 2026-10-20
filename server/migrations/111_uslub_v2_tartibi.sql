-- v2 bo'limlari tartibini v1 bilan to'qnashuvdan chiqarish (2026-09-28
-- yakuniy ko'rikdan keyin).
--
-- 110-migratsiya `real_team_style_v2`ga sort_order=0, `first_messages_v2`ga
-- sort_order=19 bergan edi — bular v1'dagi `real_team_style` (0) va
-- `first_messages` (19) bilan AYNAN bir xil (`seedDefaultRules.ts`dagi
-- SECTIONS ro'yxatidagi tartib raqamlari). `listSections()` faqat
-- `ORDER BY sort_order ASC` ishlatadi va boshqa tiebreaker yo'q, shuning
-- uchun bir xil sort_order'ga ega ikkita qator tartibi Postgres uchun
-- ANIQLANMAGAN — panel har safar boshqacha tartibda ko'rsatishi mumkin.
--
-- 110-migratsiya O'ZGARTIRILMAYDI: u allaqachon lokal bazada qo'llangan
-- (schema_migrations'da bor), qayta tahrirlash uni qayta ishlatmaydi.
-- Buning o'rniga shu yangi migratsiya v2 bo'limlariga boshqa sonli
-- (mavjud hech qanday bo'lim bilan to'qnashmaydigan) sort_order beradi.
-- Hozirgi eng katta sort_order ~29 (21 ta uslub/qoidalar bo'limi +
-- 8 ta misol bo'limi, `seedDefaultRules.ts`), shuning uchun 100/119
-- katta zaxira bilan xavfsiz.
--
-- UPDATE ... WHERE key = shart bilan yozilgan: migratsiya qayta ishga
-- tushirilsa ham (masalan qo'lda sinov uchun) natija bir xil bo'ladi.
UPDATE agent_rule_sections
   SET sort_order = 100
 WHERE key = 'real_team_style_v2';

UPDATE agent_rule_sections
   SET sort_order = 119
 WHERE key = 'first_messages_v2';
