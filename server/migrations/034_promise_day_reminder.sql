-- Va'da kunidagi yumshoq eslatma.
--
-- MUAMMO: mijoz "15-avgustda to'layman" degach, tizim o'sha kunga qadar
-- umuman jim turardi. Sana o'tgandan KEYIN esa va'da `broken` deb
-- belgilanib, suhbat operator ro'yxatiga tushardi. Ya'ni kelishuv
-- buzilishini kutib turardik, uni saqlab qolishga urinmasdan.
--
-- YECHIM: kelishilgan KUNNING ertalabida bir marta yumshoq eslatma
-- yuboriladi ("bugun kelishuvimiz kuni edi"). Bu bosim emas — mijoz hali
-- kechikmagan. Maqsad: unutgan bo'lsa eslatish, imkoni bo'lmasa esa buni
-- sana o'tishidan OLDIN bilib olish.
--
-- `reminded_at` — shu eslatma yuborilgani belgisi. Kuzatuvchi 15 daqiqada
-- bir marta ishlaydi, shuning uchun takror yubormaslik uchun belgi shart.

ALTER TABLE payment_promises ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

COMMENT ON COLUMN payment_promises.reminded_at IS
  'Va''da kunidagi eslatma yuborilgan vaqt. NULL — hali eslatilmagan. '
  'Har bir va''da uchun eslatma FAQAT BIR MARTA yuboriladi.';

-- Kuzatuvchining har tsiklidagi so'rovi: bugungi sanadagi, hali
-- eslatilmagan va'dalar. Ular kam bo'ladi — qisman indeks yetarli.
CREATE INDEX IF NOT EXISTS idx_promises_due_reminder
  ON payment_promises (promised_date)
  WHERE status = 'pending' AND reminded_at IS NULL;

-- ─── Agent qoidasi ─────────────────────────────────────────────────────────
--
-- Eski qoida agentga "kelishilgan sana kelmaguncha to'lov haqida umuman
-- gapirma" derdi. Endi kunning o'zida eslatma yuboriladi, shuning uchun
-- qoida aniqlashtiriladi: eslatma — tizim beradigan ALOHIDA vazifa,
-- agent o'z tashabbusi bilan bu mavzuni ochmaydi.

UPDATE agent_rules
   SET body = 'Kelishilgan sana KELMAGUNCHA to''lov haqida o''zing gap ochma. '
              'Istisno — kelishilgan KUNNING o''zi: o''shanda tizim senga alohida '
              'eslatma vazifasini beradi. O''z tashabbusing bilan eslatma va '
              'takrorlama. Sana o''tib ketgan bo''lsagina qayta murojaat qil.'
 WHERE body = 'Kelishilgan sana kelmagan bo''lsa, to''lov haqida o''zing eslatma. '
              'Sana o''tib ketgan bo''lsagina qayta murojaat qil.';
