-- Yangi ruxsat: shartnoma raqami bo'yicha mijoz qo'shish.
--
-- Administrator va Operator roliga beriladi: operator eksportga tushmay
-- qolgan qarzdorni ko'rsa, uni darhol qo'sha olishi kerak.
--
-- Kuzatuvchi faqat o'qiydi: unga berilmaydi, chunki bu amal tashqi
-- tizimga so'rov yuboradi va bazaga yangi mijoz yozadi.

UPDATE roles
   SET permissions = array_append(permissions, 'clients.create'),
       updated_at = now()
 WHERE key IN ('admin', 'operator')
   AND NOT ('clients.create' = ANY (permissions));
