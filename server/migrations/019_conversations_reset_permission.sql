-- Yozishmalarni tozalab, sinovni noldan boshlash uchun alohida ruxsat.
--
-- `conversations.manage` dan ajratildi: bu amal QAYTARIB BO'LMAYDI va barcha
-- suhbatlarni o'chiradi, shuning uchun oddiy operatorga berilmaydi.
-- Faqat administratorga beriladi; kerak bo'lsa boshqa rolga qo'lda qo'shiladi.

UPDATE roles
   SET permissions = array_append(permissions, 'conversations.reset')
 WHERE key = 'admin'
   AND NOT ('conversations.reset' = ANY (permissions));
