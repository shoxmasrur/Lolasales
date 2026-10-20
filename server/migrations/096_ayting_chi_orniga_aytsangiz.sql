-- Kun so'raganda "ayting-chi" emas, "aytsangiz" (2026-09-15).
--
-- Agent yozdi: "Shu summani qachon to'lay olasiz — yaqin kunlardan birini
-- ayting-chi?". Ko'rsatma: "yaqin kunlardan birini aytsangiz" deb yozish.
--
-- Manba — human_tone bo'limining o'zi: rasmiy so'zlar ro'yxatida
-- "iltimos, ayting" → "ayting-chi" deb o'rgatilgan edi. Prodda agent
-- "ayting-chi" ni 40 marta yozgan (oxirgisi 2026-09-14), eng ko'p
-- "Qachon to'lay olasiz, ayting-chi".
--
-- Kun so'raydigan uchta misol ("Bitta kun ayting") ham tuzatildi.
-- ATAYLAB TEGILMAGAN: sabab so'raydigan "Ayting-chi, nima bo'ldi" jumlalari
-- — ular kun so'ramaydi, "aytsangiz, nima bo'ldi" esa g'alati eshitiladi.
--
-- Har UPDATE eski matn bo'yicha himoyalangan: operator tahrirlagan qator
-- tegilmaydi, qayta ishga tushirilsa hech nima o'zgarmaydi.

-- ─── 1. human_tone: almashtirish ro'yxati ────────────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body,
                '"iltimos, ayting" → "ayting-chi"',
                '"iltimos, ayting" → "aytsangiz"' || E'\n' ||
                'Kun yoki sanani so''raganda "ayting" / "ayting-chi" DEMA — buyruq bo''lib eshitiladi: "yaqin kunlardan birini aytsangiz", "to''lovni amalga oshiradigan kunni aytsangiz".'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'human_tone'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'RASMIY SO''ZLARNI JONLISIGA ALMASHTIR:%"iltimos, ayting" → "ayting-chi"%';

-- ─── 2. Kun so'raydigan misollar ─────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = replace(r.good_example, 'bitta kun ayting —', 'bitta kun aytsangiz —'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'client_replies'
   AND r.deleted_at IS NULL
   AND r.good_example LIKE 'Tushundim, qayta bezovta qilmayman. Faqat bitta kun ayting —%';

UPDATE agent_rules r
   SET good_example = replace(r.good_example, 'Bitta kun ayting —', 'Bitta kun aytsangiz —'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key IN ('hostile_replies', 'tone_examples')
   AND r.deleted_at IS NULL
   AND (r.good_example LIKE 'Tushundim, ortiqcha yozmayman. Bitta kun ayting —%'
     OR r.good_example LIKE 'Ko''p yozganimiz jonga tekkan, uzr. Bitta kun ayting —%');
