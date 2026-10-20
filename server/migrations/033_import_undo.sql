-- Importni orqaga qaytarish.
--
-- MUAMMO: import qaysi qatorlarni YARATGANI hech qayerda yozilmagan edi.
-- `import_batches` da faqat sonlar bor ("1552 ta mijoz yaratildi"), lekin
-- aynan qaysi mijozlar ekani noma'lum. Noto'g'ri fayl yuklansa, uni
-- qo'lda tozalashdan boshqa yo'l yo'q edi.
--
-- YECHIM: har bir qatorda uni YARATGAN import belgilanadi. Yangilagan
-- import emas — aynan yaratgan: qaytarish faqat yaratilgan qatorlarni
-- olib tashlashi kerak, ilgari mavjud bo'lgan mijozni emas.
--
-- O'chirish yumshoq (032-migratsiya), shuning uchun "qaytarish" ham
-- qaytariladi: yozuvlar bazada qoladi.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS created_import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS created_import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL;

COMMENT ON COLUMN clients.created_import_batch_id IS
  'Shu mijozni YARATGAN import. Keyingi importlar mijozni yangilashi mumkin, '
  'lekin bu ustun o''zgarmaydi — qaytarish faqat yaratilganini olib tashlaydi.';

CREATE INDEX IF NOT EXISTS idx_clients_created_batch
  ON clients (created_import_batch_id) WHERE created_import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_created_batch
  ON contracts (created_import_batch_id) WHERE created_import_batch_id IS NOT NULL;

-- Import qaytarilgani belgisi.
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS undone_by TEXT;

-- ─── Eski importlarni bog'lash (backfill) ──────────────────────────────────
--
-- Eski yozuvlarda bog'lanish yo'q, lekin uni VAQT bo'yicha tiklash mumkin:
-- import qatorlarni o'zidan oldin yozadi va `import_batches` yozuvi eng
-- oxirida qo'shiladi. Ya'ni importga tegishli qatorlar oldingi import
-- yozuvidan keyin va shu import yozuvigacha bo'lgan oraliqda yaratilgan.
--
-- Mijozlar faqat import orqali yaratiladi (dashboardda "mijoz qo'shish"
-- tugmasi yo'q), shuning uchun oraliq toza chiqadi. Produksiyada bu
-- 2026-08-05 dagi import uchun 1552 mijoz va 1757 shartnoma beradi —
-- `import_batches` dagi sonlar bilan aynan bir xil.
--
-- DIQQAT: bu hisob faqat SHU MIGRATSIYAGACHA yaratilgan qatorlar uchun
-- to'g'ri. Migratsiyadan keyin import yozuvi qatorlardan OLDIN yaratiladi
-- (`ImportDebtorFileUseCase.start`), ya'ni vaqt tartibi teskari bo'ladi va
-- bu so'rov qatorlarni KEYINGI importga bog'lab yuboradi. Shuning uchun
-- uni qayta ishlatish MUMKIN EMAS: migratsiya bir marta bajariladi va
-- `created_import_batch_id IS NULL` sharti keyingi importlarga tegmaydi.

WITH oraliq AS (
  SELECT id,
         created_at AS gacha,
         LAG(created_at) OVER (ORDER BY created_at) AS dan
    FROM import_batches
   WHERE kind = 'debtors'
)
UPDATE clients c
   SET created_import_batch_id = o.id
  FROM oraliq o
 WHERE c.created_import_batch_id IS NULL
   AND c.created_at <= o.gacha
   AND (o.dan IS NULL OR c.created_at > o.dan);

WITH oraliq AS (
  SELECT id,
         created_at AS gacha,
         LAG(created_at) OVER (ORDER BY created_at) AS dan
    FROM import_batches
   WHERE kind = 'debtors'
)
UPDATE contracts ct
   SET created_import_batch_id = o.id
  FROM oraliq o
 WHERE ct.created_import_batch_id IS NULL
   AND ct.created_at <= o.gacha
   AND (o.dan IS NULL OR ct.created_at > o.dan);

-- ─── Ruxsat ────────────────────────────────────────────────────────────────
--
-- `import.run` dan ajratildi: fayl yuklash — kundalik ish, importni
-- qaytarish esa bir zarbada minglab mijozni ro'yxatdan chiqaradi.

UPDATE roles
   SET permissions = array_append(permissions, 'import.undo')
 WHERE key = 'admin'
   AND NOT ('import.undo' = ANY (permissions));
