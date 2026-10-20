-- Sababni so'rash va pul qaytarish javobining to'liqligi
-- (Xurshid aka, 2026-09-11 — 2026-08-25 dagi real suhbat ko'rigi).
--
-- Ikki tuzatish, ikkalasi ham faqat qoida matnlariga tegadi.
--
-- 1) QAYTARISH JAVOBI CHALA EDI. Agent "to'langan pul 180 bank ish kuni
--    ichida qaytariladi" dedi — raqam to'g'ri, lekin pul TO'LIQ va
--    JARIMASIZ qaytishi hamda hisob mijoz ofisga kelib kelishuvni
--    imzolagan kundan boshlanishi tushib qolgan. Shu ikkisisiz jumla
--    "180 kun kutasiz" bo'lib eshitiladi. 083 qo'ygan matnda ikkalasi
--    ham bor edi, lekin gapning oxirida — model faqat raqamni oldi.
--
-- 2) SABABNI BILMASDAN SUMMA SO'RALDI. Mijoz "2-3 oy to'lomasam nima
--    bo'ladi?" deb SO'RADI, agent esa darhol "qancha to'lay olasiz?"
--    dedi. "MIJOZNI TINGLA" qoidasi faqat sabab AYTILGAN holatni
--    qoplardi. Ikkita eski matn (human_tone qoidasi va tone_examples
--    juftligi) teskarisini o'rgatardi: "hozircha unaqa gap yo'q,
--    shunchaki bir kunni kelishib olsak bo'ldi" — agent shu qolipni
--    deyarli so'zma-so'z takrorlab, ketidan summa so'ragan.
--
-- NEGA UPDATE: qaytarish qoidasi va misollar yangi fakt emas, mavjudining
-- to'ldirilishi. Eski matn qolsa, promptda bir mavzuda ikkita qator
-- turardi va qaysi birini olish tasodifga qolardi (083 bilan bir xil sabab).
--
-- OPERATOR TAHRIRI: eski matn UI'da tahrirlangan bo'lsa, LIKE mos kelmaydi
-- va o'sha UPDATE jimgina o'tib ketadi — tahrir bosib yozilmaydi.
-- Qo'llagandan keyin natijani bazada tekshiring.
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. UPDATE lar o'chirilgan
-- (`deleted_at`) qatorlarga tegmaydi; INSERT qo'riqchilari esa
-- `deleted_at` ga qaramaydi — operator o'chirgan qoidamiz tirilmaydi.

-- ─── 1. Qaytarish qoidasi: uch element birga ──────────────────────────────
UPDATE agent_rules r
   SET body = 'Shartnoma bekor qilinganda to''langan summa TO''LIQ qaytariladi — jarima yoki ushlab qolish YO''Q. HISOB QACHON BOSHLANADI: mijoz ofisga kelib bekor qilish kelishuvini imzolagan kundan, suhbat kunidan EMAS. MUDDAT SHARTNOMA SANASIGA BOG''LIQ: kontekstdagi "Shartnoma sanasi" 2025-yil 1-oktabrdan OLDIN bo''lsa 90 BANK ISH KUNI, 1-oktabr yoki undan KEYIN bo''lsa 180 BANK ISH KUNI (3.7 va 4.5-bandlar). UCHALASINI HAM BIRGA AYT: quruq "180 bank ish kunida qaytariladi" mijozga "180 kun kutasiz" bo''lib eshitiladi va uni qo''rqitadi.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'contract_facts'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'Shartnoma bekor qilinganda to''langan pul qaytariladi, LEKIN MUDDAT%';

-- ─── 2. Ikkita misol: raqam yonida "to'liq" va hisob boshlanishi ─────────
UPDATE agent_rules r
   SET good_example = 'Bekor qilinsa, to''langan summangiz to''liq, jarimasiz qaytariladi. Hisob ofisga kelib kelishuvni imzolagan kundan boshlanadi — 90 bank ish kuni. Xonadon esa sotuvga chiqadi, keyin narx boshqacha bo''ladi.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'objections'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'E''tiroz: "Shartnomani bekor qilaman, pulimni qaytaring"%'
   AND r.good_example NOT LIKE '%to''liq, jarimasiz%';

