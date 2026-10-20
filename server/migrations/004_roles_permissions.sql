-- Qat'iy 3 ta rol o'rniga — ixtiyoriy rollar va ruxsatlar to'plami.
-- Har bir rolga qaysi sahifa va qaysi amal ruxsat etilishi belgilanadi.

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  -- Tizim rollari o'chirilmaydi; `admin` roli ruxsatlari ham kamaytirilmaydi,
  -- aks holda tizimga umuman kirib bo'lmay qolishi mumkin.
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_roles_touch BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO roles (key, name, description, is_system, permissions) VALUES
  ('admin', 'Administrator', 'Barcha imkoniyatlar', TRUE, ARRAY[
    'dashboard.view',
    'conversations.view','conversations.send','conversations.manage','conversations.agent_toggle',
    'clients.view','clients.edit','clients.telegram_lookup','clients.start_conversation',
    'campaigns.view','campaigns.create','campaigns.control',
    'import.view','import.run',
    'telegram.view','telegram.manage',
    'settings.view','settings.edit','settings.kill_switch',
    'users.view','users.manage','roles.manage','audit.view'
  ]),
  ('operator', 'Operator', 'Mijozlar bilan ishlaydi, sozlamalarga tegmaydi', TRUE, ARRAY[
    'dashboard.view',
    'conversations.view','conversations.send','conversations.manage','conversations.agent_toggle',
    'clients.view','clients.edit','clients.telegram_lookup','clients.start_conversation',
    'campaigns.view','campaigns.create','campaigns.control',
    'import.view','import.run',
    'telegram.view',
    'settings.view'
  ]),
  ('viewer', 'Kuzatuvchi', 'Faqat o''qish', TRUE, ARRAY[
    'dashboard.view',
    'conversations.view',
    'clients.view',
    'campaigns.view',
    'import.view',
    'telegram.view',
    'settings.view'
  ]);

ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

-- Mavjud foydalanuvchilarni eski matnli rol bo'yicha bog'laymiz.
UPDATE users u SET role_id = r.id FROM roles r WHERE r.key = u.role;
UPDATE users SET role_id = (SELECT id FROM roles WHERE key = 'viewer') WHERE role_id IS NULL;

ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

-- Eski ustun endi kerak emas: huquq faqat roldan kelib chiqadi.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP COLUMN role;

CREATE INDEX idx_users_role ON users (role_id);
