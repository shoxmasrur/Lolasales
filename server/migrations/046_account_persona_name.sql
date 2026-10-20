-- Har akkaunt mijozga o'z ismi bilan tanishadi.
--
-- NULL — "umumiy sozlamadagi ismdan foydalan". Standart qiymat ataylab
-- qo'yilmadi: mavjud akkauntlar hech narsa o'zgarmasdan umumiy ismda
-- qolishi kerak, aks holda ular bir kechada boshqa ism bilan yozib
-- ketardi.
--
-- Uzunlik cheklovi bazada emas, API darajasida (2-40 belgi): bo'sh satr
-- ham yaroqli kirish va u NULL ga aylantiriladi.
ALTER TABLE telegram_accounts ADD COLUMN persona_name TEXT;
