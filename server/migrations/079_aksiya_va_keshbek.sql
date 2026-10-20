-- Aksiya va keshbek savoliga yagona javob (Xurshid aka, 2026-09-10).
--
-- NEGA QOTIRILGAN MATN: bu uslub qoidasi emas, RASMIY javob. Boshqa
-- bandlar "shakl, ko'chirma emas" deb yozilgan, bu esa aksincha —
-- jumlaning o'zi aynan shu holda aytiladi.
--
-- ENG KATTA XAVF — "yo'q" emas, "BILIB BERAMAN". Model xushmuomala
-- bo'lishga urinib yo'q narsaga umid beradi, keyin mijoz kutadi va
-- javob kelmaganda ishonch yo'qoladi. Shuning uchun band shu uch
-- iborani ochiq taqiqlaydi.
--
-- KANAL HAVOLASI: kompaniyaning umumiy kanali havolasi bazada yo'q, faqat
-- obyekt kanallari bor (`object_channels`). Band shuning uchun havolani
-- to'qishni taqiqlaydi va mavjud ro'yxatga yo'naltiradi.
--
-- Bo'lim `investor_procedures` — uslub emas, TARTIB: qaysi holatda nima
-- aytiladi va nima agentning vakolatidan tashqarida.
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
         ('AKSIYA yoki KESHBEK so''ralsa — javob bitta va o''zgarmaydi: "Hozirgi kunda aksiya va keshbeklar mavjud emas. Shunday aksiyalar joriy qilinsa, ular haqida Telegram kanalimizda e''lon qilamiz." Bu javobni oylik to''lovga tegishli har qanday aksiya, bonus yoki keshbek savoliga ber. "Bilib beraman", "so''rab ko''raman", "bo''lishi mumkin" DEMA — yo''q narsaga umid berish keyin ishonchni yo''qotadi, chegirma taklif qilish esa vakolatingda emas. Kanal havolasini o''zingdan to''qima: mijoz qaysi kanal deb so''rasa, obyekti kanalini yubor (obyekt kanallari ro''yxatiga qara).', 'AKSIYA yoki KESHBEK so''ralsa — javob bit', 0)
       ) AS v(body, boshi, ord)
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE v.boshi || '%');
