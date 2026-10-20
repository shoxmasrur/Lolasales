-- Ro'yxatni faylga olib chiqish huquqi.
--
-- NEGA `clients.view` DAN AJRATILDI: ekranda ko'rish qaytarib olinadi —
-- huquq olinsa, ko'rish to'xtaydi. Fayl esa qaytarib olinmaydi: u
-- kompyuterda, pochtada, Telegramda qolib ketadi. Ichida telefon
-- raqamlari va to'lov summalari bor.
--
-- Jimlikda faqat Administratorda. Operatorga kerak bo'lsa dashboarddagi
-- rol oynasidan qo'lda beriladi.
--
-- DIQQAT: mavjud "CRM uchun: noto'g'ri raqamlar" eksporti ham shu
-- ruxsatga o'tdi — operator rolida u tugma yo'qoladi. Bu kutilgan.
UPDATE roles
   SET permissions = array_append(permissions, 'clients.export'),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('clients.export' = ANY (permissions));
