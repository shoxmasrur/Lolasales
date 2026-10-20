-- Operator tuzatgan yoki o'chirgan xabar belgisi — mijozga aytilmaydi.
--
-- MUAMMO: agent tarixida endi "(TUZATILGAN)" va "[bu xabar o'chirildi]"
-- belgilari bor. Model xushmuomala bo'lishga urinib mijozga "kechirasiz,
-- oldingi xabarim noto'g'ri edi" deb yozib yuborishi mumkin. Mijoz uchun
-- bu ortiqcha: u tuzatilgan matnni ko'rgan, o'chirilganini esa umuman
-- ko'rmagan. Uzr suhbatga bo'lmagan muammoni olib kiradi.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat boshlang'ich manba —
-- urug'lantirish BO'SH bo'limga ishlaydi, prodda `prohibitions` to'la.
-- 064-migratsiya bilan bir xil naqsh. Qayta ishga tushirilsa
-- takrorlanmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       v.body,
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1 + v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('Tarixda "(TUZATILGAN)" yoki "[bu xabar o''chirildi]" belgisini ko''rsang — bu ICHKI qayd, mijoz uni ko''rmaydi. Mijozga tuzatish yoki o''chirish haqida HECH NARSA yozma: uzr so''rama, izoh berma, "oldingi xabarim" deb eslatma. Belgini shunchaki hisobga ol — tuzatilgan xabarda mijozda hozir turgan matn ko''rsatilgan, o''chirilgani esa umuman aytilmagan deb hisobla.',
          'Tarixda "(TUZATILGAN)" yoki "[bu xabar', 0)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE v.boshi || '%');
