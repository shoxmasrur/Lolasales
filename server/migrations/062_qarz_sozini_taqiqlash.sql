-- "Qarz" so'zi agent xabarlarida qaytib paydo bo'ldi (2026-08-13).
--
-- NEGA 043-MIGRATSIYA YETMADI: u so'zni mavjud qoidalar MATNIDAN olib
-- tashlagan, lekin agentga uni TAQIQLAMAGAN. Agent — til modeli: kechikkan
-- to'lov haqida erkin o'zbekcha yozganda "qarz" bu sohaning eng odatiy
-- so'zi, shuning uchun promptda yo'qligi uni to'xtatmaydi — u so'zni o'zi
-- qaytadan yozadi. So'zning YO'QLIGI taqiq emas.
--
-- Shuning uchun bu migratsiya ikki ish qiladi:
--   1) "Qat'iy taqiqlar" bo'limiga ANIQ taqiq qo'shadi (kodda ham
--      `knowledgeBase.ts` PROHIBITIONS ga qo'shildi, lekin urug'lantirish
--      faqat BO'SH bo'limga ishlaydi — prodda bo'lim to'la);
--   2) qolgan barcha shakllarni tozalaydi.
--
-- 043 DAN FARQI: bu safar XODIM TAHRIRLAGAN satrlar ham tozalanadi
-- (`updated_by IS NOT NULL`). 043 ularni ataylab chetlab o'tgan edi va
-- aynan o'shalar agentga eski so'zni o'rgatib turgan bo'lishi mumkin.
-- 061-migratsiya "-da" zarrachasini olib tashlaganda xuddi shunday
-- yo'l tutgan. O'chirilgan satrlarga (`deleted_at`) tegilmaydi — 032
-- bo'yicha ular yuridik tarix.
--
-- Qayta ishga tushirilsa hech nima buzilmaydi: almashtirishlardan keyin
-- matnda "qarz" qolmaydi, taqiq qoidasi esa NOT EXISTS bilan himoyalangan.

-- ─── 1. Almashtirish jadvali ────────────────────────────────────────────────
--
-- Tartib MUHIM: uzun shakl birinchi. Aks holda "qarzdorlik" dan
-- "to'lovdorlik" kabi mavjud bo'lmagan so'z chiqadi. Har bir juftlik uch
-- xil registrda qo'llanadi: qarz / Qarz / QARZ.

CREATE OR REPLACE FUNCTION qarzni_tolovga(txt TEXT) RETURNS TEXT AS $$
DECLARE
  juftlar TEXT[][] := ARRAY[
    -- "qarzdorlik" oilasi — "kechikkan to'lov" ga aylanadi
    ['qarzdorligingizni', 'kechikkan to''lovingizni'],
    ['qarzdorligingiz',   'kechikkan to''lovingiz'],
    ['qarzdorligini',     'kechikkan to''lovini'],
    ['qarzdorligi',       'kechikkan to''lovi'],
    ['qarzdorlikni',      'kechikkan to''lovni'],
    ['qarzdorlik',        'kechikkan to''lov'],
    -- "qarzdor" — odamni bildiradi, sifat bilan almashtiriladi
    ['qarzdorlarni',      'kechikkan to''lovi borlarni'],
    ['qarzdorlar',        'kechikkan to''lovi borlar'],
    ['qarzdorni',         'kechikkan to''lovi borni'],
    ['qarzdorsiz',        'kechikkan to''lovingiz bor'],
    ['qarzdor',           'kechikkan to''lovi bor'],
    -- egalik va kelishik shakllari
    ['qarzingizni',       'kechikkan to''lovingizni'],
    ['qarzingiz',         'kechikkan to''lovingiz'],
    ['qarzimizni',        'to''lovimizni'],
    ['qarzimiz',          'to''lovimiz'],
    ['qarzsiz',           'kechikkan to''lovsiz'],
    ['qarzlarini',        'to''lovlarini'],
    ['qarzlari',          'to''lovlari'],
    ['qarzlar',           'to''lovlar'],
    ['qarzning',          'to''lovning'],
    ['qarzniki',          'to''lovniki'],
    ['qarzni',            'to''lovni'],
    ['qarzdan',           'to''lovdan'],
    ['qarzga',            'to''lovga'],
    ['qarzda',            'to''lovda'],
    ['qarzi',             'to''lovi'],
    -- qolgani
    ['qarz',              'to''lov']
  ];
  i   INT;
  eski TEXT;
  yangi TEXT;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;

  FOR i IN 1 .. array_length(juftlar, 1) LOOP
    eski  := juftlar[i][1];
    yangi := juftlar[i][2];
    -- qarzdorlik → kechikkan to'lov
    txt := replace(txt, eski, yangi);
    -- Qarzdorlik → Kechikkan to'lov
    txt := replace(txt,
                   upper(left(eski, 1)) || substr(eski, 2),
                   upper(left(yangi, 1)) || substr(yangi, 2));
    -- QARZDORLIK → KECHIKKAN TO'LOV
    txt := replace(txt, upper(eski), upper(yangi));
  END LOOP;

  RETURN txt;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 2. Qoidalar va misollar ────────────────────────────────────────────────
