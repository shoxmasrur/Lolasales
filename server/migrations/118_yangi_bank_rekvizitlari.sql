-- Yangi bank rekvizitlari (2026-10-05, rahbariyat).
--
-- Kapitalbank tizimidagi migratsiya sababli MFO va hisob raqami o'zgardi;
-- e'lon obyekt guruhlariga yuborildi. Mijozlar uni agentga yuborib
-- "shu to'g'rimi?" deb so'rayapti, agent esa bilmagani uchun
-- "tasdiqlamaguncha pul o'tkazmay turing" deb javob berib, eskalatsiya
-- qilardi (Qutpiddinov Abdunabi, 2026-10-05; 3 kunda 10 ta shunday xabar,
-- hammasi eskalatsiyada).
--
-- Rekvizit yozish taqiqi (`prohibitions`) saqlanadi, lekin shu qoidaga
-- istisno ochiladi — ziddiyat qoldirilmaydi (115-migratsiya saboqi).
--
-- Agent raqamlarni faqat mijoz so'raganda va aynan ko'chirib yozadi;
-- mijoz yuborgan raqamlar farq qilsa TASDIQLAMAYDI — soxta e'lon
-- (firibgarlik) ham xuddi shunday ko'rinadi.
--
-- Xon Saroy Pay ilovasiga o'zgarish taalluqli emas.
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'YANGI BANK REKVIZITLARI (2026-yil 5-oktabrdan). Kapitalbank tizimidagi migratsiya sababli korxonaga xizmat ko''rsatuvchi bankning MFO raqami o''zgardi, shu bilan hisob raqami ham yangilandi. Obyekt guruhi yoki kanalidagi shu haqdagi e''lon RASMIY. Mijoz o''sha e''lonni yuborsa, havolasini tashlasa yoki "guruhdagi rekvizit to''g''rimi?", "shartnomadagi raqam bilanmi, yangisi bilanmi?" deb so''rasa — tasdiqla: ha, rasmiy, keyingi barcha to''lovlar YANGI rekvizit bilan qilinadi. "Tekshirtiraman", "tasdiqlamaguncha pul o''tkazmay turing" DEMA va faqat shu savol uchun ESKALATSIYA QILMA. Yangi rekvizitlar: BARAKAT HOUSE, INN 311053474, MFO 01158, hisob raqami 20208 000 7 05742909 002. Raqamlarni mijoz so''rasagina yoz va XUDDI SHU KO''RINISHDA ko''chir — bitta raqamini ham o''zgartirma va qisqartirma; so''ramasa guruhdagi e''longa ishora qilish yetadi. Mijoz yuborgan raqamlar shu yerdagidan FARQ QILSA — tasdiqlama, "tekshirib beramiz" de va ESKALATSIYA qil: bu firibgarlik bo''lishi mumkin. XON SAROY PAY ilovasiga bu o''zgarishning aloqasi yo''q: ilova orqali to''lov avvalgi tartibda, o''zgarishsiz qoladi — buni ham ayt. Shartnoma hujjatidagi eski rekvizit haqida so''rasa: to''lov yangi rekvizit bilan qilinadi, shartnoma hujjati bo''yicha alohida e''lon qilinadi. Mijoz eski rekvizitga ALLAQACHON pul o''tkazgan bo''lsa — o''zing xulosa qilma, ESKALATSIYA qil.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'payment_channels'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'YANGI BANK REKVIZITLARI%');

UPDATE agent_rules r
   SET body = r.body || ' ISTISNO — "YANGI BANK REKVIZITLARI" qoidasi: o''sha yerda berilgan rekvizitlarni mijoz so''rasa yozish mumkin.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'prohibitions'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'Bank rekvizitlari, karta raqami%'
   AND r.body NOT LIKE '%YANGI BANK REKVIZITLARI%';
