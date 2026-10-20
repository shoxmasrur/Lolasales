-- XATO TUZATISH: telefon bo'yicha qidirish begona odamni qaytarardi.
--
-- Sabab: `contacts.ImportContacts` va `contacts.ResolvePhone` javoblaridagi
-- `users` maydoni — javobga ALOQADOR foydalanuvchilar ro'yxati, so'ralgan
-- raqamning javobi emas. Raqam Telegramda umuman ro'yxatdan o'tmagan bo'lsa
-- ham bu ro'yxat bo'sh bo'lmasligi mumkin. Eski kod `users[0]` ni olardi.
--
-- Real holat: mijoz "Safarov Dilmurod Akbarjonovich" (+998999889992 — bu raqam
-- Telegramda YO'Q) @ulugbek_cto bilan bog'lanib qolgan edi.
--
-- Kod tuzatildi (`peerSelection.ts` — endi `imported[].userId` bo'yicha
-- qidiriladi), lekin bazadagi noto'g'ri bog'lanishlar o'z-o'zidan tuzalmaydi:
-- `ClientTelegramResolver` "allaqachon topilgan bo'lsa qayta qidirmaymiz"
-- qoidasi bilan ishlaydi. Shuning uchun ularni bu yerda tozalaymiz.
--
-- OQIBATI: keyingi murojaatda har bir mijoz uchun qidiruv QAYTA bajariladi.
-- Bu Telegram API'ga qo'shimcha so'rov degani, lekin qidiruv suhbat
-- boshlanganda birma-bir ketadi (kampaniya 60-180 soniya oraliq bilan
-- yuboradi), shuning uchun flood xavfi past.

UPDATE clients
   SET telegram_user_id = NULL,
       telegram_access_hash = NULL,
       telegram_username = NULL,
       telegram_status = 'unknown'
 WHERE telegram_user_id IS NOT NULL;
