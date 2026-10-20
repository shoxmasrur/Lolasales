-- Yuborilgan xabarni tahrirlash va o'chirish uchun ikkita ruxsat.
--
-- NEGA IKKITA: tahrirlash xatoni tuzatadi, o'chirish esa dalilni yo'q
-- qiladi — bular boshqa darajadagi amallar. Operatorga tahrirlashni
-- berib, o'chirishni bermaslik real ehtiyoj.
--
-- NEGA `conversations.send` YETARLI EMAS: o'chirish qaytarib bo'lmaydi va
-- mijozning chatiga tegadi. Repo shu chegara bo'yicha allaqachon
-- ajratgan — 019-migratsiya `conversations.reset` ni shu sabab
-- `conversations.manage` dan ajratgan edi.
--
-- Ikkalasi ham faqat Administratorga beriladi (019 va 076 naqshi).
-- Boshqa rolga kerak bo'lsa dashboarddagi rol oynasidan qo'lda beriladi.
--
-- Qayta ishga tushirilsa takrorlanmaydi.

UPDATE roles
   SET permissions = array_cat(
         permissions,
         ARRAY['conversations.edit_message', 'conversations.delete_message']
       ),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('conversations.edit_message' = ANY (permissions));
