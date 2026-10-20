-- Agent du'oga javob berayotib "Омин" o'rniga "Аминжон" yozdi (2026-08-14).
--
-- QAYERDAN CHIQDI: mijoz «Рахмат сог булинг» dedi — bu du'o. Agent unga
-- javob berish shaklini hech kim o'rgatmagan holda O'ZI topgan: bazadagi
-- 259 qoidada ham, saboqlarda ham "omin" so'zi umuman yo'q. Boshqa
-- suhbatlarda u to'g'ri chiqqan («Омин, раҳмат сизга ҳам, Азизбек ака»),
-- shu suhbatda esa so'z ism shakliga tortilib ketgan: omin + -jon.
--
-- NARXI: "Аминжон" — real o'zbek erkak ismi, shuning uchun mijoz buni
-- sirg'anish deb emas, o'zini BOSHQA ODAM deb chaqirishdi deb o'qiydi.
-- O'sha navbatda modelning o'zi mijoz xotirasiga "Sherzod aka" deb to'g'ri
-- yozgan edi, ya'ni ma'lumot to'g'ri turgan — faqat matn buzilgan.
--
-- NOTO'G'RI SHAKLLAR ATAYLAB YOZILMAGAN. 064-migratsiyada aniqlangan edi:
-- model promptdagi "yomon" variantni o'qib, aynan uni tanlashi mumkin.
-- Shuning uchun qoida faqat TO'G'RI shaklni beradi va o'zgartirishni
-- taqiqlaydi, buzilgan variantlarni nomlamaydi.
--
-- Kodda ham (`knowledgeBase.ts` SOFT_SKILLS) shu qoida bor, lekin
-- urug'lantirish faqat BO'SH bo'limga ishlaydi — prodda bo'lim to'la,
-- shuning uchun migratsiya kerak. 062 va 064 bilan bir xil naqsh.
--
-- Qayta ishga tushirilsa hech nima buzilmaydi: NOT EXISTS himoyalaydi.
--
-- `sort_order = 11` — bo'lim oxiri (hozir 0..10 band). Bu taqiq emas,
-- muomala shakli: boshiga chiqarishga asos yo'q.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('MIJOZ DU''O QILSA ("sog'' bo''ling", "Alloh rozi bo''lsin", "omadingizni bersin") — javobingni "Omin" so''zi bilan boshla, keyin rahmat ayt: "Omin, rahmat sizga ham. Sog''-omon bo''ling". Kirill alifbosida yozayotgan bo''lsang — "Омин". So''zni AYNAN shu shaklda yoz: unga qo''shimcha qo''shsang yoki cho''zsang, u erkak ismiga aylanadi va mijoz o''zini boshqa odamning ismi bilan chaqirilgan deb tushunadi.', 11)
       ) AS v(body, ord)
 WHERE s.key = 'soft_skills'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE 'MIJOZ DU''O QILSA%');
