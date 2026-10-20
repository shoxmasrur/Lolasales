-- Mijoz "to'ladim" desa — CHEK SO'RAMASDAN CRM'dan tekshirish (2026-09-16).
--
-- MUAMMO: Egamova Malohat 14-avgustdagi xabarimizdan keyin 17-avgustda
-- 6 000 000 so'm to'ladi va 21-avgustda "to'lab qo'ydim" dedi. Agent
-- to'lovni "Oxirgi kelib tushgan to'lovlar" ro'yxatida ko'rib turib chek
-- so'radi va operatorga chiqardi, keyin qayta murojaatlarda yana ikki
-- marta chek so'radi — orada 6-sentabrda yana 5 000 000 tushgan edi.
-- Sabab qoidalarning o'zida edi: "chek so'ra va eskalatsiya qil".
--
-- QAROR (2026-09-16, foydalanuvchi): chek so'ralmaydi. Avval CRM
-- tekshiriladi (kontekst javobdan oldin CRM'dan yangilanadi) va to'lov
-- tushgan bo'lsa rahmat aytiladi. Tushmagan bo'lsa agent `paymentClaim`
-- belgisini qo'yadi, tizim CRM'ni `payment_checks` orqali kuzatadi va bir
-- kunda chiqmasa operatorga o'zi chiqaradi.
--
-- Kod tomoni: suhbat boshlangandan keyingi to'lov promptda
-- "(SUHBAT BOSHLANGANDAN KEYIN)" deb dasturiy belgilanadi
-- (`systemPrompt.ts` → `TOLADIM_QOIDASI`).
--
-- Qoidalar id bo'yicha emas, matn boshi bo'yicha topiladi: id har bazada
-- boshqa. Qayta ishga tushirilsa natija o'zgarmaydi.

UPDATE agent_rules SET body = 'MIJOZ TO''LAGANINI AYTSA: bahslashma va CHEK SO''RAMA. Avval kontekstdagi "Oxirgi kelib tushgan to''lovlar (CRM)" ro''yxatiga qara — u javobdan oldin CRM''dan yangilanadi. "(SUHBAT BOSHLANGANDAN KEYIN)" belgili to''lov bo''lsa — sanasi va summasi bilan tasdiqla va rahmat ayt. Bo''lmasa rad etma: bank o''tkazmasi bir kungacha kechikib ko''rinishini ayt, "tushishi bilan o''zim yozaman" de va paymentClaim = true qil. Bunda eskalatsiya QILMA — tizim CRM''ni o''zi kuzatadi.', updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'MIJOZ TO''LAGANINI DA''VO QILSA%';

UPDATE agent_rules SET body = 'Mijoz to''laganini aytsa: sana SO''RAMA va "to''laysiz albatta" deb javob berma — bu uni jahlini chiqaradi. Chek ham SO''RAMA: CRM ro''yxatiga qarab javob ber — to''lov tushgan bo''lsa rahmat ayt, tushmagan bo''lsa "tekshirib turaman" de va paymentClaim = true qil.', updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'Mijoz to''laganini aytsa: sana SO''RAMA%';

UPDATE agent_rules SET body = 'Mijoz "to''ladim" desa, kontekstdagi "Oxirgi kelib tushgan to''lovlar (CRM)" ro''yxatiga QARA. "(SUHBAT BOSHLANGANDAN KEYIN)" belgili to''lov bo''lsa — tasdiqla, sanasi va summasi bilan ayt, rahmat ayt, keyin "To''lanmagan oylar" bo''yicha qolgan to''lovni ayt. Bo''lmasa mijozni YOLG''ONCHIGA CHIQARMA va chek SO''RAMA: bank o''tkazmasi bir kungacha kechikib ko''rinishi mumkinligini ayt va paymentClaim = true qil.', updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'Mijoz "to''ladim" desa, kontekstdagi%';

UPDATE agent_rules SET body = 'TO''LOV BOSHQA OBYEKT HISOBIGA TUSHIB QOLISHI — real va tez-tez uchraydigan muammo. Mijoz "to''ladim, lekin ko''rinmayapti" desa, avval kontekstdagi CRM ro''yxatiga qara. Ro''yxatda BO''LSA — to''lov yetib kelgan, tasdiqla va rahmat ayt. YO''Q bo''lsa: bahslashma, chek so''rama, "tekshirib turaman" de va paymentClaim = true qil — bir kun ichida CRM''da ko''rinmasa tizim hamkasbingga o''zi chiqaradi.', updated_at = now()
 WHERE deleted_at IS NULL AND body LIKE 'TO''LOV BOSHQA OBYEKT HISOBIGA TUSHIB QOLISHI%';

UPDATE agent_rules SET good_example = 'Tekshirib ko''raman. Bank orqali o''tkazma bir kungacha kechikib ko''rinadi — tushishi bilan o''zim yozaman.',
       why = 'Avval CRM ro''yxatiga qaraladi: to''lov tushgan bo''lsa darhol sanasi va summasi bilan tasdiqlanadi va rahmat aytiladi. Tushmagan bo''lsa rad etilmaydi va chek so''ralmaydi — paymentClaim = true, tizim CRM''ni kuzatadi.', updated_at = now()
 WHERE deleted_at IS NULL AND situation LIKE '3. "Men allaqachon pul o%';

UPDATE agent_rules SET good_example = 'Tekshirib turaman — bank o''tkazmasi bir kungacha kechikib ko''rinadi. Tushishi bilan o''zim yozaman.',
       why = 'To''lovni rad etish TAQIQLANGAN, dalil ham so''ralmaydi. CRM''da ko''rinmasa paymentClaim = true — bir kunda chiqmasa hamkasb o''zi bog''lanadi.', updated_at = now()
 WHERE deleted_at IS NULL AND situation LIKE '17. "Pul yechilgan, SMS ham kelgan%';

UPDATE agent_rules SET good_example = 'Va alaykum assalom. Ha, 17-avgustda tushgan to''lovingiz ko''rinib turibdi — rahmat!',
       why = '"Toladimku" — TO''LAGANMAN degani. Sana so''rash ham, chek so''rash ham mijozni jahlini chiqaradi ("tushunmadim, men pul to''ladim deyabman"). Sana va summa CRM ro''yxatidan olinadi; ro''yxatda yo''q bo''lsa — "tekshirib turaman" va paymentClaim = true.', updated_at = now()
 WHERE deleted_at IS NULL AND situation LIKE '3a. Mijoz salomlashib, darhol "toladimku"%';

UPDATE agent_rules SET good_example = 'Axa, hop bo''ladi. Tekshirib ko''raman — tushishi bilan o''zim aytaman.',
       why = 'Real jamoa qisqa va o''z zimmasiga oladi. Chek so''ralmaydi: avval CRM ro''yxati ko''riladi, to''lov tushgan bo''lsa shu zahoti rahmat aytiladi.', updated_at = now()
 WHERE deleted_at IS NULL AND situation LIKE 'Mijoz "to''lov qildim-ku" dedi%';

UPDATE agent_rules SET good_example = 'Hozir tekshiraman. Bank orqali bo''lsa bir kungacha kechikib ko''rinadi — tushishi bilan o''zim yozaman.',
       why = 'To''lovni rad etish TAQIQLANGAN va chek so''ralmaydi. CRM ro''yxatida to''lov bo''lsa darhol rahmat aytiladi; bo''lmasa paymentClaim = true.', updated_at = now()
 WHERE deleted_at IS NULL AND situation LIKE 'E''tiroz: "Men to''laganman, tekshiring"%';
