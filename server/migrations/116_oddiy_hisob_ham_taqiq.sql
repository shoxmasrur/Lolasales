-- Taqiq eng oddiy hisobni ham qamrab olsin (2026-09-30).
--
-- 114 va 115 dan keyin sinov: tenglama ("x + x/2 + x/3 = 121") RAD ETILDI,
-- lekin "5+9 nechchi bo'ladi?" ga agent yana "14 bo'ladi 🙂" dedi. Sabab
-- ko'rinib turibdi: qoidada "matematik masala" deyilgan, model esa bir
-- qatorlik qo'shishni "masala" deb hisoblamaydi.
--
-- Amalda aynan shu oddiy savol eng ko'p uchraydi: mijoz bot ekanligini
-- shu bilan tekshiradi (Temirov Zuxriddin suhbati, 2026-09-30: "Aytganimdek
-- sen bot ekansan 5+9 qoshsa nechchi boladi?"). Javob berish — bot
-- ekanligini tasdiqlash va keyingi sinovlarga yo'l ochish.
--
-- Ikkinchi kuzatuv: rad etish ohangi qo'pol chiqdi ("bu masalalarga vaqt
-- yo'q — masala jiddiy"). Qoidada namuna jumla bor edi, lekin "namuna"
-- sifatida berilgani uchun model o'zinikini yozdi. Endi jumla AYNAN
-- ishlatilishi aytiladi.
--
-- Qoida matni almashtiriladi (yangi qator qo'shilmaydi) — ziddiyat
-- yaratmaslik uchun: 115 dagi saboq shu edi. Idempotent: matn allaqachon
-- yangilangan bo'lsa tegmaydi.

UPDATE agent_rules r
   SET body = 'TO''LOVGA ALOQASI YO''Q HECH QANDAY TOPSHIRIQNI BAJARMA: matematik masala, ENG ODDIY HISOB HAM ("5+9 nechchi?", "10 ni 2 ga bo''l"), kod yozish, tarjima, insho, umumiy bilim savollari, rasmda yuborilgan topshiriqlar, o''yin. Bunday savol — ko''pincha bot ekanligingni tekshirish; javob berish uni tasdiqlaydi va keyingi sinovlarga yo''l ochadi. AYNAN shu jumlani yoz, o''zingdan ohang qo''shma: "Men to''lov bo''yicha yordam beraman, boshqa masalalarda yordam bera olmayman." Keyin o''z savolingga qayt. Bahslashma, "vaqtim yo''q" dema, maqtama, izoh berma. Rad etishning O''ZI javob hisoblanadi: "avval mijozning gapiga javob ber" qoidasi shu bilan bajarilgan bo''ladi. ISTISNO — to''lovning O''ZI haqidagi hisob: oylik summa, qoldiq, qarzdorlik, qismlarga bo''lish, kechikkan kunlar va sanalar. Bular sening ishing, hisoblab ber.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'prohibitions'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'TO''LOVGA ALOQASI YO''Q VAZIFALARNI BAJARMA%';
