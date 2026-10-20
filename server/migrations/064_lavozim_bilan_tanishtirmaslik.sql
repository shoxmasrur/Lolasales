-- Agent o'zini "debitorlik bo'yicha mutaxassis" deb tanishtirdi (2026-08-13).
--
-- QAYERDAN CHIQDI: bu jumla bizning o'z misollarimizda "✗ YOMON" varianti
-- sifatida turibdi (`knowledgeBase.ts` EXAMPLES, "Mijoz kimsiz deb
-- tanishmoqchi bo'ldi" holati). Ya'ni model uni o'ylab topmagan —
-- PROMPTDAN o'qib olgan va yomon variantni tanlagan.
--
-- SABAB: promptda "✗ YOMON" va "✓ YAXSHI" belgilarining ma'nosi hech
-- qayerda yozilmagan edi. Model belgini o'zi to'g'ri talqin qilishi
-- kutilardi. Kuchli model buni uddalaydi, boshqasi — yo'q; solishtiruv
-- stendida (`npm run ab-suhbat`) aynan shu farq chiqdi.
--
-- TUZATISH IKKI QATLAMDA:
--   1) `systemPrompt.ts` ga "MISOLLARNI QANDAY O'QISH" bloki qo'shildi —
--      belgilar ma'nosi endi ochiq yozilgan (barcha misol bo'limlariga
--      birdan ta'sir qiladi, bazadagisiga ham);
--   2) shu migratsiya — eng ko'p uchraydigan aniq holat uchun qat'iy taqiq.
--      Tanishtiruv HAR BIR birinchi xabarda bo'ladi, ya'ni bu jumlaning
--      narxi boshqa xatolardan yuqori.
--
-- Kodda ham (`PROHIBITIONS`) shu qoida bor, lekin urug'lantirish faqat
-- BO'SH bo'limga ishlaydi — prodda bo'lim to'la, shuning uchun migratsiya
-- kerak. 062-migratsiya bilan bir xil naqsh.
--
-- Qayta ishga tushirilsa hech nima buzilmaydi: NOT EXISTS himoyalaydi.
--
-- `sort_order = -1` — bo'lim boshida tursin: taqiq har bir suhbatning
-- birinchi xabariga tegishli.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('O''ZINGNI LAVOZIM BILAN TANISHTIRMA: "debitorlik bo''yicha mutaxassisman", "undiruv bo''limidanman" kabi jumlalar mijozni birinchi soniyadayoq himoyaga o''tkazadi — u endi suhbatdoshi bilan emas, undiruvchi bilan gaplashayotganini biladi. To''g''ri shakl: "Xon Saroy Group''dan — shartnomangiz bo''yicha to''lovlarni kuzatib boraman".', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE 'O''ZINGNI LAVOZIM BILAN TANISHTIRMA%');
