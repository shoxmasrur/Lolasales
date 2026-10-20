-- Mijoz yuborgan rasmning turi.
--
-- MUAMMO: hozir har qanday rasm "to'lov cheki" deb hisoblanadi —
-- `REVIEW_KINDS` ga photo/document/video kiradi va ularning har biriga
-- to'lov tekshiruvi ochiladi. Mijoz shartnomasining rasmini yuborsa ham
-- agent "chek uchun rahmat" deb javob beradi va bekorga operator
-- chaqiriladi.
--
-- Ustunlar `transcript` / `transcript_status` juftligining nusxasi:
-- ovoz uchun STT nima qilsa, rasm uchun vision shuni qiladi.
--
-- `image_note` — vision qaytargan qisqa tavsif. U FAQAT operator uchun:
-- agent promptiga hech qachon tushmaydi. Sabab: agentda "tasdiqlanmagan
-- raqamni aytma" degan qat'iy taqiq bor, va vision noto'g'ri o'qigan
-- summa promptga tushsa, model uni mijozga takrorlab yuborardi.
--
-- `image_kind` va `image_status` da CHECK ATAYLAB yo'q, va bu
-- `transcript_status` dan farq qiladi: unda CHECK bor (003-migratsiya,
-- `none|pending|done|failed`). Farq bilib qilingan.
--
-- Sabab: qiymatni kod tekshiradi — `okKind` modeldan kelgan satrni
-- to'rtta turdan biriga majburlaydi, boshqasi `noaniq` bo'ladi. Agar
-- ustunga ham CHECK qo'ysak, kutilmagan qiymat INSERT ni yiqitardi va
-- xabar butunlay saqlanmay qolardi: mijozning xabarini yo'qotish
-- tasnifdagi mayda xatodan ancha qimmat. Qo'shimcha foyda — tur
-- ro'yxati o'zgarsa migratsiya yozish shart emas.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_kind   TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_note   TEXT;
