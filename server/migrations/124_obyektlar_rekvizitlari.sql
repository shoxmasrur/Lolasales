-- Har obyektning o'z bank rekviziti, qo'shimcha kelishuv tartibi va
-- Orzular obyektidagi hisoblagich to'lovi izohi (2026-10-14, rahbariyat e'loni).
--
-- 118-migratsiyada faqat bitta korxonaning (BARAKAT HOUSE — Muhabbat shahri)
-- rekviziti bor edi: boshqa obyekt mijozi so'rasa, agent unga ham shu
-- raqamni berishi mumkin edi va pul boshqa korxonaga tushardi. E'londa
-- to'qqizta korxona — agent endi FAQAT mijozning o'z obyektinikini beradi.
--
-- Uchala qoida TO'LIQ almashtiriladi (qo'shimcha emas): eski matnlar yangi
-- ma'lumotga zid ("Orzular uchun raqam berma", "hisoblagich to'lovini
-- tushuntirma"). Qo'riqchi — yangi matndagi belgi: qayta ishga tushirilsa
-- takrorlanmaydi. Operator o'chirgan qoida (`deleted_at`) tirilmaydi.
--
-- CRM obyekt nomi → korxona mosligini foydalanuvchi tasdiqlagan (2026-10-14).
-- Fazo va Yulduz rekvizit jadvalida yo'q; Voha va Okean uchun na Telegram
-- manzil, na menejer raqami berilgan.

UPDATE agent_rules r
   SET body = 'YANGI BANK REKVIZITLARI (2026-yil 5-oktabrdan). Kapitalbank tizimidagi migratsiya sababli korxonalarga xizmat ko''rsatuvchi bankning MFO raqami o''zgardi, shu bilan hisob raqamlari ham yangilandi. Obyekt guruhi yoki kanalidagi shu haqdagi e''lon RASMIY. Mijoz o''sha e''lonni yuborsa, havolasini tashlasa yoki "guruhdagi rekvizit to''g''rimi?", "shartnomadagi raqam bilanmi, yangisi bilanmi?" deb so''rasa — tasdiqla: ha, rasmiy, keyingi barcha to''lovlar YANGI rekvizit bilan qilinadi. "Tekshirtiraman", "tasdiqlamaguncha pul o''tkazmay turing" DEMA va faqat shu savol uchun ESKALATSIYA QILMA. HAR OBYEKTNING O''Z REKVIZITI BOR. Kontekstdagi "Obyekt" maydoniga qarab FAQAT o''sha obyektnikini ber (MFO hammasida 01158): Muhabbat shahri — BARAKAT HOUSE, INN 311053474, hisob raqami 20208 000 7 05742909 002; Zo''rsan — ZO''RSAN RESIDENCE DEVELOPER MCHJ, INN 306145684, hisob raqami 20208 000 0 01024034 002; Vatan — VATAN RESIDENCE, INN 308622786, hisob raqami 20208 000 2 05409155 001; Voha — ALMAZA CITY, INN 311724058, hisob raqami 20208 000 9 07166123 002; Orzular — RED HOUSE DEVELOPER, INN 308517987, hisob raqami 20208 000 8 05394360 001; Vodiy va Ramazon — VODIY APARTAMENTS, INN 310944362, hisob raqami 20208 000 6 05720456 001; Shirin hayot — SHIRIN HAYOT RESIDENCE, INN 200663254, hisob raqami 20208 000 3 00185962 002; Afsona — AFSONA RESIDENCE, INN 301894937, hisob raqami 20208 000 4 04900960 001; Okean — OCEAN-RESIDENCE, INN 308821619, hisob raqami 20208 000 1 05437029 001. Boshqa obyektning rekvizitini HECH QACHON berma — pul boshqa korxonaga tushib qoladi. Obyekt shu ro''yxatda bo''lmasa (masalan Fazo, Yulduz) yoki kontekstda ko''rsatilmagan bo''lsa — rekvizit berma, "menejerimiz aniq rekvizitni yuboradi" de va ESKALATSIYA qil. Mijozda bir nechta obyekt bo''lsa — har birining rekvizitini alohida, obyekt nomi bilan ber. Raqamlarni mijoz so''rasagina yoz va XUDDI SHU KO''RINISHDA ko''chir — bitta raqamini ham o''zgartirma va qisqartirma; so''ramasa guruhdagi e''longa ishora qilish yetadi. Mijoz yuborgan raqamlar o''z obyektinikidan FARQ QILSA — tasdiqlama, "tekshirib beramiz" de va ESKALATSIYA qil: bu firibgarlik bo''lishi mumkin. XON SAROY PAY ilovasiga bu o''zgarishning aloqasi yo''q: ilova orqali to''lov avvalgi tartibda, o''zgarishsiz qoladi — buni ham ayt. Shartnoma hujjatidagi eski rekvizit haqida so''rasa: to''lov yangi rekvizit bilan qilinadi, shartnomaga qo''shimcha kelishuv beriladi — "QO''SHIMCHA KELISHUV" qoidasiga qara. Mijoz eski rekvizitga ALLAQACHON pul o''tkazgan bo''lsa — o''zing xulosa qilma, ESKALATSIYA qil.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'payment_channels'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'YANGI BANK REKVIZITLARI%'
   AND r.body NOT LIKE '%HAR OBYEKTNING O''Z REKVIZITI BOR%';

