-- Yangi holat: `deactivated` — mijozning Telegram akkaunti O'CHIRILGAN.
--
-- Telegram bunday holatda `INPUT_USER_DEACTIVATED` qaytaradi. Ilgari bu
-- holat umuman belgilanmasdi: agent har safar qaytadan yozishga urinardi,
-- har safar o'sha xatoni olardi va jurnalda shovqin to'planardi.
--
-- `blocked` dan ATAYLAB ajratilgan, garchi ikkalasi ham xabar yuborishni
-- to'xtatsa ham: "bloklagan" — mijozning QARORI, "o'chirilgan" — akkaunt
-- endi umuman mavjud emas. Operator uchun bu ikki xil vaziyat: birinchisida
-- mijoz bilan aloqa bor lekin u xohlamaydi, ikkinchisida boshqa aloqa
-- vositasi qidirish kerak.

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_telegram_status_check;

ALTER TABLE clients ADD CONSTRAINT clients_telegram_status_check
  CHECK (telegram_status = ANY (ARRAY[
    'unknown', 'searching', 'found', 'not_found',
    'privacy_restricted', 'name_mismatch', 'blocked', 'deactivated'
  ]));
