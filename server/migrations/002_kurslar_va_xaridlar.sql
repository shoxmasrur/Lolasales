-- Kurslar, kurs bilimlari va mijoz xaridlari.

CREATE TABLE courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    sales_start date NOT NULL,
    sales_end date NOT NULL,
    price numeric(14,0) NOT NULL,
    duration text,
    topics text[] NOT NULL DEFAULT '{}',
    starts_on date,
    group_link text,
    is_active boolean NOT NULL DEFAULT true,
    installment_allowed boolean NOT NULL DEFAULT false,
    installment_parts int,
    installment_first_min numeric(14,0),
    link_after text NOT NULL DEFAULT 'birinchi_qism',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT courses_sales_range_check CHECK (sales_end >= sales_start),
    CONSTRAINT courses_price_check CHECK (price > 0),
    CONSTRAINT courses_link_after_check CHECK (link_after IN ('birinchi_qism', 'toliq'))
);

CREATE TRIGGER trg_courses_touch BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE course_knowledge (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    sort_order int NOT NULL DEFAULT 0,
    is_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT course_knowledge_kind_check CHECK (kind IN ('dastur', 'savol_javob', 'etiroz', 'boshqa'))
);

CREATE INDEX idx_course_knowledge_course ON course_knowledge (course_id, sort_order);

CREATE TRIGGER trg_course_knowledge_touch BEFORE UPDATE ON course_knowledge
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE clients
    ADD COLUMN source text NOT NULL DEFAULT 'qolda',
    ADD COLUMN source_group text,
    ADD COLUMN source_comment text,
    ADD CONSTRAINT clients_source_check CHECK (source IN ('reklama', 'guruh', 'raqam', 'qolda'));

CREATE TABLE purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES clients(id),
    course_id uuid REFERENCES courses(id),
    stage text NOT NULL DEFAULT 'yangi',
    stage_changed_at timestamptz NOT NULL DEFAULT now(),
    total_amount numeric(14,0),
    paid_amount numeric(14,0) NOT NULL DEFAULT 0,
    installment boolean NOT NULL DEFAULT false,
    link_sent_at timestamptz,
    reminded_stages text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchases_stage_check CHECK (stage IN (
        'yangi', 'suhbatda', 'qiziqdi', 'karta_yuborildi', 'chek_keldi', 'qisman_toladi', 'toladi', 'rad_etdi'))
);

-- Bitta mijozda bitta faol xarid.
CREATE UNIQUE INDEX purchases_one_active_idx ON purchases (client_id)
    WHERE stage NOT IN ('toladi', 'rad_etdi');
CREATE INDEX idx_purchases_client ON purchases (client_id, created_at DESC);
CREATE INDEX idx_purchases_course ON purchases (course_id);

CREATE TRIGGER trg_purchases_touch BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

UPDATE roles SET permissions = array_append(permissions, 'courses.view')
 WHERE key IN ('admin', 'operator') AND NOT ('courses.view' = ANY(permissions));
UPDATE roles SET permissions = array_append(permissions, 'courses.edit')
 WHERE key IN ('admin', 'operator') AND NOT ('courses.edit' = ANY(permissions));
