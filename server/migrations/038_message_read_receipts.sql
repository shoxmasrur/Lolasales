-- Mijoz xabarni Telegramda qachon o'qigani.
--
-- MUAMMO: chatda xabar "yuborildi" bo'lib turardi va operator mijoz uni
-- ko'rdimi yoki yo'qmi bilmasdi. Bu undiruvda muhim farq: o'qib javob
-- bermayotgan mijoz bilan xabarni umuman ko'rmagan mijozga yondashuv
-- boshqacha bo'ladi — birinchisi e'tiborsiz qoldiryapti, ikkinchisiga
-- esa boshqa kanal (qo'ng'iroq, boshqa raqam) kerak.
--
-- `messages.status` da 'read' qiymati boshidan bor edi, lekin uni hech
-- kim qo'ymasdi: Telegramdan keladigan `UpdateReadHistoryOutbox`
-- yangilanishi tinglanmasdi. Endi tinglanadi va aniq VAQT ham saqlanadi.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

COMMENT ON COLUMN messages.read_at IS
  'Mijoz xabarni Telegramda o''qigan vaqt (UpdateReadHistoryOutbox). '
  'Faqat chiquvchi xabarlarda to''ladi.';

-- Telegram "shu id gacha hammasi o'qildi" deb xabar beradi, shuning
-- uchun belgilash `telegram_msg_id <= max` bo'yicha ketadi.
CREATE INDEX IF NOT EXISTS idx_messages_unread_out
  ON messages (conversation_id, telegram_msg_id)
  WHERE direction = 'out' AND read_at IS NULL AND telegram_msg_id IS NOT NULL;
