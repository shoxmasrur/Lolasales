-- Saboqlar — agentning UMUMIY bilimi, u ma'lum bir mijozga bog'liq emas.
--
-- Muammo: `agent_lessons.conversation_id` da tashqi kalit bor edi va
-- `TRUNCATE conversations ... CASCADE` saboqlarni ham o'chirib yuborardi
-- (TRUNCATE `ON DELETE SET NULL` ni hurmat qilmaydi).
-- Ya'ni mijozlarni tozalash agentning butun tajribasini yo'q qilardi.
--
-- Yechim: bog'lanishni olib tashlaymiz. Ustun qoladi — u faqat "qaysi
-- suhbatdan olingan" degan izoh, majburiy bog'lanish emas.

ALTER TABLE agent_lessons
  DROP CONSTRAINT IF EXISTS agent_lessons_conversation_id_fkey;

COMMENT ON COLUMN agent_lessons.conversation_id IS
  'Saboq qaysi suhbatdan olingani (izoh uchun). Tashqi kalit ataylab yo''q: '
  'mijozlar tozalanganda saboqlar saqlanib qolishi kerak.';
