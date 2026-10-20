-- Yangi ruxsat: shartnomani shartnomalar bazasidan qayta so'rash.
--
-- Administrator roliga qo'shiladi (u ta'rifi bo'yicha hamma narsani qila
-- oladi) va Operator roliga ham — u mijoz kartasi bilan kunda ishlaydi va
-- eskirgan raqamni ko'rsa darhol yangilay olishi kerak.
--
-- Kuzatuvchi faqat o'qiydi: unga berilmaydi, chunki bu amal tashqi
-- tizimga so'rov yuboradi va bazani o'zgartiradi.

UPDATE roles
   SET permissions = array_append(permissions, 'contracts.sync'),
       updated_at = now()
 WHERE key IN ('admin', 'operator')
   AND NOT ('contracts.sync' = ANY (permissions));
