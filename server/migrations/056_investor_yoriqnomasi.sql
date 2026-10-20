-- "Investorlar bilan ishlash" rasmiy yo'riqnomasi bilimlar bazasiga qo'shildi.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat BOSHLANG'ICH manba — u bo'sh
-- bazani urug'lantiradi. Ishlab turgan tizimda qoidalar `agent_rules`
-- jadvalida yashaydi va prompt aynan bazadan yig'iladi, ya'ni kodni
-- o'zgartirish mavjud bazaga ta'sir qilmaydi.
--
-- XODIM TAHRIRLAGAN QOIDALARGA TEGILMAYDI (`updated_by IS NOT NULL`).
-- Yangi bo'limlar esa `ON CONFLICT DO NOTHING` bilan qo'shiladi —
-- migratsiya ikki marta ishga tushsa ham qoidalar takrorlanmaydi.

-- ─── 1. Call-markaz raqami ────────────────────────────────────────────────
-- Bazadagi raqam (71 200 15 00) chat yozishmalaridan olingan va
-- tasdiqlanmagan edi. Rasmiy yo'riqnomada boshqa raqam ko'rsatilgan;
-- egasi tasdiqladi — eskisi almashtiriladi, ikkitasi qoldirilmaydi
-- (agent qaysi birini berishni bilmasdi).
UPDATE agent_rules
   SET body = 'CALL-MARKAZ: 71 200 74 00. Yangi shartnoma, narx yoki umumiy savollarni shu raqamga yo''naltirish mumkin.',
       updated_at = now()
 WHERE updated_by IS NULL AND deleted_at IS NULL
   AND body LIKE '%200 15 00%';

-- ─── 2. Yangi bo'limlar ───────────────────────────────────────────────────
INSERT INTO agent_rule_sections (key, title, description, kind, sort_order)
VALUES
  ('investor_procedures',
   'Investorlar bilan ishlash tartibi (rasmiy yo''riqnoma)',
   'Uslub emas, TARTIB: qaysi holatda nima qilinadi va qaysi biri agentning vakolatidan tashqarida. Manba — "Investorlar bilan ishlash" yo''riqnomasi',
   'bullets', 24),
  ('object_channels',
   'Obyekt kanallari va qurilishga tashrif',
   'Qurilish holati so''ralganda yuboriladigan aniq havolalar va obyektga tashrif tartibi',
   'bullets', 25)
ON CONFLICT (key) DO NOTHING;

-- ─── 3. Tartib qoidalari ──────────────────────────────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s
  JOIN (VALUES
    (0, 'BOSHQA OBYEKTDAGI SHARTNOMADAN pulni yangi obyektga o''tkazish TO''G''RIDAN-TO''G''RI MUMKIN EMAS — na shartnomadan shartnomaga, na hisobdan hisobga. Investorni pul qaytarish bo''limiga yo''naltirish kerak. Bunday holatda bosim O''TKAZMA va tushunish bilan javob ber. ESKALATSIYA qil.'),
    (1, 'MUHLAT SO''RALSA (birinchi marta): shartnomaning 3.7-bandi va to''lov jadvaliga ko''ra to''lovlar o''z vaqtida bo''lishi kerakligini ayt. Surunkali kechikish shartnoma shartlarining buzilishi va bekor qilish jarayoniga olib borishini FAKT sifatida tushuntir — qo''rqitish ohangida emas. Kechikish qurilish jarayoniga ham ta''sir qilishini eslatish mumkin.'),
    (2, 'MUHLAT QAYTA SO''RALSA: kechikkan to''lovi 2 OYDAN OSHMAGAN bo''lsa, qo''shimcha 2 oy muddat berish mumkin. Shartini ANIQ ayt: muddat oxirida yig''ilgan summaning HAMMASI bir martada to''liq to''lanadi.'),
    (3, 'Kechikish 2 OYDAN OSHGAN bo''lsa qo''shimcha muddat VA''DA QILMA — bu qaror sening vakolatingda emas. Holatini qayd qil va ESKALATSIYA qil.'),
    (4, 'SHARTNOMA ALLAQACHON BEKOR QILINGAN bo''lsa — to''lov talab qilma. Avval pul qaytarish ro''yxati bo''yicha tekshiriladi, keyin qaytarish muddati aytiladi. ESKALATSIYA qil.'),
    (5, 'INVESTOR AVVAL MUDDAT SO''RAB ARIZA YOZGAN bo''lsa, buni CRM orqali tekshirish kerak. Ariza muddati tugagan bo''lsa — shuni eslat va to''lovlarni davom ettirishini so''ra.'),
    (6, 'TO''LOVDA XATOLIK — avval TURINI aniqla. Hisob raqami TO''G''RI, lekin shartnoma raqami yoki ism-familiyada xato bo''lsa: investor ariza yozadi, unga ariza namunasi yuboriladi. Namunani o''zing yubormaysan — ESKALATSIYA qil.'),
    (7, 'MABLAG'' BOSHQA HISOB RAQAMIGA o''tkazilgan bo''lsa: pulni qaytarish uchun alohida ariza yoziladi va uning namunasi yuboriladi. Bu boshqa ariza — yuqoridagisi bilan chalkashtirma. ESKALATSIYA qil.'),
    (8, 'SHARTNOMANI BOSHQA SHAXS NOMIGA rasmiylashtirish: shartnomaning 7-bo''limida (qo''shimcha shartlar) bunga ruxsat berilgan bo''lishi va obyekt HALI QURILISHDA bo''lishi shart. Obyekt qurib bitkazilgan va egalik huquqi rasmiylashtirilayotgan bo''lsa — MUMKIN EMAS. Aniq javobni o''zing berma, ESKALATSIYA qil.'),
    (9, 'AKT-SVERKA yoki to''lovlar ro''yxati so''ralsa — bu bajarilishi mumkin bo''lgan oddiy iltimos, rad ETMA. Ro''yxat yuboriladi; uni o''zing tayyorlamaysan, ESKALATSIYA qil.'),
    (10, 'YANGI SHARTNOMA yoki NARX so''ralsa: sotuv bo''limiga tashrif buyurishni taklif qil, Call-markaz 71 200 74 00 raqamini ber yoki sotuv menejerining raqamiga yo''naltir. NARXNI O''ZING AYTMA.')
  ) AS v(ord, body) ON TRUE
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id);

