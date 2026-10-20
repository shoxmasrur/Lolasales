-- Tushum hisoboti: "biz gaplashganimizdan keyin qancha to'lov tushdi".
--
-- Bu pul raqamlari va ular tizimning foydasini baholash uchun
-- ishlatiladi, shuning uchun kim ko'rishini alohida hal qilamiz —
-- jimlikda faqat Administratorda. Operatorga kerak bo'lsa dashboarddan
-- qo'lda beriladi.

UPDATE roles
   SET permissions = array_append(permissions, 'reports.view'),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('reports.view' = ANY (permissions));
