-- Ism tekshiruvi (`nameMatch.ts`) qo'shilishidan OLDIN aniqlangan mijozlar.
--
-- Ular `found` holatida turibdi, lekin:
--   • Telegramdagi ismi saqlanmagan (`telegram_name IS NULL`);
--   • ism mijozning F.I.O. si bilan hech qachon solishtirilmagan.
--
-- Ya'ni ular orasida raqami boshqa odamga o'tganlari bo'lishi mumkin va biz
-- buni bilmaymiz. Identifikatorni tozalaymiz — keyingi murojaatda qidiruv
-- qaytadan bajariladi va bu safar ism ham tekshiriladi.
--
-- `telegram_name` to'ldirilganlarga tegilmaydi: ular allaqachon yangi kod
-- bilan tekshirilgan.

UPDATE clients
   SET telegram_user_id = NULL,
       telegram_access_hash = NULL,
       telegram_username = NULL,
       telegram_status = 'unknown'
 WHERE telegram_status = 'found'
   AND telegram_name IS NULL;
