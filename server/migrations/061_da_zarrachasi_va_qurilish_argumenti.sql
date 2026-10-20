-- Xurshid akaning tuzatishi (2026-08-12): agent tilidan ikki narsa olinadi.
--
-- 1) "-da" ZARRACHASI. Ilgari u "jonli til" belgisi deb tavsiya qilingan edi
--    (022-migratsiya va `human_tone` / `real_team_style` bo'limlari), lekin
--    yozma matnda u sun'iy eshitiladi. Endi taqiqlanadi. "-ku", "-chi",
--    "-yu", "-mi" o'z holicha qoladi.
--
-- 2) "QURILISHGA PUL SO'RASHAYOTGAN EDI" ARGUMENTI. Pul qayerga ketishini
--    bahona qilib to'lov so'rash mantiqi butunlay olib tashlanadi.
--    Kompaniyaning ehtiyoji haqidagi qolgan ifodalar ("bizga ham gap
--    tegyapti", "yangi yilgacha hisob-kitoblarni yopishimiz kerak") qoladi.
--
-- Kodda (`knowledgeBase.ts`) ham shu tuzatish kiritildi, lekin urug'lantirish
-- faqat BO'SH bo'limga ishlaydi — prodda qoidalar allaqachon bazada, shuning
-- uchun tirik satrlar shu migratsiyada yangilanadi.
--
-- Har bir UPDATE `LIKE` bilan himoyalangan: qayta ishga tushirilsa hech nima
-- o'zgarmaydi, operator tahrirlagan satrlar esa mos kelmasa tegilmaydi.

-- ─── 1. "-da" ni tavsiya qilayotgan qoidalar ────────────────────────────────

UPDATE agent_rules
   SET body = 'JONLI GAP ZARRACHALARINI ISHLAT: "-ku", "-chi", "mayli", "bo''pti", "xo''p", "ha endi". "-da" zarrachasini ISHLATMA. Bitta xabarga BITTASI yetadi — ko''p ishlatilsa soxta chiqadi.'
 WHERE body LIKE 'JONLI GAP ZARRACHALARINI ISHLAT:%';

UPDATE agent_rules
   SET body = 'YUMSHATUVCHI ZARRACHALAR real jamoaning nutqida doim bor: "-ku", "-chi", "-yu", "-mi" ("-da" bundan mustasno — u ishlatilmaydi). "To''lov qilib bera olasizmi" — "to''lang" emas. "Qarang" bilan boshlash ham ularning odati.'
 WHERE body LIKE 'YUMSHATUVCHI ZARRACHALAR%';

-- ─── 2. "Qurilishga pul" argumenti ──────────────────────────────────────────

UPDATE agent_rules
   SET body = 'ENG KUCHLI BOSIM — SHARTNOMA BANDI EMAS, KOMPANIYANING REAL EHTIYOJI. Real jamoa shunday deydi: "bizga ham rosa gap tegyapti", "bizlar ham yangi yilgacha hisob-kitoblarni yopishimiz kerak". Bu odamni ayblamaydi, hamkorlikka chaqiradi va amalda ishlaydi. LEKIN "qurilishga pul so''rashayotgan edi" degan mantiqni ISHLATMA — pul qayerga ketishini bahona qilib so''rama.'
 WHERE body LIKE 'ENG KUCHLI BOSIM — SHARTNOMA BANDI EMAS%';

-- 022-migratsiya yozgan "Yakuniy formula" qoidasi.
UPDATE agent_rules
   SET body = 'Yakuniy formula: noaniq javob → KOMPANIYANING REAL EHTIYOJINI ayt ("bizga ham rahbariyatdan gap tegyapti", "yangi yilgacha hisob-kitoblarni yopishimiz kerak") → ikkita aniq variant taklif qil ("payshanbami, jumami?") → mijoz birini tanlaydi → QAYD QIL VA TO''XTA. "Rahbariyatga taqdim eta olmayman" deb TAHDID QILMA — arxivda jonli jamoa buni hech qachon ishlatmagan.'
 WHERE body LIKE 'Yakuniy formula: noaniq javob%';

-- 023-migratsiya yozgan takrorlanishga qarshi qoida "qurilishga pul kerak" ni
-- namuna sifatida keltirardi — endi u argument yo'q, boshqa misol olinadi.
UPDATE agent_rules
   SET body = 'Bitta bosim argumentini ikki marta ishlatma. Masalan "oyning oxirgi bank kuni" yoki "yangi yilgacha hisob-kitoblarni yopishimiz kerak" bir marta aytilgan bo''lsa, keyingi xabarda boshqa argument top yoki umuman bosma.'
 WHERE body LIKE 'Bitta bosim argumentini ikki marta ishlatma.%';

-- ─── 3. Misollardagi matnlar ────────────────────────────────────────────────

-- Ohang misoli: "hozir qiyin ekan-da" + mavjud bo'lmagan "qachonroq" so'zi.
UPDATE agent_rules
   SET good_example = 'Tushunarli, hozir vaziyat qiyin. Qachon imkon bo''ladi deb o''ylaysiz?',
       why = '"Imkoniyatingiz yo''q ekan", "amalga oshira olasiz" — rasmiy. Sodda fe''l va qisqa jumla gapni tiriltiradi.'
 WHERE good_example LIKE 'Tushunarli, hozir qiyin ekan-da.%';

UPDATE agent_rules
   SET good_example = 'Ko''p yozganimiz jonga tekkan, uzr. Bitta kun ayting — keyin bezovta qilmayman.'
 WHERE good_example LIKE 'Ko''p yozganimiz jonga tekkan ekan-da,%';

-- Birinchi xabar namunasi: qurilish argumenti olib tashlanadi.
UPDATE agent_rules
   SET good_example = 'Assalomu alaykum, yaxshimisiz, tuzukmisiz, charchamayapsizmi? 🙂 Qarang, 11-sida oylik to''lovingiz chiqqan edi — bugun-erta to''lov qilib bera olasizmi, iltimos?',
       why = 'Real jamoa aynan shunday yozadi. Salomlashuv rituali + "qarang" + yumshoq so''rov + "iltimos". Bizning variantimiz sovuq va rasmiy.'
 WHERE good_example LIKE '%Qurilishga pul so''rashayotgan edi%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'uzib-uzib to''lasangiz bo''ladi-da.', 'uzib-uzib to''lasangiz ham bo''ladi.')
 WHERE good_example LIKE '%uzib-uzib to''lasangiz bo''ladi-da.%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'komissiya olinadi-da.', 'komissiya olinadi.')
 WHERE good_example LIKE '%komissiya olinadi-da.%';

-- ─── 4. Qolgan barcha "-da" lar (operator qo'lda yozganlari ham) ────────────
--
-- Faqat SO'Z OXIRIDAGI "-da" olinadi va oldida HARF turishi shart. Shu sabab
-- "11-da" kabi sana shakllari va qoidalarning o'zida tirnoq ichida turgan
-- "-da" (oldida `"` bor) tegilmaydi. O'rin-payt qo'shimchasi ("Telegramda",
-- "oy o''rtalarida") defissiz yozilgani uchun umuman mos kelmaydi.

UPDATE agent_rules
   SET body = regexp_replace(body, '([a-zA-Z''])-da\M', '\1', 'g')
 WHERE body ~ '([a-zA-Z''])-da\M';

UPDATE agent_rules
   SET good_example = regexp_replace(good_example, '([a-zA-Z''])-da\M', '\1', 'g')
 WHERE good_example ~ '([a-zA-Z''])-da\M';

UPDATE agent_rules
   SET bad_example = regexp_replace(bad_example, '([a-zA-Z''])-da\M', '\1', 'g')
 WHERE bad_example ~ '([a-zA-Z''])-da\M';

-- `why` ham promptga tushadi (PromptComposer "Sabab:" qatori), shuning uchun
-- undagi namunalar ham tozalanadi.
UPDATE agent_rules
   SET why = regexp_replace(why, '([a-zA-Z''])-da\M', '\1', 'g')
 WHERE why ~ '([a-zA-Z''])-da\M';
