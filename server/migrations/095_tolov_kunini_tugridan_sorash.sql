-- Daromad kunini emas, to'lov kunini so'rash (2026-09-15).
--
-- Agent yozdi: "Tushunarli. Ish haqingiz yoki boshqa daromadingiz taxminan
-- qaysi kunlarda tushadi? Shunga qarab bir sanani belgilab qo'yamiz."
-- Ko'rsatma: shu jumla o'rniga "To'lovni amalga oshiradigan kunni
-- aytsangiz" deyish ma'qul. Prodda agent maosh/daromad kunini 9 marta
-- so'ragan (2026-08-07 — 2026-09-14).
--
-- Bu savolni yetti qator o'rgatardi — "pul manbasini aytsa, manbaning
-- kunini so'ra" qoidasi, 091 dagi "sanani umuman bilmasa" qoidasi,
-- takrorlanishga qarshi qoidadagi "oylik qachon tushadi?" namunasi va to'rt
-- misol. Agent yozgan jumla deyarli so'zma-so'z hostile_replies dagi
-- "Real qiyinchilik" misolidan ("Ish yoki daromad taxminan qachonga
-- tiklanadi? O'shanga qarab belgilaymiz").
--
-- Kodda systemPrompt.ts dagi muzokara zinapoyasi ham tuzatildi (u bazada
-- yo'q, migratsiya kerak emas).
--
-- Har UPDATE eski matn bo'yicha himoyalangan: operator tahrirlagan qator
-- tegilmaydi, qayta ishga tushirilsa hech nima o'zgarmaydi.

-- ─── 1. Pul manbasi qoidasi ──────────────────────────────────────────────
UPDATE agent_rules r
   SET body = 'Mijoz sababini va PUL MANBASINI aytsa (maosh, korxona, sotuv, qarindosh) — manbaning kunini SO''RAMA ("maoshingiz qaysi kuni tushadi?", "daromadingiz taxminan qaysi kunlarda tushadi?" kabi savol kerak emas). To''lov kunini to''g''ridan-to''g''ri, yumshoq so''ra: "To''lovni amalga oshiradigan kunni aytsangiz".',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'Mijoz sababini va PUL MANBASINI aytsa%o''sha manbaning kunini so''ra%';

-- ─── 2. 091 qoidasi: sanani umuman bilmasa ───────────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body,
                'Pul manbasi aytilgan bo''lsa (maosh, sotuv), o''sha kunni so''rash ham mumkin; u keyingi oyga tushsa,',
                'Pul manbasi aytilgan bo''lsa ham (maosh, sotuv) daromad kunini so''rama — "To''lovni amalga oshiradigan kunni aytsangiz" de; aytilgan kun keyingi oyga tushsa,'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MIJOZ SANANI UMUMAN BILMASA%o''sha kunni so''rash ham mumkin%';

-- ─── 3. Takrorlanishga qarshi: to'siq namunasi ───────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body, '("nima to''sqinlik qilyapti?", "oylik qachon tushadi?")', '("nima to''sqinlik qilyapti?")'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'anti_repetition'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'IKKI VARIANTLI YOPIQ SAVOL%"oylik qachon tushadi?"%';

-- ─── 4. "Pulim yo'q hozir" misoli ────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Tushunarli. To''liq bo''lmasa ham, shu bir-ikki kun ichida imkon qadar bir qismini tashlab tura olasizmi? Qolganini to''laydigan kunni ham aytsangiz.',
       why = 'Puli yo''q odam katta summani topa olmaydi, lekin kichigini topa oladi. Suhbatni ochiq qoldirish o''rniga yaqin kunlarda imkon qadar to''lashni so''ra. Qolgani uchun daromad kunini so''rama — to''lov kunini to''g''ridan-to''g''ri so''ra.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'dialogue_examples'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Mijoz "pulim yo''q hozir" dedi%'
   AND r.good_example LIKE '%Qolganini daromad tushadigan kunga kelishamiz.%';

-- ─── 5. Mijoz javoblari, 2-band ──────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Tushunarli. To''lovni amalga oshiradigan kunni aytsangiz — o''sha kunni belgilab qo''yamiz.',
       why = 'Mijoz pul manbasini aytdi. "Aniq sana kerak" deb qaytarish ham, maosh kunini so''rash ham kerak emas — to''lov kunini to''g''ridan-to''g''ri, yumshoq so''ra.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'client_replies'
   AND r.deleted_at IS NULL
   AND r.situation LIKE '2. "Hozir pulim yo''q%'
   AND r.good_example LIKE 'Maoshingiz qaysi kuni tushadi?%';

-- ─── 6. Mijoz javoblari, 11-band ─────────────────────────────────────────
UPDATE agent_rules r
   SET good_example = 'Tushunarli. To''lovni amalga oshiradigan kunni aytsangiz — o''sha kunga belgilab qo''yamiz.',
       why = 'Yana "aniq emas" deb qaytarish — takrorlash. Korxona qachon pul berishini so''rama: to''lov kunini mijozning o''zi aytadi.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'client_replies'
   AND r.deleted_at IS NULL
   AND r.situation LIKE '11. "Maoshim kechikyapti%'
   AND r.good_example LIKE 'Korxonangiz odatda qaysi kunlarda beradi?%';

-- ─── 7. Real qiyinchilik (agent jumlasining manbasi) ─────────────────────
UPDATE agent_rules r
   SET good_example = 'Tushunarli, holatingiz og''ir ekan. To''lovni amalga oshiradigan kunni aytsangiz — o''shanga qarab belgilab qo''yamiz.',
       why = 'Bu chin qiynalayotgan mijoz: avval holatini tan ol. Ish haqi yoki daromad qachon tushishini so''rama — to''lov kunini to''g''ridan-to''g''ri so''ra.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'hostile_replies'
   AND r.deleted_at IS NULL
   AND r.situation LIKE 'Real qiyinchilik%'
   AND r.good_example LIKE '%Ish yoki daromad taxminan qachonga tiklanadi?%';
