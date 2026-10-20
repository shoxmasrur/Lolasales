-- Oy oxirida muhlat keyingi oyga surilmasin (Xurshid aka, 2026-09-10).
--
-- 077-migratsiyaning juftligi: u oyning BOSHIDAGI holatni yopgan edi
-- (1–10-kun, "oy oxirigacha" javobi qabul qilinmaydi), bu esa OXIRGI
-- uchdan birini yopadi. Sabab ikkalasida bir xil: to'lov sanasi keyingi
-- oyga o'tsa, kechikish yopilish o'rniga navbatdagi oylik to'lov bilan
-- qo'shilib ketadi va summa ikki barobar bo'ladi.
--
-- NEGA "30 YOKI 31" DEB YOZILMAGAN: manba shu ikki raqamni aytadi, lekin
-- qoida o'n ikki oyning hammasiga tegishli — fevralda oxirgi kun 28
-- (kabisa yilida 29). Shuning uchun band aniq raqam bermaydi, oxirgi kunni
-- promptdagi BUGUN blokining sanasidan hisoblashni talab qiladi.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat boshlang'ich manba —
-- urug'lantirish BO'SH bo'limga ishlaydi, prodda bo'lim to'la.
-- Qayta ishga tushirilsa takrorlanmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('OY OXIRIDA MUHLATNI KEYINGI OYGA SURMA. Bugungi sana oyning 21-kunidan boshlab bo''lsa, kelishilgan sana SHU OYNING OXIRGI KUNIDAN oshmasin — sana keyingi oyga o''tsa, kechikish yopilish o''rniga navbatdagi oylik to''lov bilan qo''shilib ketadi. Oxirgi kunni BUGUN blokidagi sanadan hisobla, "30" yoki "31" deb taxmin qilma: fevralda 28 (kabisa yilida 29) kun bo''ladi. Yopiq savol oyning oxirgi ikki kunidan tuziladi: "30-sanami, 31-sanami?". Mijoz keyingi oyni aytsa ("maoshdan keyin", "5-sanada") — rad etma, ikkiga bo''l: "unda shu oy ichida bir qismini yopib turaylik, qolganini o''sha kuni".', 'OY OXIRIDA MUHLATNI KEYINGI OYGA SURMA. ', 0)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE v.boshi || '%');
