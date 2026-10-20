-- Xurshid akaning ko'rsatmasi (2026-08-04): mijoz telefon orqali gaplashishni
-- so'rasa, agent uni yozishmaga qaytarmaydi — suhbat "Inson kerak" statusiga
-- o'tadi va debitorlik bo'limidagi xodimlar mijoz bilan telefonda bog'lanadi.
--
-- 013-migratsiyadan keyin seeder "channel_rules" va "client_replies"
-- bo'limlarini eski (yozishmaga qaytaradigan) tahrirda to'ldirib ulgurgan —
-- shuning uchun bu yerda ular yangilanadi.

-- 1) Qo'ng'iroq so'rovi — eskalatsiya sababi
UPDATE agent_rules
   SET body = 'MIJOZ TELEFON ORQALI GAPLASHISHNI SO''RASA ("qo''ng''iroq qiling", "telefonda gaplashaylik", "yarim soatdan keyin telefon qiling") — bu ESKALATSIYA sababi. Debitorlik bo''limidagi hamkasblar u bilan telefon orqali bog''lanadi.'
 WHERE body LIKE 'Mijoz "qo''ng''iroq qiling", "yarim soatdan keyin telefon qiling" desa%';

-- 2) Shu holatda javob qanday bo'lishi kerak
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'Bunday holatda javobing qisqa bo''lsin: "Debitorlik bo''limidagi hamkasbim siz bilan telefon orqali bog''lanadi" — va escalate maydoniga sababni yoz. To''lov sanasini SHU XABARDA qayta so''rama.',
       2
  FROM agent_rule_sections s
 WHERE s.key = 'channel_rules'
   AND NOT EXISTS (
     SELECT 1 FROM agent_rules r
      WHERE r.section_id = s.id AND r.body LIKE 'Bunday holatda javobing qisqa bo''lsin%'
   );

UPDATE agent_rules
   SET body = 'Mijoz "telefon qilmang, Telegramdan yozing" desa — sen allaqachon Telegramdasan. Buni qisqa aniqlashtir, uzr so''rab tushuntirma va eskalatsiya QILMA.'
 WHERE body LIKE 'Mijoz "telefon qilmang, Telegramdan yozing" desa%';

-- 3) 4- va 19-misollar: yozishmaga qaytarish o'rniga eskalatsiya
UPDATE agent_rules
   SET good_example = 'Xalaqit bermayman. Debitorlik bo''limidagi hamkasbim siz bilan telefon orqali bog''lanadi.',
       why = 'Sen qo''ng''iroq qila olmaysan — rozi bo''lish yolg''on va''da. Telefon so''ralgani ESKALATSIYA sababi: escalate maydoniga yoz va sanani shu xabarda qayta so''rama.'
 WHERE situation LIKE '4. "Hozir yig''ilishdaman%';

UPDATE agent_rules
   SET bad_example = 'Yaxshi, 20 daqiqadan keyin qo''ng''iroq qilaman. Bo''shaganingizda sanani aytasiz.',
       good_example = 'Yo''lda xalaqit bermayman. Debitorlik bo''limidagi hamkasbim siz bilan telefon orqali bog''lanadi.',
       why = 'Qo''ng''iroqqa rozi bo''lish — yolg''on va''da, chunki sen telefon qila olmaysan. Telefon so''ralgani ESKALATSIYA sababi.'
 WHERE situation LIKE '19. "Hozir mashina haydayapman%';
