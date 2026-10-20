-- Mashina (boshqa AI agentlar) uchun avtorizatsiya.
--
-- JWT 12 soatda tugaydi va login/parol talab qiladi — bu agentlar uchun
-- yaramaydi. Shuning uchun uzoq muddatli API kalitlar. Har bir kalit
-- foydalanuvchiga (demak rolga) bog'lanadi, ya'ni mavjud RBAC to'liq ishlaydi.

CREATE TABLE api_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  -- Kalitning O'ZI saqlanmaydi — faqat SHA-256 xeshi.
  token_hash    TEXT NOT NULL UNIQUE,
  -- Ro'yxatda tanib olish uchun boshlanishi (dbt_ab12…)
  token_prefix  TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_user ON api_tokens (user_id);
CREATE INDEX idx_api_tokens_active ON api_tokens (token_hash) WHERE revoked_at IS NULL;

-- Saboq TAKLIF qilish (tasdiqlash emas) — MCP orqali kirgan agentlar uchun.
UPDATE roles
   SET permissions = permissions || ARRAY['agent.propose']
 WHERE key IN ('admin', 'operator')
   AND NOT ('agent.propose' = ANY(permissions));

-- MCP uchun tayyor rol: o'qiydi va xavfsiz yozadi, LEKIN mijozga xabar
-- yubora olmaydi, kampaniya ishga tushira olmaydi, sozlamalarga tegmaydi.
INSERT INTO roles (key, name, description, is_system, permissions)
VALUES ('mcp_agent', 'MCP agent',
        'Boshqa AI agentlar uchun: o''qish va xavfsiz amallar. Mijozga xabar yubora olmaydi.',
        TRUE,
        ARRAY[
          'dashboard.view',
          'conversations.view','conversations.manage',
          'clients.view','clients.edit',
          'campaigns.view',
          'import.view',
          'telegram.view',
          'settings.view',
          'agent.view','agent.propose'
        ])
ON CONFLICT (key) DO NOTHING;
