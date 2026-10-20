-- Standart qoidalar qarzdan sotuvga qayta yozildi (9-vazifa).
--
-- `syncRuleSections` bo'sh bo'lmagan bo'limga tegmaydi, shuning uchun eski
-- o'rnatishlarda (Debitordan ko'chirilgan 28 ta qarz bo'limi) yangi matn hech
-- qachon tushmasdi: kaliti saqlangan bo'limlar (human_tone, style, ...) eski
-- qarz matni bilan qolardi, olib tashlangan bo'limlar (kechikish_ssenariylari,
-- contract_facts, ...) esa promptga tushaverardi.
--
-- Hali deploy qilingan baza yo'q, ya'ni saqlab qolinadigan operator tahriri
-- ham yo'q. Shuning uchun bo'limlar BIR MARTA tozalanadi: server ishga
-- tushganda `syncRuleSections` ularni yangi sotuv qoidalari bilan qaytadan
-- yaratadi. Qoidalar `ON DELETE CASCADE` bilan birga ketadi.

DELETE FROM agent_rule_sections;
DELETE FROM settings WHERE key = 'agent.seeded_sections';
