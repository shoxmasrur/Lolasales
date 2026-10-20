-- 60 ta norozilik xabari asosida "stop_signals" va "hostile_replies" bo'limlari
-- qo'shilgach, eski "objections" bo'limidagi bitta yozuv ular bilan ziddiyatga
-- tushdi: mijoz rahbarni so'raganda eski qoida "avval aniq sanani ayting" deb
-- o'rgatardi, yangisi esa shikoyat holatida sana so'ramaslikni talab qiladi.
--
-- Ziddiyatli ko'rsatma modelning javobini beqaror qiladi, shuning uchun eski
-- yozuv ikkala holatni ajratadigan tahrirga o'tkaziladi.

UPDATE agent_rules
   SET good_example = 'Albatta, uzataman — rahbarim siz bilan bog''lanadi.',
       why = 'Rad etish va o''zini oqlash qarshilikni kuchaytiradi. Mijoz SHIKOYAT niyatida so''rayotgan bo''lsa (muomaladan norozilik, "shunday qoldirmayman") — sana SO''RAMA va eskalatsiya qil. Faqat ohang xotirjam bo''lsa, uzatishga rozi bo''lib, sanani bir marta so''rasang bo''ladi.'
 WHERE situation LIKE 'E%tiroz: "Rahbaringiz bilan gaplashaman"%';
