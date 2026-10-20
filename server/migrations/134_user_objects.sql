-- Obyekt cheklovi (2026-10-20).
--
-- Foydalanuvchiga obyekt nomlari biriktiriladi. Ro'yxat bo'sh bo'lmasa va
-- roli admin bo'lmasa — u faqat shu obyektlardagi shartnomali mijozlarni
-- ko'radi. Bo'sh ro'yxat = cheklovsiz (mavjud foydalanuvchilar o'zgarmaydi).
--
-- Nomlar `contracts.object_name` bilan `trim()` qilib solishtiriladi;
-- `lower()` ishlatilmaydi (C collation). Qayta qo'llansa xato bermaydi.
ALTER TABLE users ADD COLUMN IF NOT EXISTS objects TEXT[] NOT NULL DEFAULT '{}';
