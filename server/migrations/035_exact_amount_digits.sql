-- Summani so'z bilan emas, raqamda yozish.
--
-- MUAMMO: "jonli til" qoidasi agentga katta summani soddalashtirishni
-- buyurardi — "1 135 253 so'm" o'rniga "1 million 135 ming so'm". Amalda
-- bu mijozga aniqlikni yo'qotib berardi: 17 305 000 so'm qarz "17 million
-- 305 ming" bo'lib ketardi va mijoz o'zi ko'rgan hisob-kitob bilan
-- solishtira olmasdi. Undiruvda esa aniq raqam — ishonchning asosi.
--
-- YECHIM: summa har doim raqamda, xonalari ajratilgan holda yoziladi.
-- Bu jonli tilga zid emas: idora tili so'z tanlashda bo'ladi, raqamni
-- yaxlitlashda emas. Kontekstda summa allaqachon shu ko'rinishda
-- ("17 305 000 so'm") beriladi — agent uni shundayligicha ko'chiradi.

UPDATE agent_rules
   SET body = 'SUMMANI HAR DOIM RAQAMDA, xonalarini ajratib yoz: "17 305 000 so''m". '
              'So''z bilan ("17 million 305 ming") YOZMA va yaxlitlama '
              '("taxminan 17 million") — mijoz aniq summani ko''rishi kerak, aks holda '
              'hisob-kitobga ishonchi qolmaydi. Kontekstda berilgan raqamni xuddi shu '
              'ko''rinishda ko''chir.'
 WHERE body = 'KATTA SUMMANI GAPDA SODDA AYT: "1 135 253 so''m" o''rniga '
              '"1 million 135 ming so''m". To''liq raqamni faqat birinchi xabarda '
              'yoki mijoz o''zi so''raganda yoz.';

-- Misol ham qoidaga ergashishi kerak: bu juftlik RASMIY/JONLI tilni
-- taqqoslaydi, summa ikkalasida ham bir xil va aniq bo'lib qoladi.

UPDATE agent_rules
   SET good_example = replace(good_example, '1 million 135 ming so''m', '1 135 253 so''m'),
       why = '"Murojaat qilyapman", "summa kechiktirilgan" — idora tili. Ma''lumot bir xil, '
             'lekin odam yozgandek eshitiladi. Summa esa ikkalasida ham aniq raqamda — '
             'jonli til raqamni yaxlitlash degani emas.'
 WHERE good_example LIKE '%1 million 135 ming so''m%';
