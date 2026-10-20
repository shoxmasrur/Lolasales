-- Uzoq sana: o'rtadagi kun, oy oxiri va navbatdagi oylik ogohlantirishi
-- (2026-09-16, rahbariyat).
--
-- 091 keyingi OYGA belgilangan sanani qamragan edi. Ochiq qolgan ikki teshik:
--
--   1) SHU OY ichidagi uzoq sana. Bugun 5-sentabr, mijoz "31-sentabr"
--      desa — 091 ham, 21-kun qoidasi ham ishlamaydi va agent darhol rozi
--      bo'lardi. Endi 10 kundan narigi sanada oraliqning O'RTASI so'raladi
--      (5 va 31 orasida — 15-16-sentabr).
--   2) Navbatdagi oylik to'lov kuni. Mijoz aytgan sana shu kundan narida
--      bo'lsa, o'sha kunga borganda yangi oylik to'lov ham qo'shiladi va
--      to'lanadigan summa kattalashadi — mijozga buni ochiq aytish kerak.
--
-- FOYDALANUVCHI QARORLARI (2026-09-16 suhbatida):
--   • "Uzoq" chegarasi — 10 kun. 10 kun ichidagi sanaga agent rozi bo'laveradi.
--   • Keyingi oy holatida 091 ning tartibi USTUN qoladi: avval 2-3 kun ichidagi
--     sana. Mijoz ko'nmasa — hech bo'lmasa bir qismi SHU OYNING 24-31
--     oralig'ida. To'lov butunlay keyingi oyga o'tkazilmaydi.
--   • Ogohlantirishda yangi JAMI summa aytilmaydi — raqam qo'shish taqiqi
--     (55ba669: mijozga aytiladigan summa faqat CRM'dan) kuchda qoladi.
--
-- OPERATOR TAHRIRI: 091 ning matni UI'da tahrirlangan bo'lsa, LIKE mos
-- kelmaydi va UPDATE jimgina o'tib ketadi. Qo'llagandan keyin tekshiring:
--   SELECT body FROM agent_rules r JOIN agent_rule_sections s ON s.id = r.section_id
--    WHERE s.key = 'promise_acceptance' AND r.deleted_at IS NULL
--      AND r.body LIKE 'MIJOZ TO%LOV SANASINI KEYINGI OYGA%';
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. Qo'riqchilar `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

-- ─── 1. Keyingi oy holatiga oy oxiri zaxirasi ────────────────────────────
UPDATE agent_rules r
   SET body = r.body || ' Mijoz yaqin kunga ham, qisman to''lovga ham ko''nmasa — oxirgi zaxira SHU OYNING 24–31 oralig''i: hech bo''lmasa bir qismini o''sha kunlarda to''lashni so''ra. To''lovni butunlay keyingi oyga o''tkazma.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA%'
   AND r.body NOT LIKE '%24–31 oralig''i%';

-- ─── 2. Shu oy ichidagi uzoq sana va oylik ogohlantirishi ────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('MIJOZ SHU OY ICHIDAGI UZOQ SANANI AYTSA — bugundan 10 KUNDAN narigi sanaga darhol rozi bo''lma. Bugun bilan mijoz aytgan sana ORALIG''INING O''RTASIDAGI kunni so''ra: bugun 5-sentabr, mijoz "31-sentabr" desa — 15–16-sentabrni. Yopiq savol bilan ber ("15-sanami, 16-sanami?"). Mijoz ko''nmasa — hech bo''lmasa bir QISMINI o''sha o''rtadagi kunlarda to''lashni so''ra, qolgani mijoz aytgan sanaga qoladi. Sanani BUGUN blokidan hisobla. 10 kun ichidagi sanaga esa rozi bo''laver — bahs ochma. Mijoz "shunga yozib qo''ying" deb BUYRUQ ohangida yozsa ham tartib o''zgarmaydi: buyruq — kelishuv emas. Sana keyingi oyga tushsa — "MIJOZ TO''LOV SANASINI KEYINGI OYGA BELGILASA" qoidasi ishlaydi; MUHLAT so''ralsa bu qoida qo''llanmaydi.',
          0),
         ('MIJOZ AYTGAN SANA NAVBATDAGI OYLIK TO''LOV KUNIDAN NARIDA bo''lsa (to''lov kuni MIJOZ MA''LUMOTI blokida turibdi) — buni ochiq, lekin xotirjam ayt: o''sha kungacha kutilsa navbatdagi oylik to''lov ham qo''shiladi va to''lanadigan summa kattalashadi, shuning uchun to''lov kunigacha yopib berish qulayroq. Bu ogohlantirish, tahdid emas — "aks holda" deb davom ettirma. Qo''shilgandan keyingi YANGI JAMI summani O''ZING hisoblab aytma: faqat blokda turgan raqamlarni ishlat.',
          1)
       ) AS v(body, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE left(v.body, 40) || '%');
