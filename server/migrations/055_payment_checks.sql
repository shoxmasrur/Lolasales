-- Mijoz yuborgan to'lov kvitansiyasini tekshirish.
--
-- MUAMMO: mijoz "to'ladim" deb rasm tashlaydi. Shu paytgacha bunday xabar
-- darhol operatorga chiqarilardi (`needs_human`) va agent butunlay jim
-- qolardi — hech qanday tekshiruv qilinmasdi.
--
-- Endi tizim CRM'dan to'lovni o'zi qidiradi. Kutish vaqti to'lov kanaliga
-- bog'liq: Xonsaroy Pay (`xonpay`) darhol ko'rinadi, bank o'tkazmasi
-- (`transfer`, `kapitalbank`) bir kungacha kechikadi. Qaysi yo'l bilan
-- to'laganini OLDINDAN bilmaymiz, shuning uchun eng uzuniga qarab
-- kutamiz va davriy qayta tekshiramiz.
--
-- `baseline_paid` — tekshiruv boshlangandagi to'lovlar yig'indisi.
-- Yangi to'lov = hozirgi yig'indi − shu qiymat. Sana bo'yicha emas, DELTA
-- bo'yicha taqqoslanadi: bank o'tkazmasi CRM'ga kechroq tushsa ham
-- `date_paid` mijoz to'lagan kunga (ya'ni ORQAGA) qo'yiladi va sana
-- bo'yicha qidiruv uni o'tkazib yuborardi.
CREATE TABLE IF NOT EXISTS payment_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Mijozning bir nechta shartnomasi bo'lishi mumkin; qaysi biriga
  -- to'laganini bilmasak NULL qoladi va hammasi bo'yicha sanaladi.
  contract_id     UUID REFERENCES contracts(id) ON DELETE SET NULL,
  -- Qaysi xabar (kvitansiya) tekshiruvni boshlagani — operator uni chatda
  -- ko'rishi uchun.
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'watching'
                  CHECK (status IN ('watching', 'confirmed', 'not_found', 'cancelled')),
  -- Delta shu oynadagi yig'indi bo'yicha o'lchanadi.
  since_date      DATE NOT NULL,
  baseline_paid   NUMERIC(20,2) NOT NULL DEFAULT 0,
  found_amount    NUMERIC(20,2),
  -- Qaysi kanal orqali kelgani: xonpay / transfer / kapitalbank.
  found_type      TEXT,
  watch_until     TIMESTAMPTZ NOT NULL,
  checked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kuzatuvchi faqat ochiq tekshiruvlarni oladi.
CREATE INDEX IF NOT EXISTS payment_checks_watching_idx
  ON payment_checks (checked_at NULLS FIRST)
  WHERE status = 'watching';

-- Bitta suhbatda bir vaqtda bitta ochiq tekshiruv bo'ladi: mijoz ketma-ket
-- uchta rasm tashlasa, uchta parallel kuzatuv CRM'ni behuda qiynardi va
-- to'lov topilganda uchta rahmat yuborilishi mumkin edi.
CREATE UNIQUE INDEX IF NOT EXISTS payment_checks_one_open_idx
  ON payment_checks (conversation_id)
  WHERE status = 'watching';
