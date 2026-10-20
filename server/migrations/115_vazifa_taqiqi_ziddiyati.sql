-- 114 dagi taqiq ishlamadi: ziddiyatli qoida bor edi (2026-09-30).
--
-- 114 "to'lovga aloqasi yo'q vazifalarni bajarma" qoidasini qo'shdi, lekin
-- sinovda agent baribir "5+9 nechchi bo'ladi?" ga "14 bo'ladi 🙂" deb javob
-- berdi. Qoida promptda bor edi (89 000 belgilik promptning 49% o'rnida),
-- ya'ni model uni ko'rgan va boshqasini tanlagan. Agentning o'z izohi
-- sababni aytdi: "Qisqa javob berib, darhol mavzuga qaytarildi" — bu
-- `anti_repetition` bo'limidagi qoidaning so'zi:
--
--   "AVVAL MIJOZNING GAPIGA JAVOB BER… Mijoz salomlashsa, savol bersa yoki
--    kinoya qilsa — o'shani javobsiz qoldirib to'g'ridan-to'g'ri sana
--    so'rash robotlik belgisi."
--
-- Ikki ko'rsatma bir-biriga zid bo'lganda model qaysi birini tanlashi
-- tasodifga qoladi. Shuning uchun YANGI qoida qo'shilmaydi — mavjud
-- ziddiyat yo'qotiladi:
--
--   1. `anti_repetition` qoidasiga istisno qo'shiladi (uning o'z mantig'i
--      saqlanadi: mijozning gapini e'tiborsiz qoldirmaslik).
--   2. 114 dagi taqiqda rad javobning O'ZI javob hisoblanishi aniq
--      aytiladi — ya'ni ikkala qoida ham bajariladi, tanlov qolmaydi.
--
-- Ikkala UPDATE ham idempotent: matn allaqachon qo'shilgan bo'lsa tegmaydi.

UPDATE agent_rules r
   SET body = body || ' ISTISNO: to''lovga aloqasi yo''q topshiriq (masala yechish, kod, tarjima) javob talab qilmaydi — muloyim rad etishning o''zi javob bo''ladi, bu robotlik emas.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'anti_repetition'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'AVVAL MIJOZNING GAPIGA JAVOB BER%'
   AND r.body NOT LIKE '%ISTISNO: to''lovga aloqasi yo''q topshiriq%';

UPDATE agent_rules r
   SET body = body || ' Rad etishning O''ZI javob hisoblanadi: "avval mijozning gapiga javob ber" qoidasi shu bilan bajarilgan bo''ladi, javobni yechib berish shart emas.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'prohibitions'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'TO''LOVGA ALOQASI YO''Q VAZIFALARNI BAJARMA%'
   AND r.body NOT LIKE '%Rad etishning O''ZI javob hisoblanadi%';