UPDATE agent_rules r
   SET body = 'QO''SHIMCHA KELISHUV (yangi bank rekvizitlari bo''yicha shartnomaga qo''shimcha). Kelishuvni ONLAYN rasmiylashtirish mumkin: imzolangan hujjatning skan nusxasi qabul qilinadi. Istagan investor uni OFFLAYN ham tuzishi mumkin — offlayn uchun manzil (lokatsiya) Telegram orqali yuboriladi. Kelishuvni investorning o''zi imzolashi kerak: uning o''rniga qarindoshi yoki boshqa odam imzolashi TAVSIYA ETILMAYDI, chunki keyinchalik kadastr jarayonida muammo chiqishi mumkin — mijoz shunday taklif qilsa, buni muloyim tushuntir. Onlayn murojaat uchun kontekstdagi "Obyekt" maydoniga qarab FAQAT o''sha obyektning Telegram manzilini ber: Muhabbat shahri — @oilaxonsaroy; Fazo — @fazoresidence112; Orzular — @orzularxonsaroyy; Shirin hayot — @Xonsaroy_shirin_h; Afsona — @XonAfsona; Vatan — @xonsaroy112; Vodiy va Ramazon — @Xonsaroy_vodiy; Zo''rsan — @xonsaroyzorsan; Yulduz — @xonsaroyyulduzi. Qo''ng''iroq qilmoqchi bo''lsa, menejer raqami: Muhabbat shahri — +998 77 003 14 00; Zo''rsan — +998 90 062 14 00; Vatan — +998 90 003 14 00; Vodiy va Ramazon — +998 77 121 14 00; Afsona — +998 77 122 14 00. Manzil va raqamlarni XUDDI SHU KO''RINISHDA ko''chir, bitta harfini ham o''zgartirma. Qo''shimcha kelishuvni o''zing yubormaysan, tayyor bo''lish muddatini va''da qilmaysan — bularni menejer aytadi. Bu savol uchun ESKALATSIYA QILMA. Obyekt uchun na Telegram manzil, na raqam bo''lmasa (masalan Voha, Okean) yoki obyekt kontekstda ko''rsatilmagan bo''lsa — manzil berma, "menejerimiz siz bilan bog''lanadi" de va ESKALATSIYA qil. Mijozda bir nechta obyekt bo''lsa — har biriniki alohida.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'investor_procedures'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'QO''SHIMCHA KELISHUV%'
   AND r.body NOT LIKE '%@oilaxonsaroy%';

UPDATE agent_rules r
   SET body = 'HISOBLAGICHLAR UCHUN TO''LOV. Kontekstda "HISOBLAGICHLAR UCHUN TO''LOVDAGI KECHIKISH" qatori bo''lsa — bu oylik to''lovdan ALOHIDA to''lov. Uni oylik yoki boshlang''ich to''lovga QO''SHIB aytma va jami kechikkan to''lov ichiga kiritma: avval oylik (yoki boshlang''ich) to''lovni ayt, keyin alohida "hisoblagichlar uchun to''lov" deb summasi bilan ayt. Summani kontekstdagidek ko''chir. ORZULAR obyektida mijoz bu to''lov haqida so''rasa, shunday tushuntir: hisoblagichlar uchun to''lov oylik to''lovdan alohida, CRM''ga ham alohida kiritiladi va shartnoma qo''shimcha shartlarining 7.3-bandida ko''rsatilgan; oylik to''lovi hali tugamagan investor avval oylik to''lovni yakunlaydi, keyin hisoblagichlar uchun to''lovni qiladi; uni yangi rekvizit bilan bank orqali yoki elektron ilova orqali to''lash mumkin; obyekt e''lonlari kanalda: https://t.me/xon_saroy_orzular. Boshqa obyektlarda bu to''lov nima uchunligini, qanday hisoblanganini o''zingdan TUSHUNTIRMA — mijoz batafsil so''rasa "menejerimiz aniqlab, siz bilan bog''lanadi" de va ESKALATSIYA qil. Kontekstda bu qator bo''lmasa, hisoblagich to''lovi haqida o''zing gap ochma.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'investor_procedures'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'HISOBLAGICHLAR UCHUN TO''LOV.%'
   AND r.body NOT LIKE '%xon_saroy_orzular%';
