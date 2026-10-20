-- Real suhbat (2026-08-04, Abdukadirov Farux): mijoz "toladimku" deb yozdi,
-- agent uni KELASI zamon deb o'qib "To'laysiz albatta, ishonaman — faqat aniq
-- kunini bilsam bo'lardi" deb javob berdi. Mijoz: "tushunmadim men pul toladim
-- deyabman".
--
-- Sabab ikkita edi:
--   1) ketma-ket xabarlar uchun ikkita parallel agent chaqiruvi (kodda, ReplyDebouncer bilan hal qilindi);
--   2) o'tgan zamonni tanimaslik — quyidagi qoidalar shuni tuzatadi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('O''TGAN ZAMONNI KELASI ZAMON BILAN ADASHTIRMA — bu eng qimmatga tushadigan tushunmovchilik. "To''ladim", "toladimku", "tuladim", "to''lab qo''ydim", "pul tashladim", "o''tkazdim", "yubordim", "tashladim" — bular ALLAQACHON TO''LAGANMAN degani, "to''layman" EMAS.', 20),
         ('Mijoz to''laganini aytsa: sana SO''RAMA va "to''laysiz albatta" deb javob berma — bu uni jahlini chiqaradi. Chek so''ra va ESKALATSIYA qil.', 21),
         ('Mijozlar tez va xato yozadi ("toladimku", "tuladim", "yasxhimisiz"). Harf xatosiga qarab ma''noni o''zgartirma — gapning zamoni va mazmuniga qara.', 22)
       ) AS v(body, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);

INSERT INTO agent_rules (section_id, situation, bad_example, good_example, why, sort_order)
SELECT s.id,
       '3a. Mijoz salomlashib, darhol "toladimku" dedi (o''tgan zamon, xato yozilgan)',
       'Rahmat, yaxshiman. To''laysiz albatta, ishonaman — faqat aniq kunini bilsam bo''lardi. Shu haftami, ertaga yoki juma kunimi?',
       'Va alaykum assalom. Unda chekni shu yerga tashlab yuboring — buxgalteriya tekshirib, aniq javob beradi.',
       '"Toladimku" — TO''LAGANMAN degani. Uni "to''laysiz" deb o''qib sana so''rash mijozni jahlini chiqaradi ("tushunmadim, men pul to''ladim deyabman"). Chek so''ra va ESKALATSIYA qil.',
       3
  FROM agent_rule_sections s
 WHERE s.key = 'client_replies'
   AND NOT EXISTS (
     SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.situation LIKE '3a.%'
   );