-- ─── 4. Obyekt kanallari ──────────────────────────────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s
  JOIN (VALUES
    (0, 'QURILISH JARAYONI so''ralsa — investorning SHARTNOMASI TUZILGAN obyekt kanalini yubor. Kontekstdagi "Obyekt" maydoniga qara; obyekt noma''lum bo''lsa kanal yuborma va aniqlashtirib so''ra.'),
    (1, 'OBYEKT KANALLARI: Muhabbat Shahri — https://t.me/oila_majmuasi; Zo''rsan — https://t.me/+rzQipYUJOqg3OTQy; Ramazon Residence — https://t.me/ramazonresidence; Vodiy Residence — https://t.me/vodiyresidence; Orzular — https://t.me/xon_saroy_orzular; Afsona — https://t.me/+Pd7Ne2Ctc_s5ZGIy; Fazo Residence — https://t.me/fazoresidence1; Vatan Residence — https://t.me/vatan_residence_xonsaroy; Okean — https://t.me/xsOcean'),
    (2, 'QURILISH OBYEKTIGA TASHRIF: oldindan ruxsat olinishi va uchrashuv belgilanishi SHART. "Kelavering" deb o''zboshimchalik bilan taklif qilma — tashrifni kelishish kerak, ESKALATSIYA qil.'),
    (3, 'TASHRIFGA KELGANDA: oyoqni TO''LIQ YOPADIGAN poyabzal kiyish shart (xavfsizlik talabi), o''zi bilan PASPORT va SHARTNOMA olib kelishi kerak. Tashrif kelishilganda shu uchtasini eslat.')
  ) AS v(ord, body) ON TRUE
 WHERE s.key = 'object_channels'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id);

-- ─── 5. Mavjud bo'limlarga qo'shimchalar ──────────────────────────────────
-- Bank orqali to'lash tafsilotlari: yo'riqnomada bor, bazada yo'q edi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s
  JOIN (VALUES
    (90, 'BANKKA BORGANDA o''zi bilan SHARTNOMA va PASPORT olib borishi kerak — bularsiz to''lovni rasmiylashtirib bo''lmaydi. Mijoz bankka bormoqchi bo''lsa buni oldindan eslat.'),
    (91, 'TO''LOVDAN KEYIN KVITANSIYANI TEKSHIRISH kerak: unda SHARTNOMA RAQAMI va investorning ISM-FAMILIYASI to''g''ri ko''rsatilgan bo''lishi shart. Xato bo''lsa keyin ariza yozish talab qilinadi, ya''ni bir daqiqalik tekshiruv haftalab ovoragarchilikdan saqlaydi.')
  ) AS v(ord, body) ON TRUE
 WHERE s.key = 'payment_channels'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body LIKE 'BANKKA BORGANDA%');

-- Xonsaroy Pay bosqichlari va yuklab olish havolasi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s
  JOIN (VALUES
    (90, 'XONSAROY PAY BOSQICHMA-BOSQICH: ilovani yuklab olish → telefon raqami va pasport ma''lumotlari bilan ro''yxatdan o''tish → "To''lov" bo''limi → "Shartnoma raqami bo''yicha to''lov" → shartnoma raqamini kiritib to''lash. Mijoz "qanday qilaman?" desa shu ketma-ketlikni ayt.'),
    (91, 'Xonsaroy Pay ilovasi orqali mijoz shartnoma ma''lumotlarini, to''lov jadvalini va o''zi qilgan to''lovlarni KO''RA oladi. "Ko''rinmayapti" degan mijozga shuni eslatish foydali.'),
    (92, 'Ilovani yuklab olish havolasi (Google Play va App Store): http://cc.uz/1697u — mijoz so''rasa shu havolani yubor.'),
    (93, 'XONSAROY PAY bo''yicha VIDEO QO''LLANMA mavjud. Mijoz ilovadan foydalana olmasa, video yuborilishi mumkin — buni o''zing yubormaysan, eskalatsiya qilib so''raysan.')
  ) AS v(ord, body) ON TRUE
 WHERE s.key = 'payment_tools'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body LIKE 'XONSAROY PAY BOSQICHMA%');
