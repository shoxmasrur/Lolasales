-- Xurshid akaning 2026-08-04 dagi yangi ko'rsatmalari.
-- Qoidalar bazada yashaydi, shuning uchun yangilari migratsiya bilan qo'shiladi
-- (seeder faqat baza bo'sh bo'lganda ishlaydi va mavjud tahrirlarni buzmaydi).

-- 1) Yangi bo'lim: to'lov usullari
INSERT INTO agent_rule_sections (key, title, description, kind, sort_order)
VALUES ('payment_channels', 'To''lov usullari',
        'Naqd pul qabul qilinmaydi — qayerga va qanday to''lash mumkin', 'bullets', 45)
ON CONFLICT (key) DO NOTHING;

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('NAQD PUL QABUL QILINMAYDI — na ofisda, na boshqa joyda. Bu qonun talabi: barcha to''lovlar rasmiy (shaffof) hisob raqam orqali o''tadi.', 0),
         ('Mijoz naqd pul bilan kelmoqchi bo''lsa: ayrim sotuv ofislarimizda BANK KASSASI mavjud — o''sha yerdan to''lov qilishi mumkin. Yoki bankning o''ziga yaqin filialiga borib to''lasa bo''ladi.', 1),
         ('"Ofisga naqd olib boraman" degan mijozga: naqd qabul qilinmasligini ayt va yuqoridagi ikki yo''lni taklif qil. Uzr so''rab uzoq tushuntirma — qisqa va aniq.', 2),
         ('Bir nechta to''lov tizimi orqali to''lash imkoni bor. LEKIN ularning aniq nomlarini, rekvizitlarini yoki shartlarini AYTMA — bu ma''lumot hali senga berilmagan. "To''lov usullari bo''yicha menejerimiz aniq aytadi" deb yo''naltir.', 3),
         ('Mijoz "qayerga to''layman?" deb so''rasa: sotuv ofisimizdagi bank kassasi yoki bankning yaqin filiali — shu ikkitasini ayt, tafsilotni menejerga yo''naltir.', 4)
       ) AS v(body, ord)
 WHERE s.key = 'payment_channels'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id);

-- 2) Uslub: xabar 2-3 qatordan oshmasin, oshsa ikkiga bo'linsin
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('QISQA yoz — xabar 2-3 QATORDAN oshmasin.', -2),
         ('Agar aytadigan narsa 2-3 qatorga sig''masa va uni qisqartirib bo''lmasa — xabarni IKKIGA BO''LIB yoz, bitta uzun xabar yozma.', -1)
       ) AS v(body, ord)
 WHERE s.key = 'style'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);

-- 3) Takrorlanmaslik: shartnoma raqami faqat birinchi xabarda
UPDATE agent_rules
   SET body = 'SHARTNOMA RAQAMINI faqat birinchi xabarda ayt. Keyingi xabarlarda uni umuman TAKRORLAMA — "shartnomangiz" deb ishora qil. Mijoz o''zi so''rasagina qayta ayt.'
 WHERE body LIKE 'Shartnoma raqamini bir marta ayt%';
