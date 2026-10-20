-- Begona raqamni mijozdan uzish.
--
-- MUAMMO: mijozga yozdik, javob bergan odam boshqa kishi bo'lib chiqdi —
-- raqam eski egasidan chiqib, yangi odamga berilgan. Agent bunday holatni
-- to'g'ri boshqaradi: tafsilot oshkor qilmaydi, uzr aytadi va eskalatsiya
-- qiladi. Uzr matnida esa begona odamga "boshqa yozilmaydi" deb VA'DA
-- beramiz.
--
-- Va'dani bajarish mumkin emas edi: raqam qo'lda o'chirilsa ham,
-- `ContractSyncService.mergePhones()` uni keyingi sinxronizatsiyada CRM'dan
-- qayta qo'shib, Telegram holatini `unknown` ga qaytarardi — ya'ni raqam
-- yana qidiruv navbatiga tushib, begona odamga yana xabar ketardi. Telefon
-- importi ham xuddi shunday ishlaydi.
--
-- Shuning uchun uzilishga DOIMIY belgi kerak: bu jadval borligicha
-- sinxronizatsiya ham, import ham raqamni shu mijozga qayta bog'lay olmaydi.
--
-- NEGA ALOHIDA JADVAL, `clients` ga ustun emas:
--   • kim, qachon va nima uchun uzgani kerak — ish begona odamning
--     TEKSHIRILMAGAN da'vosi asosida qilinadi, keyin "nega o'chirgansiz?"
--     degan savol chiqishi tabiiy;
--   • bitta mijozda bir nechta noto'g'ri raqam bo'lishi mumkin;
--   • CRM jamoasiga beriladigan hisobot aynan shu jadvaldan chiqadi.
--
-- QAMROV — faqat shu mijoz. Biz aniq bitta faktni bilamiz: raqam SHU
-- mijozniki emas. Uning butunlay begona ekani esa taxmin, va butun bazada
-- to'sish raqam haqiqatan boshqa mijozniki bo'lgan holatni noo'rin yopardi.
CREATE TABLE IF NOT EXISTS client_phone_blocks (
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  -- Operator izohi. Ixtiyoriy: shoshilinch holatda sababsiz ham bosiladi,
  -- lekin so'raladi.
  reason      TEXT,
  -- Xodim o'chirilsa ham iz qolishi kerak — CASCADE emas, SET NULL.
  blocked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Bir xil raqamni ikki marta to'sish xato emas: operator tugmani ikki
  -- marta bosishi mumkin. Kalit shuni ziddiyatsiz qiladi (`ON CONFLICT`).
  PRIMARY KEY (client_id, phone)
);

-- Sinxronizatsiya va import har mijoz uchun to'siqlar ro'yxatini so'raydi.
-- Birlamchi kalitning birinchi ustuni `client_id` bo'lgani uchun bu so'rov
-- allaqachon indeksli — qo'shimcha indeks kerak emas.

-- CRM uchun hisobot: "qaysi raqamlar noto'g'ri chiqdi" — sana bo'yicha.
CREATE INDEX IF NOT EXISTS idx_client_phone_blocks_at ON client_phone_blocks (blocked_at DESC);
