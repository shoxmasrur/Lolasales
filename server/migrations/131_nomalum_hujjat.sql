-- Noma'lum mijoz: hujjat bilan tasdiqlash (2026-10-15, foydalanuvchi qarori).
-- Telefon mos kelmasa/yashirin bo'lsa, odamdan pasport yoki shartnomaning
-- 1-beti rasmi so'raladi — yangi holat `hujjat_kutilmoqda`. 130 dagi CHECK
-- avtomatik nomlangan (`nomalum_suhbatlar_holat_check`): o'chirib, xuddi
-- shu nom bilan qayta qo'yamiz — qayta ishga tushirilsa ham xavfsiz.
ALTER TABLE nomalum_suhbatlar DROP CONSTRAINT IF EXISTS nomalum_suhbatlar_holat_check;
ALTER TABLE nomalum_suhbatlar ADD CONSTRAINT nomalum_suhbatlar_holat_check
  CHECK (holat IN ('kutilmoqda','hujjat_kutilmoqda','tasdiq_kutilmoqda','operatorda','mijoz_emas','boglandi'));