UPDATE agent_rules r
   SET good_example = 'Bekor qilinsa, to''langan summangiz to''liq, jarimasiz qaytariladi. Hisob ofisga kelib kelishuvni imzolagan kundan boshlanadi — 180 bank ish kuni. Tartibi bo''yicha hamkasbim siz bilan bog''lanadi.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'hostile_replies'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Bekor qilish va pulni qaytarish (31, 43, 57, 58)%'
   AND r.good_example NOT LIKE '%to''liq, jarimasiz%';

-- ─── 3. Sababsiz qiyinchilik: avval sabab, summa keyin ───────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'MIJOZ QIYINCHILIKNI SABABSIZ BILDIRSA yoki "to''lomasam nima bo''ladi?" deb SO''RASA — bu hali "to''lay olmayman" degani emas, ko''pincha bu oqibatini bilish istagi. Avval savoliga qisqa javob ber (qo''rqitmasdan), keyin SABABNI so''ra: "nima bo''ldi, sharoit nega og''irlashib qoldi?". SHU XABARDA SUMMA SO''RAMA. Sababni bilmasdan qo''yilgan "qancha to''lay olasiz?" mijozga bosim bo''lib eshitiladi va u yopiladi. Summaga mijoz sababni aytgandan KEYINGI xabarda o''tasan.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'soft_skills'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'MIJOZ QIYINCHILIKNI SABABSIZ%');

-- ─── 4. Qo'rquv savolidan keyin summa so'ralmaydi ────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'MIJOZ QO''RQUV SAVOLINI bersa (shartnoma bekor qilinadimi, pulim qaytadimi, sudga berasizmi) — javob ber va SHU YERDA TUGAT. Javobning ketidan summa yoki sana so''rama, replySecond bilan ham qo''shma. Qo''rqqan odamdan o''sha zahoti pul so''rash javobni bo''sh tasalliga aylantiradi.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'soft_skills'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'MIJOZ QO''RQUV SAVOLINI%');

-- ─── 5. Real suhbatdan yomon/yaxshi juftlik ──────────────────────────────
INSERT INTO agent_rules (section_id, situation, bad_example, good_example, why, sort_order)
SELECT s.id,
       'Mijoz "sharoit bo''lmasa, 2-3 oy to''lomasam nima bo''ladi?" deb SO''RADI (sababini aytmadi)',
       'Tushunarli, sharoit qiyin bo''lsa. Lekin to''lov ikki oydan buyon yig''ilib qolgani uchun, uzoqroq davom etsa shartnoma shartlari buzilgan hisoblanib qoladi. To''liq bo''lmasa ham, hozircha qancha miqdorda to''lab bera olasiz?',
       'To''lov uzoq kechiksa shartnoma shartlari buzilgan hisoblanadi — lekin hozircha unaqa gap yo''q. Ayting-chi, nima bo''ldi, sharoit nega og''irlashib qoldi?',
       'Mijoz oqibatini SO''RADI, "to''lay olmayman" demadi. Savoliga javob berish kerak, lekin sababini bilmasdan summa so''rash bosim bo''lib eshitiladi. Avval bitta savol — summa keyingi xabarda.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'dialogue_examples'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.situation LIKE 'Mijoz "sharoit bo''lmasa, 2-3 oy%');

-- ─── 6. Teskarisini o'rgatgan qolip: "bir kunni kelishib olsak" ──────────
-- Faqat qo'shtirnoq ichidagi ikkinchi yarim almashadi — operator shu
-- qatorning boshqa joyini tahrirlagan bo'lsa, tahriri saqlanadi.
UPDATE agent_rules r
   SET body = replace(r.body,
                      'shunchaki bir kunni kelishib olsak bo''ldi',
                      'xotirjam bo''ling')
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'human_tone'
   AND r.deleted_at IS NULL
   AND r.body LIKE '%shunchaki bir kunni kelishib olsak bo''ldi%';

UPDATE agent_rules r
   SET good_example = 'Yo''q, hozircha unaqa gap yo''q, xotirjam bo''ling. Ayting-chi, nima bo''ldi — sharoit og''irlashib qoldimi?',
       why = 'Qo''rqqan odamga shartnoma bandini o''qish qo''rquvni kuchaytiradi va u suhbatdan chiqib ketadi. Avval tinchlantir, keyin sababni so''ra — shu xabarda sana yoki summa so''rama.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'tone_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz qo''rqdi: "Shartnomani bekor qilasizlarmi?"%'
   AND r.good_example LIKE '%bir kunni kelishib olsak%';
