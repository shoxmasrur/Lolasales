-- "Telegram qutisi" — akkauntning Telegramdagi barcha suhbatlarini jonli
-- ko'rish ekrani. Ma'lumot bizning bazamizda saqlanmaydi, har so'rovda
-- Telegramning o'zidan olinadi.
--
-- Alohida ruxsat: bu ekranda akkauntning SHAXSIY yozishmalari ham ko'rinadi
-- (guruhlar, botlar, mijoz bo'lmagan odamlar). `telegram.view` — bu faqat
-- akkaunt holati va limitini ko'rish, u yetarli asos emas.

UPDATE roles
   SET permissions = array_append(permissions, 'telegram.inbox')
 WHERE key = 'admin'
   AND NOT ('telegram.inbox' = ANY (permissions));
