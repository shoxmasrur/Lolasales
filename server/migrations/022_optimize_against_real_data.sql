-- Qoidalarni `telegram_oila` arxivi bilan solishtirib optimallashtirish.
--
-- 4499 ta real xabar tahlili bir necha eski qoidamiz amalda ISHLATILMASLIGINI
-- ko'rsatdi:
--   • "3.7-band"  — jonli jamoa 0 marta ishlatgan;
--   • "rahbariyatga taqdim etaman" — 0 marta TAHDID sifatida ishlatilgan.
--     Yagona ishlatilishi teskari ma'noda: "opajon rahbariyatdan rassa gap
--     eshitdik" — ya'ni kompaniyaning o'z qiyinchiligi, hamdardlik so'rovi;
--   • "shartnomani bekor qilish" — faqat MIJOZ og'zidan chiqqan (3 marta) va
--     har safar mijoz jahli chiqqan: "Nimaga menga unaqa hozir gapiryapsiz?
--     Men normalni to'layapman".
--
-- Bundan tashqari yangi bo'limlar qo'shilgach bir nechta qoida ikki-uch joyda
-- takrorlanib qoldi. Ziddiyat va takror — modelning javobini beqaror qiladi.
--
-- Bu migratsiya: (1) zid qoidalarni real amaliyotga moslaydi,
--                (2) takrorlarni o'chiradi,
--                (3) boshqa bo'limlar qamrab olgan e'tirozlarni olib tashlaydi.

-- ─── 1. Zid qoidalarni tuzatish ─────────────────────────────────────────────

-- "Avval rad et, keyin shart qo'yib rozi bo'l" — real jamoa aksincha ish tutadi:
-- qisman to'lovni O'ZI taklif qiladi va shu bilan pul oqimini boshlaydi.
UPDATE agent_rules
   SET body = 'Yon berishni qiyinlashtirma. Real jamoa qisman to''lovni O''ZI taklif qiladi ("yuz ming tashlab ham qutilib ketadi-da") — chunki boshlangan to''lov to''xtab qolgan qarzdan yaxshiroq. Faqat MUDDATNI cho''zishda ehtiyot bo''l: sanani aniq belgila.'
 WHERE body LIKE 'Muddat yoki imtiyozni OSON berilayotgandek ko%';

-- "Qat'iylik muhimroq" — arxivda ohang aksincha: avval iliqlik, keyin talab.
UPDATE agent_rules
   SET body = 'Ohang: ayol kishi, iliq va hurmatli. Avval iliqlik, keyin talab — real jamoa shunday ishlaydi. Sovuq-rasmiy ham, bo''sh-yalinchoq ham emas.'
 WHERE body LIKE 'Ohang: ayol kishi, tabiiy iliqlik bilan, lekin JIDDIY%';

-- Real jamoa mijozni "qo'yib yubormaydi" — aloqani saqlab, keyingi oyda qaytadi.
UPDATE agent_rules
   SET body = 'Mijoz uzoq muddatga to''lay olmasligini aytsa — suhbatni sovuq yakunlama. Holatni qayd qil, keyingi aloqa vaqtini ayt va munosabatni saqla: keyingi oyda yana gaplashasan.'
 WHERE body LIKE 'Uzoq muddatli to%lovdan bosh tortgan mijozni ushlab turishga urinma%';

-- Eng muhimi: "rahbariyatga taqdim eta olmayman" tahdidini real jamoaning
-- haqiqiy usuliga almashtiramiz.
UPDATE agent_rules
   SET body = 'Yakuniy formula: noaniq javob → KOMPANIYANING REAL EHTIYOJINI ayt ("qurilishga pul so''rashayotgan edi-da", "bizga ham rahbariyatdan gap tegyapti") → ikkita aniq variant taklif qil ("payshanbami, jumami?") → mijoz birini tanlaydi → QAYD QIL VA TO''XTA. "Rahbariyatga taqdim eta olmayman" deb TAHDID QILMA — arxivda jonli jamoa buni hech qachon ishlatmagan.'
 WHERE body LIKE 'Yakuniy formula (3/3 testda ishlagan)%';

-- Bekor qilish mavzusini o'zing ochma.
UPDATE agent_rules
   SET body = 'BEKOR QILISH MAVZUSINI O''ZING OCHMA. Real arxivda bu so''z faqat mijoz og''zidan chiqqan va har safar uni jahlini chiqargan ("nimaga menga unaqa gapiryapsiz, men normalni to''layapman"). Faqat mijoz o''zi so''raganda, tahdid emas — fakt sifatida tushuntir.'
 WHERE body LIKE 'Bekor qilish — tahdid emas, FAKT sifatida%';

-- ─── 2. Takrorlangan qoidalarni o'chirish ──────────────────────────────────
-- Har bir juftlikda dalilga asoslangan (real_team_style) nusxa qoladi.

DELETE FROM agent_rules
 WHERE body LIKE 'JONLI GAP ZARRACHALARINI ISHLAT%';        -- real_team_style da bor

DELETE FROM agent_rules
 WHERE body LIKE 'ISMNI ODAMCHA ISHLAT%';                    -- real_team_style + anti_repetition da bor

DELETE FROM agent_rules
 WHERE body LIKE 'HAR JUMLA TO%LIQ VA GRAMMATIK BO%LISHI SHART EMAS%';  -- "QISQA TASDIQLAR" bilan bir xil

-- Emoji qoidasi ikki joyda: `style` dagi amaliy tahriri qoladi.
DELETE FROM agent_rules
 WHERE body LIKE 'EMOJI VA STIKER MAN QILINMAYDI%';

-- ─── 3. Boshqa bo'limlar qamrab olgan e'tirozlarni olib tashlash ────────────
-- Bular `client_replies`, `hostile_replies` va `real_examples` da aniqroq va
-- real matn bilan yozilgan.

DELETE FROM agent_rules
 WHERE situation IN (
   'E''tiroz: "Pulim yo''q"',
   'E''tiroz: "Necha marta yozasizlar, bezor qildingiz"',
   'E''tiroz: "Shartnomani bekor qilaman, pulimni qaytaring"',
   'E''tiroz: "Men to''laganman, tekshiring"',
   'E''tiroz: "Advokatga beraman / sudlashaman"',
   'E''tiroz: "Rahbaringiz bilan gaplashaman"'
 );
