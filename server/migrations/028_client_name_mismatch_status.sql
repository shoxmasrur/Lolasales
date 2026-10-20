-- Yangi holat: `name_mismatch`.
--
-- Telefon raqami bo'yicha odam topildi, lekin uning Telegramdagi ismi
-- mijozning ismiga umuman mos kelmadi. Ko'p hollarda bu raqam boshqa odamga
-- o'tganini bildiradi — mijoz raqamini almashtirgan, eski raqam esa yangi
-- egasiga berilgan.
--
-- Bunday holatda xabar YUBORILMAYDI: begona odamga qarz haqida yozish
-- shaxsiy ma'lumotni oshkor qilish va jiddiy shikoyat sababi. Operator
-- o'zi tekshirib, qo'lda tasdiqlaydi yoki raqamni tuzatadi.

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_telegram_status_check;

ALTER TABLE clients ADD CONSTRAINT clients_telegram_status_check
  CHECK (telegram_status = ANY (ARRAY[
    'unknown', 'searching', 'found', 'not_found',
    'privacy_restricted', 'name_mismatch', 'blocked'
  ]));
