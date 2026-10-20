-- Tizim jurnalini ko'rish huquqi.
--
-- Jimlikda faqat Administratorda: jurnal qatorlarida mijoz ismi va
-- telefon raqami ko'rinadi. Boshqa rolga kerak bo'lsa dashboarddagi
-- rol oynasidan qo'lda beriladi.
UPDATE roles
   SET permissions = array_append(permissions, 'logs.view'),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('logs.view' = ANY (permissions));
