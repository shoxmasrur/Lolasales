-- To'lov hodisasining BARQAROR kaliti.
--
-- MUAMMO (19-avgust, produksiya): Saydullayev Xayitboy aka bitta
-- 5 091 000 so'mlik to'lov uchun ikki marta rahmat oldi, qoldig'i
-- "yopilgan" bo'lib ko'rindi va ertasi kuni to'lamoqchi bo'lganida agent
-- uni to'xtatdi. O'sha pul bazada ikkita qator bo'lib yotgan edi.
--
-- SABAB: qatorlar `external_id` bo'yicha farqlanardi, u esa CRM'dagi
-- TASHQI HAVOLA va vaqt o'tib almashadi:
--
--   17-avgust  external_id = 8569a71b-…          (xonpay tranzaksiyasi)
--   18-avgust  external_id = 6472625597_34430_…  (bank ko'chirmasi)
--
-- Kalit o'zgargani uchun `ON CONFLICT` ishlamay, o'sha pul ikkinchi
-- marta qo'shilgan. Butun bazada 44 ta shartnomada shunday juftlik bor.
--
-- YECHIM: yozuvning o'z `uuid` si kalit bo'ladi — u o'zgarmaydi.
--
-- `created_at` — "biz bu to'lovni qachon bildik" degani va `PromiseWatcher`
-- unga tayanadi (`vadaTolovi.ts`). Shuning uchun qatorlar o'chirilib
-- qayta yozilmaydi: `source_uuid` mavjud qatorlarga JOYIDA to'ldiriladi
-- (`upsertHistory` dagi backfill), va tarix saqlanib qoladi.

ALTER TABLE contract_payment_events
  ADD COLUMN IF NOT EXISTS source_uuid TEXT;

-- Kalit shu ustunga ko'chadi. `source_uuid` to'lmaguncha (birinchi
-- sinxrongacha) qatorlar eski `external_id` kaliti bilan yashaydi,
-- shuning uchun indeks qisman.
CREATE UNIQUE INDEX IF NOT EXISTS contract_payment_events_uuid_idx
  ON contract_payment_events (contract_id, source_uuid)
  WHERE source_uuid IS NOT NULL;
