-- Takrorlangan agent qoidalarini tozalash.
--
-- MUAMMO: 056-migratsiya "Investorlar bilan ishlash" bo'limlarini qo'shdi,
-- keyin xizmat ishga tushganda `seedDefaultRules` o'sha qoidalarni IKKINCHI
-- marta qo'shdi. Sabab: seed "bu bo'lim urug'langanmi" degan ro'yxatga
-- tayanardi, migratsiya orqali kelgan bo'lim esa u ro'yxatda yo'q edi.
--
-- Natijada agent promptida 15 ta ko'rsatma ikki marta turardi (prodda
-- 2026-08-11 da aniqlandi). Xavfli emas, lekin prompt shishadi va bir xil
-- gap ikki marta o'qiladi.
--
-- Sababning o'zi kodda tuzatildi: seed endi bo'sh BO'LMAGAN bo'limga
-- hech qachon qoida qo'shmaydi. Bu migratsiya esa allaqachon paydo
-- bo'lgan nusxalarni olib tashlaydi.
--
-- QAYSI NUSXA QOLADI: avval xodim tahrirlagani (`updated_by IS NOT NULL`) —
-- uning ishini yo'qotib bo'lmaydi; keyin eng eskisi. Shu tartib tufayli
-- takroriy ishga tushirishda ham natija bir xil bo'ladi.
--
-- Faqat `body` li (oddiy) qoidalar ko'riladi: misol turidagi bo'limlarda
-- `body` NULL va ular bu xatoga uchramagan.
WITH tartiblangan AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY section_id, body
           ORDER BY (updated_by IS NULL), created_at, id
         ) AS n
    FROM agent_rules
   WHERE deleted_at IS NULL AND body IS NOT NULL
)
DELETE FROM agent_rules
 WHERE id IN (SELECT id FROM tartiblangan WHERE n > 1);
