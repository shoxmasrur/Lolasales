-- 091-migratsiyaga zid qolgan misol va qoidalar (2026-09-15).
--
-- 091 ikki qoida qo'shgan edi: to'lov sanasi keyingi oyga surilmaydi (avval
-- 2–3 kun, keyin qisman to'lov) va "pulim bo'lsa / topsam to'layman" ga
-- yaqin kunlarda imkon qadar to'lash so'raladi. Prodda besh qator hali
-- teskarisini o'rgatardi:
--
--   • dialogue_examples "ko'ramiz, xay" — agent o'zi 5-sentyabrni (avgustda
--     yozilgan, ya'ni keyingi oy) belgilardi;
--   • dialogue_examples "xabar ikkiga bo'lindi" — "sentabr boshimi yoki
--     o'rtasimi?" (keyingi oy ichidan tanlov);
--   • dialogue_examples "to'lay olmasligini aytdi" — "imkoningiz paydo
--     bo'lganda o'zingiz yozing";
--   • stop_signals "sabr so'rasa" — "topsam to'layman" ga sana o'rniga
--     darhol keyingi aloqa vaqti;
--   • hostile_replies "niyat bor, sana yo'q" — "kelasi oy boshida bog'lanaman".
--
-- ATAYLAB TEGILMAGAN: "Bosimni rad etish" misoli va "KEYIN YOZING" qoidasi —
-- norozilik/to'xtash signali, 091 ning o'zi ularni ustun deb qo'yadi.
--
-- Har UPDATE eski matn bo'yicha himoyalangan: operator tahrirlagan qator
-- tegilmaydi, qayta ishga tushirilsa hech nima o'zgarmaydi.

-- ─── 1. "Ko'ramiz, xay" ──────────────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Xo''p, ko''p ushlamayman. Payshanbaga belgilab qo''yaman — to''g''ri kelmasa o''zingiz yozib yuborasiz.',
       why = 'Mijoz ketmoqchi bo''lganda savolni uchinchi marta berish bloklanish bilan tugaydi. Sanani o''zing qo''yib, e''tirozni ochiq qoldirish natijani saqlaydi. Sana yaqin kunlardan olinadi — keyingi oyga surilmaydi.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz "ko''ramiz, xay"%'
   AND r.good_example LIKE '%5-sentyabrga belgilab qo''yaman%';

-- ─── 2. Ikkiga bo'lingan xabar ───────────────────────────────────────────
UPDATE agent_rules r
   SET bad_example = replace(r.bad_example, 'sentabr boshimi yoki o''rtasimi?', 'payshanbami yoki jumami?'),
       good_example = replace(r.good_example, 'sentabr boshimi yoki o''rtasimi?', 'payshanbami yoki jumami?'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Xabar ikkiga bo''lindi%'
   AND r.good_example LIKE '%sentabr boshimi yoki o''rtasimi?%';

-- ─── 3. To'lay olmasligini aytdi ─────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Tushunarli. To''liq bo''lmasa ham, shu bir-ikki kun ichida imkon qadar bir qismini tashlab tura olasizmi?',
       why = 'Sana so''rashni takrorlash ishlamaydi, lekin "o''zingiz yozing" deb kutib qo''yish ham yechim emas. Talabni kichraytir: yaqin kunlarda imkon qadar, bir qismini.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz to''lay olmasligini aytdi%'
   AND r.good_example LIKE '%imkoningiz paydo bo''lganda o''zingiz yozing%';

-- ─── 4. Sabr so'rasa (to'xtash signallari) ───────────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body,
                'Holatini tan ol va sana o''rniga KEYINGI ALOQA vaqtini kelishib ol: bu ham natija.',
                'Holatini tan ol va to''liq sana talab qilma: yaqin kunlarda imkon qadar, hech bo''lmasa bir qismini to''lashni so''ra. Mijoz buni ham rad etsa — KEYINGI ALOQA vaqtini kelishib ol: bu ham natija.'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'stop_signals'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MIJOZ SABABINI AYTIB SABR SO''RASA%Holatini tan ol va sana o''rniga KEYINGI ALOQA vaqtini kelishib ol: bu ham natija.%';

-- ─── 5. Niyat bor, sana yo'q ─────────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Ishonaman. Shu bir-ikki kun ichida ozgina bo''lsa ham tashlab tura olasizmi? Bo''lmasa, kelasi hafta boshida o''zim bir yozaman.',
       why = 'Mijoz niyatini bildirdi — sanani majburlama. Avval yaqin kunlarda imkon qadar bir qismini so''ra; rad etsa, KEYINGI ALOQA vaqtini yaqin kunlardan belgila — keyingi oyga surma.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'hostile_replies'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Niyat bor, sana yo''q%'
   AND r.good_example LIKE '%Kelasi oy boshida bir bog''lanaman%';
