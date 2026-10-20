-- Agent kelishuvdan keyingi xabarlarda ham o'sha va'dani qayta qaytaradi
-- (suhbat tarixida u ko'rinib turadi). Natijada bitta kelishuv uchun
-- bir nechta yozuv paydo bo'lardi va statistika ikki hisoblardi.
--
-- Asosiy himoya application qatlamida (AgentRunner), bu — zaxira kafolat.

-- Avval mavjud dublikatlarni yig'ishtiramiz: har bir (suhbat, sana, summa)
-- uchun eng eskisini qoldiramiz.
UPDATE payment_promises p
   SET status = 'cancelled', resolved_at = now()
 WHERE p.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM payment_promises q
      WHERE q.status = 'pending'
        AND q.conversation_id = p.conversation_id
        AND q.promised_date = p.promised_date
        AND q.amount = p.amount
        AND q.created_at < p.created_at
   );

CREATE UNIQUE INDEX idx_promises_one_pending
  ON payment_promises (conversation_id, promised_date, amount)
  WHERE status = 'pending';
