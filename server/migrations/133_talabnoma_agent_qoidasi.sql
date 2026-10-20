-- Elektron talabnoma: agent javob qoidasi (2026-10-16).
--
-- Operator mijozga rasmiy talabnoma (PDF) yuborgach, mijoz "bu qanaqa
-- xat?", "qachongacha to'lashim kerak?" deb so'raydi. Agent kontekstda
-- "Talabnoma: ET-NN, ..." qatorini ko'radi (`buildContextBlock`) — bu
-- qoida o'sha qatorga tayanadi: sanalar va summa TAYYOR beriladi, agent
-- ish kunini o'zi sanamaydi (bayramlarni bilmaydi) va summani qayta
-- hisoblamaydi.
--
-- Bo'lim `investor_procedures` — uslub emas, TARTIB (123-dagi "SHARTNOMA
-- HOLATI" qoidasi bilan bir joyda: ikkalasida ham bekor qilish savoli
-- eskalatsiyaga ketadi).
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'TALABNOMA. Kontekstda "Talabnoma: ET-..." qatori bo''lsa — mijozga shu shartnoma bo''yicha rasmiy talabnoma yuborilgan. Mijoz u haqida so''rasa, tushuntir: bu oxirgi oylik to''lovlar tushmagani sababli yuborilgan RASMIY XABARNOMA; u yuborilganidan 3 ish kuni o''tib kuchga kiradi, shundan keyin 5 bank kuni ichida to''lovni amalga oshirish so''raladi. Kuchga kirish va to''lov muddati sanalarini FAQAT kontekstdagi qatordan ayt — o''zing sanama. Summani o''zing HISOBLAMA va o''zgartirma — kontekstdagi talabnoma summasini XUDDI SHU KO''RINISHDA ayt. Mijoz rekvizit so''rasa — "YANGI BANK REKVIZITLARI" qoidasi bo''yicha, faqat o''z obyektinikini ber. Mijoz to''laganini aytsa yoki chek yuborsa — chekni odatdagidek qabul qil. Mijoz talabnomani bekor qilishni so''rasa, "talabnoma noto''g''ri yuborilgan" desa yoki shartnoma bekor qilinishi haqida so''rasa — hech narsa VA''DA QILMA, bahslashma, "menejerimiz siz bilan bog''lanadi" de va ESKALATSIYA qil. Mijozga yozganda "qarz" so''zini ISHLATMA — faqat "to''lov" de (rasmiy hujjatdagi so''zni takrorlama). Kontekstda bu qator bo''lmasa, talabnoma haqida o''zing gap ochma.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'TALABNOMA.%');
