-- Elektron talabnoma (2026-10-16): oxirgi ikki oylik to'lov tushmagan
-- mijozga rasmiy talabnoma (PDF) Telegram orqali yuboriladi.
-- Spec: .superpowers/sdd/2026-10-16-elektron-talabnoma/
--
-- NEGA `contracts` ga manzil va INN: talabnoma matnida obyekt manzili
-- yoziladi, rekvizit (kompaniya nomi, hisob raqami, MFO) esa CRM'ning
-- kompaniyalar ro'yxatidan INN bo'yicha tanlanadi. Ikkalasi ham shartnoma
-- sinxronizatsiyasida (`order/show` → obyekt tuguni) keladi; har yuborishda
-- CRM'ga qayta borish o'rniga shu yerda saqlanadi. Excel importi ularga
-- tegmaydi — sinxron `COALESCE` bilan yozadi, API bermasa eskisi qoladi.
--
-- Hamma identifikatorlar UUID (`users`, `clients`, `contracts`, `messages`
-- 001_init.sql da UUID). `gen_random_uuid()` 001 dagi pgcrypto'dan.
-- Idempotent: ikki marta qo'llansa xato bermaydi.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS object_address TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS company_inn TEXT;

-- Talabnoma raqami (`ET-01`, `ET-02`, ...) shu ketma-ketlikdan olinadi.
CREATE SEQUENCE IF NOT EXISTS talabnoma_raqam_seq START 1;

CREATE TABLE IF NOT EXISTS talabnomalar (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID NOT NULL REFERENCES contracts(id),
  client_id      UUID NOT NULL REFERENCES clients(id),
  raqam          INT UNIQUE,
  holat          TEXT NOT NULL CHECK (holat IN ('yuborilmoqda','yuborildi','xato','bekor')),
  summa          NUMERIC(16,2) NOT NULL,
  -- Yuborish paytidagi rekvizit nusxasi: CRM'da keyin o'zgarsa ham yuborilgan
  -- hujjatda nima yozilgani shu yerda qoladi.
  rekvizit       JSONB NOT NULL,
  pdf_path       TEXT,
  -- Telegramga ketgan xabar (`messages.id`). FK qo'yilmagan: yozuv xabar
  -- saqlanishidan oldin yaratiladi va xabar o'chirilsa ham talabnoma
  -- tarixi saqlanishi kerak.
  message_id     UUID,
  kuchga_kirish  DATE,
  muddat_sanasi  DATE,
  sent_at        TIMESTAMPTZ,
  sent_by        UUID REFERENCES users(id),
  xato_sababi    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitta shartnomaga bitta faol talabnoma. `xato` ham kiradi: xato bergan
-- talabnoma qayta urinish yoki bekor qilinguncha shartnomani band qiladi —
-- aks holda ikki operator bir vaqtda ikkinchisini yuborib qo'yishi mumkin.
CREATE UNIQUE INDEX IF NOT EXISTS talabnomalar_bir_marta
  ON talabnomalar (contract_id) WHERE holat IN ('yuborilmoqda','yuborildi','xato');

-- Mijoz kartasi va muddati o'tganlar ro'yxati uchun.
CREATE INDEX IF NOT EXISTS talabnomalar_client_muddat
  ON talabnomalar (client_id, muddat_sanasi) WHERE holat = 'yuborildi';

-- Ruxsatlar Administratorga beriladi (076_holidays_permission.sql uslubida).
-- Boshqa rolga kerak bo'lsa dashboarddagi rol oynasidan qo'lda beriladi.
UPDATE roles
   SET permissions = array_cat(permissions, ARRAY['talabnoma.view', 'talabnoma.send']),
       updated_at = now()
 WHERE key = 'admin'
   AND NOT ('talabnoma.view' = ANY (permissions));
