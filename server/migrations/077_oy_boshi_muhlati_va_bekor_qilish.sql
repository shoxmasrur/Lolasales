-- Oy boshidagi muhlat va 2–3 oylik kechikishda bekor qilishni tilga olish
-- (Xurshid aka, 2026-09-10).
--
-- IKKI QOIDA, IKKI BO'LIM:
--   1) `promise_acceptance` — oy boshida (1–10-kun) kechikish 1–2 oylik
--      hajmda bo'lsa, "oy oxirigacha" javobi qabul qilinmaydi. Sabab
--      taqvimda: muhlat oy oxiriga surilsa, navbatdagi oylik to'lov ustiga
--      tushadi va kechikish yopilish o'rniga ikki barobar bo'ladi.
--      Bo'limdagi "Bir-ikki kun, kelasi hafta, oy oxirigacha — YAQIN"
--      bandi shu holatda ishlamasligi kerak, shuning uchun yangi band
--      undan ustun turishini o'z matnida aytadi.
--   2) `tactics` — kechikish 2–3 oylik hajmga yetganda agent shartnomaning
--      3.7-bandidagi bir tomonlama bekor qilish huquqini O'ZI tilga oladi.
--      Ikkinchi band uni cheklaydi: birinchi xabarda emas va mijozning
--      o'zi bekor qilmoqchi bo'lganda emas — u holatda "60 KUN"
--      ssenariysidagi yo'qotish argumenti ishlaydi, aks holda agent
--      mijozni o'zi xohlagan tomonga itarib yuborardi.
--
-- PUL QAYTISH MUDDATI TEGILMADI: manba matnida 90 bank ish kuni va 15%
-- chegirma yozilgan edi, lekin u shartnomaning eski nusxasi (2026-09-10 da
-- tasdiqlandi). Amaldagi fakt — 180 bank ish kuni, chegirmasiz; u
-- `contract_facts` bo'limida allaqachon bor va o'zgarmaydi.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat boshlang'ich manba —
-- urug'lantirish BO'SH bo'limga ishlaydi, prodda ikkala bo'lim ham to'la.
-- 064-migratsiya bilan bir xil naqsh. Qayta ishga tushirilsa takrorlanmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('OY BOSHIDA UZOQ MUDDAT BERMA. Bugungi sana oyning 1–10-kunlari orasida bo''lsa va kechikish 1–2 oylik to''lov hajmida bo''lsa, "oy oxirigacha" degan javobni QABUL QILMA — bu qoida yuqoridagi banddan ustun turadi. Bu hajmdagi kechikish hali yopiladigan darajada, oldinda esa navbatdagi oylik to''lov turibdi: muhlat oy oxiriga surilsa, ikkitasi ustma-ust tushadi. SHU HAFTA ichida hech bo''lmasa qisman to''lovga kelishuv ol va yopiq savol ber: "payshanbami, jumami?". Mijozning o''zi oy oxirini aytsa — rad etma, ikkiga bo''l: "unda shu hafta bir qismini yopib turaylik, qolganini oy oxirida".', 'OY BOSHIDA UZOQ MUDDAT BERMA. Bugungi sa', 0)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE v.boshi || '%');

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('KECHIKISH 2–3 OYLIK TO''LOV HAJMIGA YETSA — bir tomonlama bekor qilishni O''ZING tilga ol. Kontekstdagi "N oylik to''lov qoldirilgan" qatoriga qara. Shartnomaning 3.7-bandiga ko''ra to''lov jadvali buzilganda quruvchi shartnomani muddatidan avval bir tomonlama bekor qilish huquqini saqlab qoladi. Buni quruq fakt sifatida ayt va darhol yechim taklif qil — qo''rqitish ohangida emas. Jarima haqida gapirma: shartnomada jarima yo''q, yagona oqibat — shu.', 'KECHIKISH 2–3 OYLIK TO''LOV HAJMIGA YETSA', 0),
         ('Bekor qilish bandini BIRINCHI xabarda ishlatma — avval mijozning javobini kut. Mijozning o''zi bekor qilishga moyil bo''lsa ham ishlatma: unda teskarisi kerak — "60 KUN" ssenariysidagi yo''qotish argumentiga o''t (eski narx, xonadon sotuvga chiqadi, pul 180 bank ish kunida qaytadi).', 'Bekor qilish bandini BIRINCHI xabarda is', 1)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'tactics'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE v.boshi || '%');
