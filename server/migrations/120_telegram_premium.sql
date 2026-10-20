-- Telegram Premium belgisi va tugash eslatmasi (2026-10-09).
--
-- Akkauntlarga Premium sotib olinadi; obuna tugashini hech kim kuzatmasa
-- u jimgina uzilib qoladi. Tugash sanasi QO'LDA kiritiladi — Telegram
-- uni API orqali bermaydi.
--
-- premium_until      — obuna tugash sanasi. NULL — Premium yo'q.
-- premium_eslatildi  — SHU sana uchun oxirgi yuborilgan eslatma bosqichi
--                      (30 / 7 / 1 / 0 kun). Sana o'zgarganda NULL ga
--                      qaytadi — eslatmalar yangi sanadan qayta boshlanadi.
ALTER TABLE telegram_accounts ADD COLUMN premium_until DATE;
ALTER TABLE telegram_accounts ADD COLUMN premium_eslatildi SMALLINT;
