-- Operator topshirig'i (2026-09-15).
--
-- Operator suhbatni qo'lda boshlaydi: NIMA haqida gaplashishni yozadi,
-- xabarni agent o'zi tuzib yuboradi va suhbatni davom ettiradi. Real holat:
-- mijoz va'da kuni to'lamadi va jim qoldi, operator salomni qo'lda yozdi,
-- agent esa davom ettira olmadi.
--
-- 1) `messages.direction` ga `note` qo'shiladi — mijozga KETMAYDIGAN
--    ichki qayd (operatorning topshirig'i). NEGA `out` EMAS: sukut,
--    hisobot, "javobsiz xabar" va o'qilganlik hisoblari `direction = 'out'`
--    bo'yicha sanaydi; `out` bo'lsa qayd yuborilgan xabar deb sanalardi.
--
-- 2) `agent_usage.mode` ga `operator` qo'shiladi — aks holda topshiriq
--    bo'yicha birinchi chaqiruvning narx yozuvi constraint xatosi bilan
--    yiqiladi (071 dagi izohga qarang).
--
-- Constraint nomlari prodda tekshirilgan (2026-09-15):
-- `messages_direction_check`, `agent_usage_mode_check`.
-- Qayta ishga tushirilsa natija o'zgarmaydi.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages ADD CONSTRAINT messages_direction_check
  CHECK (direction IN ('in', 'out', 'note'));

ALTER TABLE agent_usage DROP CONSTRAINT IF EXISTS agent_usage_mode_check;
ALTER TABLE agent_usage ADD CONSTRAINT agent_usage_mode_check
  CHECK (mode IN ('first', 'reply', 'reminder', 'thanks', 'nudge', 'operator'));
