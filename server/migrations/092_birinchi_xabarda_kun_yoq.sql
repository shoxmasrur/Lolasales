-- Birinchi xabarda kechikish kuni aytilmaydi (rahbariyat, 2026-09-14).
--
-- Agent birinchi xabarni "... oylik to'lovingiz 8 141 000 so'm. 29 kun
-- kechikib ketibdi" deb yozdi. Ko'rsatma: "bir necha kun kechikdi" degan
-- jumla birinchi xabarda kerak emas — faqat summa.
--
-- Asosiy manba — `userPrompt.ts` dagi birinchi xabar vazifasi ("necha kun
-- kechikkanini ko'rsat" deb talab qilardi), u koddan keladi. Bu migratsiya
-- esa bazadagi namunalarni moslaydi: `first_messages` va `tone_examples`
-- koddan urug'lantirilgan, prodda bo'limlar to'la, ya'ni kod o'zgarishi
-- ularga yetib bormaydi.
--
-- Umumiy qoidaga matn ALMASHTIRILMAYDI, oxiriga QO'SHILADI — operator
-- tahriri saqlanib qoladi. Namunalar esa aniq eski matn bo'yicha
-- almashtiriladi: tahrirlangan bo'lsa LIKE mos kelmaydi va UPDATE jimgina
-- o'tib ketadi. Qo'llagandan keyin tekshiring:
--   SELECT body FROM agent_rules r JOIN agent_rule_sections s ON s.id = r.section_id
--    WHERE s.key = 'first_messages' AND r.deleted_at IS NULL AND r.body ~ '\d+ kun';
--
-- Qayta ishga tushirilsa natija o'zgarmaydi.

-- ─── 1. Umumiy qoida ─────────────────────────────────────────────────────
UPDATE agent_rules r
   SET body = r.body || ' Birinchi xabarda KECHIKISH KUNINI AYTMA ("29 kun kechikib ketibdi" kabi jumla kerak emas) — faqat summa.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'first_messages'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'BIRINCHI XABARNI HAR MIJOZGA BIR XIL YOZMA.%'
   AND r.body NOT LIKE '%KECHIKISH KUNINI AYTMA%';

-- ─── 2. Kun sonini aytgan uchta namuna ───────────────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body, 'to''lovingiz 51 kun kechikkan.', 'to''lovingiz kechikib ketibdi.'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'first_messages'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'TANLOVLI SAVOL%to''lovingiz 51 kun kechikkan.%';

UPDATE agent_rules r
   SET body = replace(r.body, 'to''lov kuningiz bo''lgan, o''shandan beri 51 kun o''tibdi.', 'to''lov kuningiz bo''lgan edi.'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'first_messages'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'JADVAL KUNIDAN BOSHLASH%o''shandan beri 51 kun o''tibdi.%';

UPDATE agent_rules r
   SET body = replace(r.body, 'to''lov kechikkan, 51 kun.', 'to''lov kechikkan.'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'first_messages'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'QURUQ, ISHCHAN%to''lov kechikkan, 51 kun.%';

-- ─── 3. Ohang misoli ─────────────────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Assalomu alaykum, Zokirjon Maxmutovich. Men {ism}, Xon Saroy Group''dan yozyapman. 378ZUR23F3 shartnomangiz bo''yicha 1 135 253 so''m to''lov kechikib ketibdi. Qachon to''lay olasiz?',
       why = '"Murojaat qilyapman", "summa kechiktirilgan" — idora tili. Jonli variant odam yozgandek eshitiladi. Summa ikkalasida ham aniq raqamda — jonli til raqamni yaxlitlash degani emas. Kechikish kuni esa birinchi xabarda umuman aytilmaydi.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'tone_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Birinchi xabar — tanishuv va to''lovni aytish%'
   AND r.good_example LIKE '%51 kun bo''libdi%';
