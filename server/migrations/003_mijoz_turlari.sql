-- Mijoz turlari sotuvga o'tdi: client_profiles.client_type endi faqat sotuv
-- tasnifini qabul qiladi (agent `clientMemory.clientType` da shularni qaytaradi).
-- Eski qarz tasnifidagi qiymatlar (qochoq, tajovuzkor, ...) NULL bo'ladi.

ALTER TABLE client_profiles DROP CONSTRAINT IF EXISTS client_profiles_client_type_check;

UPDATE client_profiles
   SET client_type = NULL
 WHERE client_type IS NOT NULL
   AND client_type NOT IN ('tez_qaror', 'oylaydigan', 'narxga_sezgir', 'shubhali');

ALTER TABLE client_profiles
  ADD CONSTRAINT client_profiles_client_type_check
  CHECK (client_type IS NULL OR client_type IN ('tez_qaror', 'oylaydigan', 'narxga_sezgir', 'shubhali'));
