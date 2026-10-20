-- Bayram kunlarini ko'rish va boshqarish huquqi.
--
-- NEGA ALOHIDA RUXSAT: bayramlar Sozlamalar sahifasidan chiqib, o'z
-- sahifasiga ko'chdi. `settings.edit` ostida qoldirilsa, bayram
-- kiritish uchun xodimga yuborish tezligi va favqulodda to'xtatish
-- tugmasiga ham huquq berish kerak bo'lardi.
--
-- Ikkalasi ham Administratorga beriladi. Boshqa rolga kerak bo'lsa
-- dashboarddagi rol oynasidan qo'lda beriladi.

UPDATE roles
   SET permissions = array_cat(permissions, ARRAY['holidays.view', 'holidays.manage']),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('holidays.view' = ANY (permissions));
