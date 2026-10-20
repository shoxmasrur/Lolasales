-- Xonadonni bitish muddati (CRM "Детали договора").
--
-- MUAMMO: mijoz "uyim qachon bitadi?" desa agentda manba yo'q edi va u
-- menejerga yo'naltirardi. Sana esa `order/show` javobida bor edi —
-- biz uni o'qimayotgan edik.
--
-- QIYMAT QAYERDAN: xonadon → blok → bino → obyekt zanjiridan birinchi
-- to'lgani (`contractMapper.bitishSanasi`).
--
-- FAQAT SINXRONIZATSIYA YOZADI. Excel eksportida bunday ustun yo'q va
-- import upsert'i unga tegmaydi (`ContractUpsert` dan chiqarilgan) —
-- aks holda har importda jonli sana NULL bilan o'chardi. Mavjud
-- shartnomalarda ustun keyingi sinxronizatsiyagacha NULL turadi; bu
-- vaqtda agent muddatni aytmaydi va savolni eskalatsiya qiladi.
--
-- DATE, TIMESTAMPTZ emas: bu kun, vaqt emas. `pool.ts` DATE ni satr
-- (YYYY-MM-DD) qilib qaytaradi va kod ham shu shaklda ishlaydi.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS completion_date DATE;

COMMENT ON COLUMN contracts.completion_date IS
  'Xonadonni bitish muddati — CRM order/show: apartment.completion_date, '
  'bo''lmasa block, building, object.build_date. Faqat sinxronizatsiya yozadi.';
