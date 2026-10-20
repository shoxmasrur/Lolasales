-- Keyingi oy sanasi, noaniq muddat va oy oxiri (rahbariyat yo'riqnomasi,
-- 2026-09-14).
--
-- Yo'riqnomaning uch bandi:
--   1) mijoz to'lov sanasini keyingi oyga belgilasa — darhol rozi bo'linmaydi,
--      avval 2–3 kun ichidagi sana, to'g'ri kelmasa qisman to'lov so'raladi;
--   2) "bilmayman, pulim bo'lsa to'layman" — yaqin kunlarda imkon qadar
--      to'lash so'raladi;
--   3) "keyingi oyga yozib qo'ying" degan buyruq qabul qilinmaydi; 26–31-kunlarda
--      to'lov kuni eng uzog'i oy oxiri, chunki oy oxirida hisobot yopiladi.
--
-- FOYDALANUVCHI QARORLARI (manbada yo'q, suhbatda hal qilingan):
--   • 3-banddagi 26-kun chegarasi OLINMADI — 078 dagi 21-kun qoidasi qattiqroq
--     va 26–31-kunlarni allaqachon qamraydi. Undan faqat hisobot sababi
--     qo'shildi, u ham ICHKI: mijozga aytilmaydi.
--   • 078 qoidasining "keyingi oyni aytsa — rad etma, ikkiga bo'l" jumlasi
--     1-bandga zid (u avval 2–3 kunni talab qiladi) — yangi qoidaga havola
--     bilan almashtirildi.
--   • Muhlat so'rovi (089) bu tartibdan tashqarida qoladi.
--   • Uchta misol 2-bandga zid edi: "1 oylardan keyin" (agent o'zi keyingi oy
--     sanasini taklif qilardi) — o'chirildi; "pulim yo'q hozir" va "bilmadim"
--     — YAXSHI javobi qayta yozildi.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat bo'sh bo'limni urug'lantiradi,
-- prodda bo'limlar to'la.
--
-- OPERATOR TAHRIRI: eski matn UI'da tahrirlangan bo'lsa, LIKE mos kelmaydi va
-- UPDATE jimgina o'tib ketadi. Qo'llagandan keyin tekshiring:
--   SELECT body FROM agent_rules r JOIN agent_rule_sections s ON s.id = r.section_id
--    WHERE s.key = 'promise_acceptance' AND r.deleted_at IS NULL
--      AND (r.body LIKE 'OY OXIRIDA%' OR r.body LIKE 'MIJOZ%');
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. INSERT qo'riqchilari
-- `deleted_at` ga qaramaydi — operator o'chirgan qoida tirilmaydi.

-- ─── 1. Oy oxiri: hisobot sababi va yangi qoidaga havola ─────────────────
UPDATE agent_rules r
   SET body = 'OY OXIRIDA MUHLATNI KEYINGI OYGA SURMA. Bugungi sana oyning 21-kunidan boshlab bo''lsa, kelishilgan sana SHU OYNING OXIRGI KUNIDAN oshmasin — sana keyingi oyga o''tsa, kechikish yopilish o''rniga navbatdagi oylik to''lov bilan qo''shilib ketadi. Yana bir ichki sabab: har oyning oxirida hisobot yopiladi, to''lovlar shu kungacha tushishi kerak — buni mijozga AYTMA. Oxirgi kunni BUGUN blokidagi sanadan hisobla, "30" yoki "31" deb taxmin qilma: fevralda 28 (kabisa yilida 29) kun bo''ladi. Yopiq savol oyning oxirgi ikki kunidan tuziladi: "30-sanami, 31-sanami?". Mijoz keyingi oyni aytsa ("maoshdan keyin", "5-sanada") — "MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA" qoidasi bo''yicha ish tut.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'OY OXIRIDA MUHLATNI KEYINGI OYGA SURMA.%rad etma, ikkiga bo''l%';

-- ─── 2. Ikki yangi qoida ─────────────────────────────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA ("keyingi oyning 5-sanasida", "oy boshida to''layman") — bugun oyning qaysi kuni bo''lishidan qat''i nazar, darhol rozi bo''lma. Avval YAQINROQ sanani taklif qil: bugundan 2–3 kun ichidagi kunni, yopiq savol bilan ("payshanbami, jumami?"). Bugun oyning 21-kunidan boshlab bo''lsa, bu sana ham shu oyning oxirgi kunidan oshmasin. Bu to''g''ri kelmasa — hech bo''lmasa bir QISMINI shu kunlarda to''lashni so''ra, qolgani mijoz aytgan sanaga qoladi. Mijoz "shu sanaga yozib qo''ying" deb BUYRUQ ohangida yozsa ham tartib o''zgarmaydi: buyruq — kelishuv emas. Mijoz MUHLAT so''rasa (investor tartibidagi muhlat qoidalari) bu qoida qo''llanmaydi.',
          'MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA', 0),
         ('MIJOZ SANANI UMUMAN BILMASA ("bilmayman", "pulim bo''lsa to''layman", "pul topilsa o''tkazaman") — bu yaqin muddat emas: ochiq qoldirma va "o''zingiz yozing" deb kutib o''tirma. Yaqin kunlarda imkon qadar to''lashni so''ra — to''liq bo''lmasa ham bir qismini shu bir-ikki kun ichida. Pul manbasi aytilgan bo''lsa (maosh, sotuv), o''sha kunni so''rash ham mumkin; u keyingi oyga tushsa, "MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA" qoidasi ishlaydi. Mijoz norozilik bildirgan bo''lsa yoki to''xtash signali bo''lsa — o''sha qoidalar ustun.',
          'MIJOZ SANANI UMUMAN BILMASA', 1)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE v.boshi || '%');

-- ─── 3. Zid misollar ─────────────────────────────────────────────────────
UPDATE agent_rules r
   SET deleted_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz taxminiy muddat berdi: "shu hafta emas, 1 oylardan keyin%';

UPDATE agent_rules r
   SET good_example = 'Tushunarli. To''liq bo''lmasa ham, shu bir-ikki kun ichida imkon qadar bir qismini tashlab tura olasizmi? Qolganini daromad tushadigan kunga kelishamiz.',
       why = 'Puli yo''q odam sanani BILMAYDI, lekin kichik summani topa oladi. Suhbatni ochiq qoldirish o''rniga yaqin kunlarda imkon qadar to''lashni so''ra — qolgani uchun sana daromad kunidan chiqadi.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz "pulim yo''q hozir" dedi%'
   AND r.good_example LIKE 'Tushunarli. Daromadingiz qachon tushadi%';

UPDATE agent_rules r
   SET good_example = 'Tushunarli, aniq kunni bilmasangiz mayli. Ozgina bo''lsa ham, shu bir-ikki kun ichida imkon qadar tashlab tura olasizmi?',
       why = '"Bilmadim" — chinakam noaniqlik, sanani uchinchi marta so''rash foyda bermaydi. Lekin kutib qo''yish ham yechim emas: savolni sanadan summaga o''tkaz va yaqin kunlarda imkon qadar to''lashni so''ra.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz "bilmadim" dedi%'
   AND r.good_example LIKE '%Hafta oxirida o''zim bir bog''lanaman%';