--
-- `why` ham promptga tushadi (PromptComposer "Sabab:" qatori), shuning uchun
-- u ham tozalanadi.
--
-- TAQIQ QOIDASINING O'ZIGA TEGILMAYDI. U so'zni nomlashi SHART, ya'ni
-- tozalash uchun mo'ljal bo'lib ko'rinadi. Chetlatilmasa, migratsiya ikkinchi
-- marta ishlaganda o'z taqiqini yeb qo'yadi va agentga "to'lov so'zini yozma"
-- degan teskari qoida qolardi (sinovda aynan shu chiqdi).

UPDATE agent_rules
   SET body         = qarzni_tolovga(body),
       situation    = qarzni_tolovga(situation),
       bad_example  = qarzni_tolovga(bad_example),
       good_example = qarzni_tolovga(good_example),
       why          = qarzni_tolovga(why),
       updated_at   = now()
 WHERE deleted_at IS NULL
   AND COALESCE(body, '') NOT LIKE 'MIJOZGA "qarz"%'
   AND (body ILIKE '%qarz%' OR situation ILIKE '%qarz%' OR bad_example ILIKE '%qarz%'
        OR good_example ILIKE '%qarz%' OR why ILIKE '%qarz%');

-- ─── 3. Bo'lim sarlavhalari va tavsiflari ───────────────────────────────────

UPDATE agent_rule_sections
   SET title       = qarzni_tolovga(title),
       description = qarzni_tolovga(description)
 WHERE title ILIKE '%qarz%' OR description ILIKE '%qarz%';

-- ─── 4. G'aliz bo'lib qolgan joylar ─────────────────────────────────────────
--
-- Umumiy almashtirish ikkita takror yasaydi: "BOSHLANG'ICH TO'LOV bo'yicha
-- to'lov" va kompaniyaning o'z hisob-kitobi haqidagi "to'lovsiz chiqish".
-- 043 dan keyin ham xuddi shu tuzatish kerak edi.

UPDATE agent_rules
   SET body = replace(
                body,
                'BOSHLANG''ICH TO''LOV bo''yicha to''lov va OYMA-OY TO''LOVLAR bo''yicha to''lov',
                'BOSHLANG''ICH TO''LOV bo''yicha kechikish va OYMA-OY TO''LOVLAR bo''yicha kechikish'),
       updated_at = now()
 WHERE deleted_at IS NULL
   AND body LIKE '%BOSHLANG''ICH TO''LOV bo''yicha to''lov%';

UPDATE agent_rules
   SET body = replace(body, 'yangi yilgacha kechikkan to''lovsiz chiqishimiz kerak',
                            'yangi yilgacha hisob-kitoblarni yopishimiz kerak'),
       updated_at = now()
 WHERE deleted_at IS NULL
   AND body LIKE '%kechikkan to''lovsiz chiqishimiz%';

UPDATE agent_rules
   SET body = replace(body, 'bu katta to''lovni yopmaydi', 'bu katta summani yopmaydi'),
       updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE '%katta to''lovni yopmaydi%';

-- ─── 5. Taqiqning o'zi ──────────────────────────────────────────────────────
--
-- Eng muhim qism: endi agentga so'z ANIQ nomlanib taqiqlanadi. Bu satr
-- yuqoridagi almashtirishdan KEYIN qo'shiladi, aks holda taqiqning o'zi
-- "to'lov" ga aylanib, ma'nosiz bo'lib qolardi.
--
-- `sort_order = -1` — bo'lim boshida tursin: u har bir xabarga tegishli.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('MIJOZGA "qarz", "qarzdor", "qarzdorlik", "qarzingiz" so''zlarini HECH QACHON yozma — o''rniga "to''lov" yoki "kechikkan to''lov" deb yoz. Xonsaroy qarz bergan emas: mijoz bilan bo''lib-bo''lib to''lash shartnomasi tuzilgan, u qarzdor emas — shartnoma bo''yicha to''lovchi. Bu xushmuomalalik emas, munosabatning to''g''ri nomi.', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE 'MIJOZGA "qarz"%');

DROP FUNCTION qarzni_tolovga(TEXT);
