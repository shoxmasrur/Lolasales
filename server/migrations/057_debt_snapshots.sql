-- Kunlik qarz suratlari.
--
-- MUAMMO: `contracts.debt_total` faqat HOZIRGI holat — CRM sinxronizatsiyasi
-- uni har safar ustiga yozadi. Shu sababli "1-iyulda qarz qancha edi" degan
-- savolga javob beradigan ma'lumot yo'q va panelda davr bo'yicha qarz
-- dinamikasini ko'rsatib bo'lmaydi.
--
-- Bu jadval bugundan boshlab tarix to'playdi. O'tmishni TIKLAMAYDI —
-- qayerdan olishning iloji yo'q.
--
-- Kaliti — kun. Kun davomida qator qayta yoziladi (eng so'nggi holat),
-- kun o'tgach esa muzlab qoladi. Shu sabab `ON CONFLICT (day) DO UPDATE`
-- ishlatiladi va alohida "kun yakunlandi" belgisi kerak emas.
--
-- Raqamlar bosh sahifadagi jami qarz bilan BIR XIL asosda hisoblanadi
-- (barcha tirik shartnomalar, holat bo'yicha filtrlanmagan) — aks holda
-- karta va grafik bir-biriga to'g'ri kelmasdi.
CREATE TABLE IF NOT EXISTS debt_snapshots (
  day                 DATE PRIMARY KEY,
  debt_total          NUMERIC(20,2) NOT NULL DEFAULT 0,
  debt_monthly        NUMERIC(20,2) NOT NULL DEFAULT 0,
  debt_first          NUMERIC(20,2) NOT NULL DEFAULT 0,
  clients_with_debt   INTEGER NOT NULL DEFAULT 0,
  contracts_with_debt INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
