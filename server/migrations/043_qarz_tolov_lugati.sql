-- Mijozga "qarz" demaymiz.
--
-- SABAB: Xonsaroy mijozlarga qarz BERMAGAN — bo'lib-bo'lib to'lash
-- shartnomasi tuzilgan. "Qarz" so'zi munosabatni noto'g'ri ko'rsatadi:
-- mijoz o'zini qarzdor emas, shartnoma bo'yicha to'lovchi deb his qilishi
-- kerak. Bu xushmuomalalik masalasi emas — noto'g'ri atama suhbatning
-- butun ohangini belgilaydi.
--
-- NEGA MIGRATSIYA KERAK: `knowledgeBase.ts` faqat BOSHLANG'ICH manba.
-- Ishlab turgan tizimda qoidalar `agent_rules` jadvalida yashaydi va
-- prompt aynan bazadan yig'iladi. Kodni o'zgartirish mavjud bazaga
-- ta'sir qilmaydi.
--
-- XODIM TAHRIRLAGAN QOIDALARGA TEGILMAYDI (`updated_by IS NOT NULL`) —
-- uning ishini ustidan yozib yuborish mumkin emas. Bunday qoidalar
-- dashboardda qoladi va qo'lda tuzatiladi.

-- Bosh harfli maxsus shakllar — avval, aks holda pastdagi umumiy
-- almashtirish ularni yarim tuzatib qo'yardi.
UPDATE agent_rules
   SET body = replace(body, 'QARZ IKKI QISMDAN', 'KECHIKKAN TO''LOV IKKI QISMDAN'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL AND body LIKE '%QARZ IKKI QISMDAN%';

UPDATE agent_rules
   SET body = replace(body, 'QARZ SUMMALARI', 'KECHIKKAN TO''LOV SUMMALARI'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL AND body LIKE '%QARZ SUMMALARI%';

UPDATE agent_rules
   SET body = replace(body, 'MIJOZ QARZNI', 'MIJOZ TO''LOVNI'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL AND body LIKE '%MIJOZ QARZNI%';

-- Qo'shimchali shakllar — uzunrog'i birinchi, aks holda "qarzdorlik" dan
-- "to'lovdorlik" kabi mavjud bo'lmagan so'z chiqardi.
UPDATE agent_rules
   SET body = replace(
                replace(
                  replace(
                    replace(
                      replace(body, 'qarzdorligini', 'kechikkan to''lovini'),
                      'qarzdorlik', 'kechikkan to''lov'),
                    'qarzingiz', 'kechikkan to''lovingiz'),
                  'Qarzingiz', 'Kechikkan to''lovingiz'),
                'qarzsiz', 'kechikkan to''lovsiz'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND (body ILIKE '%qarzdorlik%' OR body ILIKE '%qarzingiz%' OR body ILIKE '%qarzsiz%');

UPDATE agent_rules
   SET body = replace(
                replace(
                  replace(
                    replace(body, 'qarzning', 'to''lovning'),
                    'qarzni', 'to''lovni'),
                  'Qarzni', 'To''lovni'),
                'QARZNI', 'TO''LOVNI'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND (body ILIKE '%qarzni%' OR body ILIKE '%qarzning%');

UPDATE agent_rules
   SET body = replace(replace(replace(body, 'qarz', 'to''lov'), 'Qarz', 'To''lov'), 'QARZ', 'TO''LOV'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL AND body ILIKE '%qarz%';

-- Misol maydonlarida ham xuddi shunday: agent aynan ulardan o'rganadi.
UPDATE agent_rules
   SET situation    = replace(replace(COALESCE(situation, ''),    'qarzdorlik', 'kechikkan to''lov'), 'qarz', 'to''lov'),
       bad_example  = replace(replace(COALESCE(bad_example, ''),  'qarzdorlik', 'kechikkan to''lov'), 'qarz', 'to''lov'),
       good_example = replace(replace(COALESCE(good_example, ''), 'qarzdorlik', 'kechikkan to''lov'), 'qarz', 'to''lov'),
       why          = replace(replace(COALESCE(why, ''),          'qarzdorlik', 'kechikkan to''lov'), 'qarz', 'to''lov'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND (situation ILIKE '%qarz%' OR bad_example ILIKE '%qarz%'
        OR good_example ILIKE '%qarz%' OR why ILIKE '%qarz%');

-- Bo'lim sarlavhalari va tavsiflari.
UPDATE agent_rule_sections
   SET title       = replace(replace(title, 'Qarz', 'To''lov'), 'qarz', 'to''lov'),
       description = replace(replace(replace(description, 'qarzdorlik', 'kechikkan to''lov'), 'Qarz', 'To''lov'), 'qarz', 'to''lov')
 WHERE title ILIKE '%qarz%' OR description ILIKE '%qarz%';

-- Yuqoridagi umumiy almashtirish ikkita joyda g'aliz gap yasadi:
-- "BOSHLANG'ICH TO'LOV bo'yicha to'lov" (takror) va kompaniyaning o'z
-- hisob-kitobi haqidagi "qarzsiz chiqish" iborasi. Ularni aniq tuzatamiz.

UPDATE agent_rules
   SET body = replace(
                body,
                'BOSHLANG''ICH TO''LOV bo''yicha to''lov va OYMA-OY TO''LOVLAR bo''yicha to''lov',
                'BOSHLANG''ICH TO''LOV bo''yicha kechikish va OYMA-OY TO''LOVLAR bo''yicha kechikish'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND body LIKE '%BOSHLANG''ICH TO''LOV bo''yicha to''lov%';

UPDATE agent_rules
   SET body = replace(body, 'yangi yilgacha kechikkan to''lovsiz chiqishimiz kerak',
                            'yangi yilgacha hisob-kitoblarni yopishimiz kerak'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND body LIKE '%kechikkan to''lovsiz chiqishimiz%';

UPDATE agent_rules
   SET body = replace(body, 'bu katta to''lovni yopmaydi', 'bu katta summani yopmaydi'),
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL AND body LIKE '%katta to''lovni yopmaydi%';
