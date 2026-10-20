-- Agentning "miyasi" kodda emas, bazada bo'lsin:
--   1) qoidalar  — uslub, taqiqlar, taktikalar, shartnoma faktlari, misollar
--   2) saboqlar  — suhbatlardan o'rganilgan umumiy xulosalar
--   3) mijoz profili — har bir mijoz haqida agent eslab qolgan narsalar

-- ─── 1. Qoidalar ───────────────────────────────────────────────────────────
CREATE TABLE agent_rule_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  -- bullets — oddiy qoidalar ro'yxati; examples — yomon/yaxshi juftliklar
  kind        TEXT NOT NULL DEFAULT 'bullets' CHECK (kind IN ('bullets', 'examples')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID NOT NULL REFERENCES agent_rule_sections(id) ON DELETE CASCADE,
  -- bullets uchun
  body        TEXT,
  -- examples uchun
  situation   TEXT,
  bad_example TEXT,
  good_example TEXT,
  why         TEXT,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_rules_section ON agent_rules (section_id, sort_order);

CREATE TRIGGER trg_rule_sections_touch BEFORE UPDATE ON agent_rule_sections
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_agent_rules_touch BEFORE UPDATE ON agent_rules
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── 2. Suhbatlardan o'rganilgan saboqlar ─────────────────────────────────
CREATE TABLE agent_lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson        TEXT NOT NULL,
  -- Qaysi suhbatdan olingan (dalil sifatida)
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  evidence      TEXT,
  -- Agent taklif qiladi, operator tasdiqlaydi. Faqat tasdiqlangani promptga tushadi.
  status        TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed', 'approved', 'rejected')),
  -- Bir xil saboq necha marta uchragani — takrorlansa ishonch ortadi
  times_seen    INTEGER NOT NULL DEFAULT 1,
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lessons_status ON agent_lessons (status, times_seen DESC);

CREATE TRIGGER trg_lessons_touch BEFORE UPDATE ON agent_lessons
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── 3. Mijoz bo'yicha shaxsiy xotira ─────────────────────────────────────
CREATE TABLE client_profiles (
  client_id     UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  -- Playbook 8-bo'limidagi tasnif
  client_type   TEXT CHECK (client_type IN ('qochoq', 'tajovuzkor', 'qiynalayotgan', 'yaxshi_niyatli')),
  -- Agent to'plagan qisqa xulosa (har suhbatdan keyin yangilanadi)
  summary       TEXT,
  -- Qaysi taktika ishlagani / ishlamagani
  what_works    TEXT,
  best_contact_time TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
