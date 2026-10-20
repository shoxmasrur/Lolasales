-- Sukutdan keyin qayta murojaat.
--
-- MUAMMO: mijoz javob bermay qo'yganda hech kim yozmasdi. Agent to'rt
-- sababdan xabar yuborardi — birinchi aloqa, mijozning javobi, va'da
-- kunidagi eslatma, to'lov uchun rahmat. "Javob bermadi" holati
-- ro'yxatda yo'q edi, shuning uchun suhbat o'sha yerda muzlab qolardi.
--
-- `nudge_count` — SHU sukut zanjirida nechta qayta murojaat ketgani.
-- Mijoz javob berishi bilan `touchInbound` uni nolga qaytaradi, ya'ni
-- chegara "ketma-ket 2 marta javobsiz" degani. Suhbat umri davomida
-- jami emas: oylab davom etadigan suhbat aks holda bir marta ikki xabar
-- sarflab, umrbod qayta murojaat qila olmaydigan bo'lib qolardi.
--
-- ALOHIDA `last_nudge_at` USTUNI KERAK EMAS: qayta murojaat ham
-- chiquvchi xabar, ya'ni `last_outbound_at` yangilanadi va keyingi
-- urinishning soati o'z-o'zidan bir kunga suriladi.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS nudge_count INTEGER NOT NULL DEFAULT 0;

-- Nomzodlarni tanlash so'rovi `last_outbound_at` va `nudge_count` ustunga tayanadi.
-- Predikati `< 3` (emas 2), chunki `silenceNudgeMax` sozlamasi 1 dan 3 gacha ruxsat etiladi.
-- Operator sozlamani 3 ga o'zgartirsa, so'rov `nudge_count < 3` filtrini qo'llaydi, shu sababli
-- `< 2` indeks endi yordam bermay turardi. `< 3` barcha ruxsat etilgan qiymatlarni qamraydi.
CREATE INDEX IF NOT EXISTS idx_conversations_sukut
    ON conversations (last_outbound_at)
 WHERE nudge_count < 3;

-- Agent chaqiruvining narxi rejim bo'yicha yoziladi; yangi rejim
-- CHECK ro'yxatiga qo'shilmasa, birinchi qayta murojaat yozuvi
-- constraint xatosi bilan yiqiladi.
ALTER TABLE agent_usage DROP CONSTRAINT IF EXISTS agent_usage_mode_check;

ALTER TABLE agent_usage ADD CONSTRAINT agent_usage_mode_check
  CHECK (mode IN ('first', 'reply', 'reminder', 'thanks', 'nudge'));
