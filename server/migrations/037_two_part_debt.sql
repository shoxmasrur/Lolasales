-- Qarzning ikkala qismini ham mijozga aytish.
--
-- MUAMMO: eksportda qarz ikki ustunda keladi — `Долг (1 взнос)`
-- (boshlang'ich to'lov bo'yicha) va `Долг (мес.)` (oyma-oy to'lovlar
-- bo'yicha). Agentga faqat ikkinchisi ko'rsatilardi. Natijada
-- boshlang'ich to'lovdan qarzi bor mijozga u umuman tilga olinmasdi,
-- faqat shu qarzi borlar bilan esa suhbat umuman boshlanmasdi.
--
-- YECHIM: ikkala qism ham alohida aytiladi va jami ko'rsatiladi:
--   "boshlang'ich to'lovdan 12 000 000 so'm, oylik to'lovlardan
--    5 305 000 so'm — jami 17 305 000 so'm"
--
-- Jami — SHU IKKALASINING yig'indisi, eksportdagi `Долг (Общ)` emas.
-- Mijoz aytilgan raqamlarni qo'shib ko'radi; ular jamiga to'g'ri
-- kelmasa, butun hisob-kitobga ishonchi qolmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('QARZ IKKI QISMDAN iborat bo''lishi mumkin: BOSHLANG''ICH TO''LOV bo''yicha qarz va OYMA-OY TO''LOVLAR bo''yicha qarz. Kontekstda ikkalasi ham berilgan bo''lsa, mijozga IKKALASINI ham alohida ayt va jamini ko''rsat: "boshlang''ich to''lovdan 12 000 000 so''m, oylik to''lovlardan 5 305 000 so''m — jami 17 305 000 so''m". Mijoz nima uchun qancha qarzdorligini bilishi kerak, aks holda raqamni tan olmaydi.', -2),
         ('Kontekstda qarzning faqat BITTA qismi bo''lsa, faqat o''shani ayt. "Jami" deb qo''shimcha qilma — u o''sha raqamning takrori bo''lib, mijozni chalg''itadi.', -1)
       ) AS v(body, ord)
 WHERE s.key = 'contract_facts'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);

-- Takrorlanmaslik qoidasi ko'plikka o'tadi: endi summa bitta emas.

UPDATE agent_rules
   SET body = 'QARZ SUMMALARI va KECHIKISH KUNINI faqat BIR MARTA — birinchi xabarda '
              'ayt. Keyin "qarzingiz", "kelishilgan summa", "shu summa" deb ishora qil. '
              'Raqamni faqat mijoz o''zi so''raganda yoki va''da buzilganda qayta ayt.'
 WHERE body = 'QARZ SUMMASI va KECHIKISH KUNINI faqat BIR MARTA — birinchi xabarda '
              'ayt. Keyin "qarzingiz", "kelishilgan summa", "shu summa" deb ishora qil. '
              'Raqamni faqat mijoz o''zi so''raganda yoki va''da buzilganda qayta ayt.';
