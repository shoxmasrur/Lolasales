-- Agent uslubini versiyalash (2026-09-28).
--
-- Uslub bo'limlari ikki versiyada saqlanadi: v1 — hozirgi, v2 — jamoaning
-- real yozishmalaridan olingan qisqa uslub. NULL versiya — bo'lim ikkala
-- uslubga ham tushadi (faktlar, taqiqlar, til sifati).
--
-- Bu migratsiya hech narsani o'zgartirmaydi: barcha bo'limlar NULL,
-- barcha akkauntlar v1 da qoladi.

ALTER TABLE agent_rule_sections
  ADD COLUMN IF NOT EXISTS style_version TEXT;

ALTER TABLE agent_rule_sections
  DROP CONSTRAINT IF EXISTS agent_rule_sections_style_version_check;
ALTER TABLE agent_rule_sections
  ADD CONSTRAINT agent_rule_sections_style_version_check
  CHECK (style_version IS NULL OR style_version IN ('v1','v2'));

ALTER TABLE telegram_accounts
  ADD COLUMN IF NOT EXISTS style_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE telegram_accounts
  DROP CONSTRAINT IF EXISTS telegram_accounts_style_version_check;
ALTER TABLE telegram_accounts
  ADD CONSTRAINT telegram_accounts_style_version_check
  CHECK (style_version IN ('v1','v2'));

COMMENT ON COLUMN agent_rule_sections.style_version IS
  'Bo''lim qaysi uslub versiyasiga tegishli. NULL — ikkalasiga ham.';
COMMENT ON COLUMN telegram_accounts.style_version IS
  'Akkaunt qaysi uslubda yozadi. Panelda almashtiriladi, 10 soniyada kuchga kiradi.';
