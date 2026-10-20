-- LolaSales — boshlang'ich sxema (DebitorAgent02 ning 134 ta migratsiyasi yig'ilgan).
-- Barcha pul maydonlari so'mda, NUMERIC(20,2).
-- schema_migrations jadvalini migrator o'zi yaratadi. agent_rules / agent_rule_sections
-- va settings bu yerda yo'q: bo'limlar ishga tushishda syncRuleSections bilan yaratiladi.

--
-- PostgreSQL database dump
--


-- Dumped from database version 14.23 (Homebrew)
-- Dumped by pg_dump version 14.23 (Homebrew)


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: agent_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson text NOT NULL,
    conversation_id uuid,
    evidence text,
    status text DEFAULT 'proposed'::text NOT NULL,
    times_seen integer DEFAULT 1 NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT agent_lessons_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN agent_lessons.conversation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_lessons.conversation_id IS 'Saboq qaysi suhbatdan olingani (izoh uchun). Tashqi kalit ataylab yo''q: mijozlar tozalanganda saboqlar saqlanib qolishi kerak.';


--
-- Name: agent_rule_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_rule_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    title text NOT NULL,
    description text,
    kind text DEFAULT 'bullets'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    style_version text,
    CONSTRAINT agent_rule_sections_kind_check CHECK ((kind = ANY (ARRAY['bullets'::text, 'examples'::text]))),
    CONSTRAINT agent_rule_sections_style_version_check CHECK (((style_version IS NULL) OR (style_version = ANY (ARRAY['v1'::text, 'v2'::text]))))
);


--
-- Name: COLUMN agent_rule_sections.style_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_rule_sections.style_version IS 'Bo''lim qaysi uslub versiyasiga tegishli. NULL — ikkalasiga ham.';


--
-- Name: agent_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    body text,
    situation text,
    bad_example text,
    good_example text,
    why text,
    is_enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: agent_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_usage (
    id bigint NOT NULL,
    conversation_id uuid,
    mode text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    cache_write_tokens integer DEFAULT 0 NOT NULL,
    cost_usd numeric(12,6) DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_usage_mode_check CHECK ((mode = ANY (ARRAY['first'::text, 'reply'::text, 'reminder'::text, 'thanks'::text, 'nudge'::text, 'operator'::text, 'oylik_eslatma'::text])))
);


--
-- Name: agent_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_usage_id_seq OWNED BY public.agent_usage.id;


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    level text NOT NULL,
    scope text,
    msg text NOT NULL,
    shartnoma text,
    akkaunt text,
    mijoz text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    flag text
);


--
-- Name: app_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_log_id_seq OWNED BY public.app_log.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    entity text,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bulk_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_jobs (
    id uuid NOT NULL,
    kind text NOT NULL,
    status text NOT NULL,
    input jsonb NOT NULL,
    plan jsonb,
    snapshot jsonb NOT NULL,
    processed_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    clean_stop boolean DEFAULT false NOT NULL,
    crash_resumes integer DEFAULT 0 NOT NULL,
    resumed_count integer DEFAULT 0 NOT NULL,
    started_day date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bulk_jobs_kind_check CHECK ((kind = ANY (ARRAY['start'::text, 'recontact'::text, 'lookup'::text, 'contract_sync'::text]))),
    CONSTRAINT bulk_jobs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'stopped'::text, 'failed'::text])))
);


--
-- Name: campaign_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    client_id uuid NOT NULL,
    contract_id uuid,
    conversation_id uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    skip_reason text,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT campaign_targets_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'resolving'::text, 'ready'::text, 'sending'::text, 'sent'::text, 'skipped'::text, 'failed'::text])))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    daily_limit integer DEFAULT 40 NOT NULL,
    window_start time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    window_end time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: client_phone_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_phone_blocks (
    client_id uuid NOT NULL,
    phone text NOT NULL,
    reason text,
    blocked_by uuid,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_profiles (
    client_id uuid NOT NULL,
    client_type text,
    summary text,
    what_works text,
    best_contact_time text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    interlocutor_name text,
    interlocutor_gender text,
    interlocutor_relation text,
    CONSTRAINT client_profiles_client_type_check CHECK ((client_type = ANY (ARRAY['qochoq'::text, 'tajovuzkor'::text, 'qiynalayotgan'::text, 'yaxshi_niyatli'::text]))),
    CONSTRAINT client_profiles_interlocutor_gender_check CHECK ((interlocutor_gender = ANY (ARRAY['male'::text, 'female'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    full_name text NOT NULL,
    phone text,
    extra_phones text[] DEFAULT '{}'::text[] NOT NULL,
    telegram_user_id text,
    telegram_username text,
    telegram_access_hash text,
    telegram_status text DEFAULT 'unknown'::text NOT NULL,
    telegram_checked_at timestamp with time zone,
    do_not_contact boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    telegram_account_id uuid,
    account_assigned_at timestamp with time zone,
    telegram_name text,
    deleted_at timestamp with time zone,
    deleted_by text,
    created_import_batch_id uuid,
    telegram_hash_account_id uuid,
    first_name text,
    nomalum boolean DEFAULT false NOT NULL,
    CONSTRAINT clients_telegram_status_check CHECK ((telegram_status = ANY (ARRAY['unknown'::text, 'searching'::text, 'found'::text, 'not_found'::text, 'privacy_restricted'::text, 'name_mismatch'::text, 'blocked'::text, 'deactivated'::text])))
);


--
-- Name: COLUMN clients.telegram_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.telegram_name IS 'Telegramdagi ko''rsatiladigan ism (first + last). Mijozning F.I.O. si bilan solishtirish uchun saqlanadi — raqamlar qo''ldan qo''lga o''tadi.';


--
-- Name: COLUMN clients.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.deleted_at IS 'Yumshoq o''chirish belgisi. NULL bo''lmasa — mijoz ro''yxatlarda ko''rinmaydi, lekin shartnoma, suhbat va xabarlari bazada turadi va tiklash mumkin.';


--
-- Name: COLUMN clients.created_import_batch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.created_import_batch_id IS 'Shu mijozni YARATGAN import. Keyingi importlar mijozni yangilashi mumkin, lekin bu ustun o''zgarmaydi — qaytarish faqat yaratilganini olib tashlaydi.';


--
-- Name: contract_payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    external_id text NOT NULL,
    amount numeric(20,2) DEFAULT 0 NOT NULL,
    date_paid date NOT NULL,
    payment_type text,
    purpose text,
    is_problematic boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_uuid text
);


--
-- Name: contract_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    external_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(20,2) DEFAULT 0 NOT NULL,
    amount_paid numeric(20,2) DEFAULT 0 NOT NULL,
    date_payment date NOT NULL,
    date_paid date,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contract_no text NOT NULL,
    external_id text,
    object_name text,
    status text,
    virtual_status text,
    category text,
    total_price numeric(20,2),
    first_payment numeric(20,2),
    monthly_payment numeric(20,2),
    paid_total numeric(20,2),
    remaining_total numeric(20,2),
    contract_date date,
    months integer,
    next_payment_date date,
    days_overdue integer DEFAULT 0 NOT NULL,
    debt_first numeric(20,2) DEFAULT 0 NOT NULL,
    debt_monthly numeric(20,2) DEFAULT 0 NOT NULL,
    debt_total numeric(20,2) DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    last_warning_type text,
    last_warning_method text,
    last_warning_manager text,
    last_warning_at timestamp with time zone,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    import_batch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_import_batch_id uuid,
    external_order_id integer,
    synced_at timestamp with time zone,
    sync_error text,
    apartment_number text,
    apartment_floor integer,
    apartment_rooms integer,
    apartment_entrance text,
    apartment_block text,
    apartment_area numeric(10,2),
    missed_months integer DEFAULT 0 NOT NULL,
    completion_date date,
    debt_meter numeric(20,2) DEFAULT 0 NOT NULL,
    object_address text,
    company_inn text
);


--
-- Name: COLUMN contracts.missed_months; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contracts.missed_months IS 'To''lanmagan oylik to''lovlar soni — grafikdan qator-baqator sanalgan. debt_monthly / monthly_payment bo''linmasi EMAS: qisman to''langan oy bo''linmada yo''qolib ketadi.';


--
-- Name: COLUMN contracts.completion_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contracts.completion_date IS 'Xonadonni bitish muddati — CRM order/show: apartment.completion_date, bo''lmasa block, building, object.build_date. Faqat sinxronizatsiya yozadi.';


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    telegram_account_id uuid,
    peer_id text,
    peer_access_hash text,
    state text DEFAULT 'new'::text NOT NULL,
    stage text DEFAULT 'soft'::text NOT NULL,
    agent_enabled boolean DEFAULT true NOT NULL,
    needs_human boolean DEFAULT false NOT NULL,
    human_reason text,
    agent_session_id text,
    last_message_at timestamp with time zone,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    human_kind text,
    nudge_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT conversations_stage_check CHECK ((stage = ANY (ARRAY['soft'::text, 'hard'::text, 'legal'::text]))),
    CONSTRAINT conversations_state_check CHECK ((state = ANY (ARRAY['new'::text, 'contacted'::text, 'negotiating'::text, 'promised'::text, 'agreed'::text, 'refused'::text, 'unreachable'::text, 'escalated'::text, 'closed'::text])))
);


--
-- Name: debt_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_snapshots (
    day date NOT NULL,
    debt_total numeric(20,2) DEFAULT 0 NOT NULL,
    debt_monthly numeric(20,2) DEFAULT 0 NOT NULL,
    debt_first numeric(20,2) DEFAULT 0 NOT NULL,
    clients_with_debt integer DEFAULT 0 NOT NULL,
    contracts_with_debt integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    yillik boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT holidays_oraliq CHECK ((ends_on >= starts_on))
);


--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename text NOT NULL,
    kind text DEFAULT 'debtors'::text NOT NULL,
    rows_total integer DEFAULT 0 NOT NULL,
    rows_ok integer DEFAULT 0 NOT NULL,
    rows_failed integer DEFAULT 0 NOT NULL,
    clients_created integer DEFAULT 0 NOT NULL,
    contracts_created integer DEFAULT 0 NOT NULL,
    contracts_updated integer DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    undone_at timestamp with time zone,
    undone_by text,
    CONSTRAINT import_batches_kind_check CHECK ((kind = ANY (ARRAY['debtors'::text, 'phones'::text])))
);


--
-- Name: llm_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    label text NOT NULL,
    input_price_per_mtok numeric(12,4),
    output_price_per_mtok numeric(12,4),
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_models_provider_check CHECK ((provider = 'openai'::text))
);


--
-- Name: TABLE llm_models; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.llm_models IS 'Agent ishlatadigan til modellari. Narx 1 mln token uchun, NULL — kiritilmagan.';


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    direction text NOT NULL,
    author text NOT NULL,
    author_user_id uuid,
    body text NOT NULL,
    telegram_msg_id bigint,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    media_kind text,
    media_path text,
    media_mime text,
    media_size_bytes bigint,
    media_duration_sec integer,
    media_file_name text,
    transcript text,
    transcript_status text DEFAULT 'none'::text NOT NULL,
    deleted_at timestamp with time zone,
    read_at timestamp with time zone,
    edited_at timestamp with time zone,
    original_body text,
    revoked_at timestamp with time zone,
    image_kind text,
    image_status text DEFAULT 'none'::text NOT NULL,
    image_note text,
    transcript_xonzoda text,
    transcript_xonzoda_status text,
    transcript_xonzoda_error text,
    transcript_xonzoda_ms integer,
    CONSTRAINT messages_author_check CHECK ((author = ANY (ARRAY['agent'::text, 'human'::text, 'client'::text, 'system'::text]))),
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text, 'note'::text]))),
    CONSTRAINT messages_media_kind_check CHECK ((media_kind = ANY (ARRAY['photo'::text, 'voice'::text, 'audio'::text, 'video'::text, 'video_note'::text, 'document'::text, 'sticker'::text, 'other'::text]))),
    CONSTRAINT messages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))),
    CONSTRAINT messages_transcript_gigaam_status_check CHECK ((transcript_xonzoda_status = ANY (ARRAY['done'::text, 'failed'::text]))),
    CONSTRAINT messages_transcript_status_check CHECK ((transcript_status = ANY (ARRAY['none'::text, 'pending'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: COLUMN messages.read_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.read_at IS 'Mijoz xabarni Telegramda o''qigan vaqt (UpdateReadHistoryOutbox). Faqat chiquvchi xabarlarda to''ladi.';


--
-- Name: nomalum_suhbatlar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomalum_suhbatlar (
    conversation_id uuid NOT NULL,
    holat text DEFAULT 'kutilmoqda'::text NOT NULL,
    agent_javoblari integer DEFAULT 0 NOT NULL,
    urinishlar integer DEFAULT 0 NOT NULL,
    topilmagan integer DEFAULT 0 NOT NULL,
    shartnoma_raqami text,
    topilgan_client_id uuid,
    telegram_telefon text,
    sabab text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nomalum_suhbatlar_holat_check CHECK ((holat = ANY (ARRAY['kutilmoqda'::text, 'hujjat_kutilmoqda'::text, 'tasdiq_kutilmoqda'::text, 'operatorda'::text, 'mijoz_emas'::text, 'boglandi'::text])))
);


--
-- Name: oylik_eslatmalar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oylik_eslatmalar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    date_payment date NOT NULL,
    client_id uuid NOT NULL,
    guruh text NOT NULL,
    holat text NOT NULL,
    sabab text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oylik_eslatmalar_guruh_check CHECK ((guruh = ANY (ARRAY['B'::text, 'C'::text]))),
    CONSTRAINT oylik_eslatmalar_holat_check CHECK ((holat = ANY (ARRAY['sent'::text, 'skipped'::text])))
);


--
-- Name: payment_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    client_id uuid NOT NULL,
    contract_id uuid,
    message_id uuid,
    status text DEFAULT 'watching'::text NOT NULL,
    since_date date NOT NULL,
    baseline_paid numeric(20,2) DEFAULT 0 NOT NULL,
    found_amount numeric(20,2),
    found_type text,
    watch_until timestamp with time zone,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'crm_watch'::text NOT NULL,
    receipt_source text,
    acknowledged_at timestamp with time zone,
    thanks_sent_at timestamp with time zone,
    confirmed_by text,
    confirmed_at timestamp with time zone,
    CONSTRAINT payment_checks_kind_check CHECK ((kind = ANY (ARRAY['crm_watch'::text, 'receipt_review'::text]))),
    CONSTRAINT payment_checks_receipt_source_check CHECK ((((kind = 'receipt_review'::text) AND (receipt_source IS NOT NULL) AND (receipt_source = ANY (ARRAY['tolov'::text, 'aniqlanmagan'::text]))) OR ((kind = 'crm_watch'::text) AND (receipt_source IS NULL)))),
    CONSTRAINT payment_checks_status_check CHECK ((((kind = 'crm_watch'::text) AND (status = ANY (ARRAY['watching'::text, 'confirmed'::text, 'not_found'::text, 'cancelled'::text]))) OR ((kind = 'receipt_review'::text) AND (status = ANY (ARRAY['reviewing'::text, 'confirmed_by_operator'::text, 'cancelled'::text]))))),
    CONSTRAINT payment_checks_watch_until_check CHECK (((kind = 'receipt_review'::text) OR (watch_until IS NOT NULL)))
);


--
-- Name: payment_promises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_promises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    client_id uuid NOT NULL,
    contract_id uuid,
    amount numeric(20,2) NOT NULL,
    promised_date date NOT NULL,
    quote text,
    status text DEFAULT 'pending'::text NOT NULL,
    source_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    deleted_at timestamp with time zone,
    reminded_at timestamp with time zone,
    paid_amount numeric(20,2) DEFAULT 0 NOT NULL,
    thanked_amount numeric(20,2) DEFAULT 0 NOT NULL,
    checked_at timestamp with time zone,
    watch_until date,
    source text DEFAULT 'telegram'::text NOT NULL,
    call_id uuid,
    CONSTRAINT payment_promises_source_check CHECK ((source = ANY (ARRAY['telegram'::text, 'phone'::text]))),
    CONSTRAINT payment_promises_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'kept'::text, 'broken'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN payment_promises.reminded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_promises.reminded_at IS 'Va''da kunidagi eslatma yuborilgan vaqt. NULL — hali eslatilmagan. Har bir va''da uchun eslatma FAQAT BIR MARTA yuboriladi.';


--
-- Name: COLUMN payment_promises.paid_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_promises.paid_amount IS 'Va''da BERILGANIDAN KEYIN kelgan jami to''lov (contract_payment_events dan).';


--
-- Name: COLUMN payment_promises.thanked_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_promises.thanked_amount IS 'Qaysi summagacha rahmat aytilgan. paid_amount undan katta bo''lsa — yangi pul kelgan.';


--
-- Name: COLUMN payment_promises.watch_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_promises.watch_until IS 'Kuzatuv tugash sanasi. Shundan keyin to''lov to''liq kelmasa — broken.';


--
-- Name: phone_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    client_id uuid NOT NULL,
    contract_id uuid,
    agent_key text NOT NULL,
    agent_name text NOT NULL,
    phone text,
    started_at timestamp with time zone NOT NULL,
    duration_sec integer NOT NULL,
    outcome text NOT NULL,
    summary text,
    transcript text,
    promise_date date,
    promise_amount numeric(20,2),
    promise_id uuid,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT phone_calls_duration_sec_check CHECK ((duration_sec >= 0)),
    CONSTRAINT phone_calls_outcome_check CHECK ((outcome = ANY (ARRAY['gaplashildi'::text, 'kotarmadi'::text, 'band'::text, 'boshqa_odam'::text, 'raqam_notogri'::text])))
);


--
-- Name: recontact_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recontact_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    instruction text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: talabnoma_raqam_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.talabnoma_raqam_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: talabnomalar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.talabnomalar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    client_id uuid NOT NULL,
    raqam integer,
    holat text NOT NULL,
    summa numeric(16,2) NOT NULL,
    rekvizit jsonb NOT NULL,
    pdf_path text,
    message_id uuid,
    kuchga_kirish date,
    muddat_sanasi date,
    sent_at timestamp with time zone,
    sent_by uuid,
    xato_sababi text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT talabnomalar_holat_check CHECK ((holat = ANY (ARRAY['yuborilmoqda'::text, 'yuborildi'::text, 'xato'::text, 'bekor'::text])))
);


--
-- Name: telegram_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    phone text NOT NULL,
    api_id integer NOT NULL,
    api_hash_enc text NOT NULL,
    session_enc text,
    status text DEFAULT 'logged_out'::text NOT NULL,
    status_message text,
    tg_user_id text,
    tg_username text,
    daily_limit integer DEFAULT 30 NOT NULL,
    sent_today integer DEFAULT 0 NOT NULL,
    counter_date date,
    flood_wait_until timestamp with time zone,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    spam_status text DEFAULT 'unknown'::text NOT NULL,
    spam_checked_at timestamp with time zone,
    spam_message text,
    spam_until timestamp with time zone,
    deleted_at timestamp with time zone,
    persona_name text,
    lookup_limit integer DEFAULT 50 NOT NULL,
    lookups_today integer DEFAULT 0 NOT NULL,
    proxy_host text,
    proxy_port integer,
    proxy_username text,
    proxy_password_enc text,
    flood_wait_since timestamp with time zone,
    peer_flood_since timestamp with time zone,
    style_version text DEFAULT 'v1'::text NOT NULL,
    llm_model_id uuid,
    premium_until date,
    premium_eslatildi smallint,
    CONSTRAINT telegram_accounts_spam_status_check CHECK ((spam_status = ANY (ARRAY['unknown'::text, 'clean'::text, 'limited'::text, 'banned'::text, 'check_failed'::text]))),
    CONSTRAINT telegram_accounts_status_check CHECK ((status = ANY (ARRAY['logged_out'::text, 'awaiting_code'::text, 'awaiting_password'::text, 'awaiting_qr'::text, 'connected'::text, 'error'::text, 'banned'::text]))),
    CONSTRAINT telegram_accounts_style_version_check CHECK ((style_version = ANY (ARRAY['v1'::text, 'v2'::text])))
);


--
-- Name: COLUMN telegram_accounts.style_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.telegram_accounts.style_version IS 'Akkaunt qaysi uslubda yozadi. Panelda almashtiriladi, 10 soniyada kuchga kiradi.';


--
-- Name: COLUMN telegram_accounts.llm_model_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.telegram_accounts.llm_model_id IS 'Akkaunt qaysi model bilan yozadi. NULL — standart (Claude, .env dagi AGENT_MODEL).';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_id uuid NOT NULL,
    deleted_at timestamp with time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    last_failed_login_at timestamp with time zone,
    objects text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: COLUMN users.failed_login_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.failed_login_attempts IS 'Ketma-ket xato urinishlar soni. Muvaffaqiyatli kirishda nolga tushadi.';


--
-- Name: COLUMN users.locked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.locked_at IS 'Hisob bloklangan vaqt. NULL bo''lmasa kirish taqiqlanadi — faqat administrator ochadi (yoki serverda `npm run seed`, admin hisobi uchun).';


--
-- Name: agent_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage ALTER COLUMN id SET DEFAULT nextval('public.agent_usage_id_seq'::regclass);


--
-- Name: app_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_log ALTER COLUMN id SET DEFAULT nextval('public.app_log_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: agent_lessons agent_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_lessons
    ADD CONSTRAINT agent_lessons_pkey PRIMARY KEY (id);


--
-- Name: agent_rule_sections agent_rule_sections_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_rule_sections
    ADD CONSTRAINT agent_rule_sections_key_key UNIQUE (key);


--
-- Name: agent_rule_sections agent_rule_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_rule_sections
    ADD CONSTRAINT agent_rule_sections_pkey PRIMARY KEY (id);


--
-- Name: agent_rules agent_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_rules
    ADD CONSTRAINT agent_rules_pkey PRIMARY KEY (id);


--
-- Name: agent_usage agent_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: app_log app_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_log
    ADD CONSTRAINT app_log_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bulk_jobs bulk_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_jobs
    ADD CONSTRAINT bulk_jobs_pkey PRIMARY KEY (id);


--
-- Name: campaign_targets campaign_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: client_phone_blocks client_phone_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_phone_blocks
    ADD CONSTRAINT client_phone_blocks_pkey PRIMARY KEY (client_id, phone);


--
-- Name: client_profiles client_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_pkey PRIMARY KEY (client_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: contract_payment_events contract_payment_events_contract_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_events
    ADD CONSTRAINT contract_payment_events_contract_id_external_id_key UNIQUE (contract_id, external_id);


--
-- Name: contract_payment_events contract_payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_events
    ADD CONSTRAINT contract_payment_events_pkey PRIMARY KEY (id);


--
-- Name: contract_payments contract_payments_contract_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payments
    ADD CONSTRAINT contract_payments_contract_id_external_id_key UNIQUE (contract_id, external_id);


--
-- Name: contract_payments contract_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payments
    ADD CONSTRAINT contract_payments_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: debt_snapshots debt_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_snapshots
    ADD CONSTRAINT debt_snapshots_pkey PRIMARY KEY (day);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_provider_model_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_provider_model_key UNIQUE (provider, model);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: nomalum_suhbatlar nomalum_suhbatlar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomalum_suhbatlar
    ADD CONSTRAINT nomalum_suhbatlar_pkey PRIMARY KEY (conversation_id);


--
-- Name: oylik_eslatmalar oylik_eslatmalar_contract_id_date_payment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oylik_eslatmalar
    ADD CONSTRAINT oylik_eslatmalar_contract_id_date_payment_key UNIQUE (contract_id, date_payment);


--
-- Name: oylik_eslatmalar oylik_eslatmalar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oylik_eslatmalar
    ADD CONSTRAINT oylik_eslatmalar_pkey PRIMARY KEY (id);


--
-- Name: payment_checks payment_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_checks
    ADD CONSTRAINT payment_checks_pkey PRIMARY KEY (id);


--
-- Name: payment_promises payment_promises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_pkey PRIMARY KEY (id);


--
-- Name: phone_calls phone_calls_created_by_user_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_created_by_user_id_external_id_key UNIQUE (created_by_user_id, external_id);


--
-- Name: phone_calls phone_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_pkey PRIMARY KEY (id);


--
-- Name: recontact_topics recontact_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recontact_topics
    ADD CONSTRAINT recontact_topics_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: talabnomalar talabnomalar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talabnomalar
    ADD CONSTRAINT talabnomalar_pkey PRIMARY KEY (id);


--
-- Name: talabnomalar talabnomalar_raqam_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talabnomalar
    ADD CONSTRAINT talabnomalar_raqam_key UNIQUE (raqam);


--
-- Name: telegram_accounts telegram_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: bulk_jobs_one_running; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bulk_jobs_one_running ON public.bulk_jobs USING btree (kind) WHERE (status = 'running'::text);


--
-- Name: clients_nomalum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_nomalum_idx ON public.clients USING btree (nomalum) WHERE nomalum;


--
-- Name: contract_payment_events_contract_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_payment_events_contract_idx ON public.contract_payment_events USING btree (contract_id, date_paid DESC);


--
-- Name: contract_payment_events_uuid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contract_payment_events_uuid_idx ON public.contract_payment_events USING btree (contract_id, source_uuid) WHERE (source_uuid IS NOT NULL);


--
-- Name: contract_payments_contract_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_payments_contract_idx ON public.contract_payments USING btree (contract_id, date_payment);


--
-- Name: contracts_external_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contracts_external_order_id_key ON public.contracts USING btree (external_order_id) WHERE (external_order_id IS NOT NULL);


--
-- Name: contracts_synced_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contracts_synced_at_idx ON public.contracts USING btree (synced_at NULLS FIRST);


--
-- Name: idx_agent_rules_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_rules_section ON public.agent_rules USING btree (section_id, sort_order);


--
-- Name: idx_agent_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_usage_created ON public.agent_usage USING btree (created_at);


--
-- Name: idx_api_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_tokens_active ON public.api_tokens USING btree (token_hash) WHERE (revoked_at IS NULL);


--
-- Name: idx_api_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_tokens_user ON public.api_tokens USING btree (user_id);


--
-- Name: idx_app_log_akkaunt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_log_akkaunt ON public.app_log USING btree (akkaunt) WHERE (akkaunt IS NOT NULL);


--
-- Name: idx_app_log_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_log_at ON public.app_log USING btree (at DESC);


--
-- Name: idx_app_log_flag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_log_flag ON public.app_log USING btree (id DESC) WHERE (flag IS NOT NULL);


--
-- Name: idx_app_log_muhim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_log_muhim ON public.app_log USING btree (id DESC) WHERE (level <> 'info'::text);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_log USING btree (entity, entity_id);


--
-- Name: idx_client_phone_blocks_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_phone_blocks_at ON public.client_phone_blocks USING btree (blocked_at DESC);


--
-- Name: idx_clients_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_account ON public.clients USING btree (telegram_account_id);


--
-- Name: idx_clients_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_alive ON public.clients USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_clients_created_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_created_batch ON public.clients USING btree (created_import_batch_id) WHERE (created_import_batch_id IS NOT NULL);


--
-- Name: idx_clients_external_id_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clients_external_id_alive ON public.clients USING btree (external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_clients_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_name ON public.clients USING gin (to_tsvector('simple'::regconfig, full_name));


--
-- Name: idx_clients_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_phone ON public.clients USING btree (phone);


--
-- Name: idx_clients_tg_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_tg_user ON public.clients USING btree (telegram_user_id);


--
-- Name: idx_contracts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_client ON public.contracts USING btree (client_id);


--
-- Name: idx_contracts_client_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_client_alive ON public.contracts USING btree (client_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_contracts_created_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_created_batch ON public.contracts USING btree (created_import_batch_id) WHERE (created_import_batch_id IS NOT NULL);


--
-- Name: idx_contracts_debt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_debt ON public.contracts USING btree (debt_total DESC);


--
-- Name: idx_contracts_no_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contracts_no_alive ON public.contracts USING btree (contract_no) WHERE (deleted_at IS NULL);


--
-- Name: idx_contracts_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_object ON public.contracts USING btree (object_name);


--
-- Name: idx_contracts_overdue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_overdue ON public.contracts USING btree (days_overdue DESC);


--
-- Name: idx_conversations_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_alive ON public.conversations USING btree (last_message_at DESC NULLS LAST) WHERE (deleted_at IS NULL);


--
-- Name: idx_conversations_client_account_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversations_client_account_alive ON public.conversations USING btree (client_id, telegram_account_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_conversations_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_msg ON public.conversations USING btree (last_message_at DESC NULLS LAST);


--
-- Name: idx_conversations_needs_human; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_needs_human ON public.conversations USING btree (needs_human) WHERE (needs_human = true);


--
-- Name: idx_conversations_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_state ON public.conversations USING btree (state);


--
-- Name: idx_conversations_sukut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_sukut ON public.conversations USING btree (last_outbound_at) WHERE (nudge_count < 3);


--
-- Name: idx_holidays_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_holidays_starts ON public.holidays USING btree (starts_on);


--
-- Name: idx_lessons_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_status ON public.agent_lessons USING btree (status, times_seen DESC);


--
-- Name: idx_messages_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conv ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_messages_conv_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conv_alive ON public.messages USING btree (conversation_id, created_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_messages_media; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_media ON public.messages USING btree (media_kind) WHERE (media_kind IS NOT NULL);


--
-- Name: idx_messages_read_out; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_read_out ON public.messages USING btree (conversation_id) WHERE ((direction = 'out'::text) AND (read_at IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_status ON public.messages USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text, 'failed'::text]));


--
-- Name: idx_messages_tg_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_tg_unique ON public.messages USING btree (conversation_id, telegram_msg_id) WHERE ((telegram_msg_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_messages_unread_out; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread_out ON public.messages USING btree (conversation_id, telegram_msg_id) WHERE ((direction = 'out'::text) AND (read_at IS NULL) AND (telegram_msg_id IS NOT NULL));


--
-- Name: idx_oylik_eslatmalar_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oylik_eslatmalar_created ON public.oylik_eslatmalar USING btree (created_at) WHERE (holat = 'sent'::text);


--
-- Name: idx_promises_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promises_date ON public.payment_promises USING btree (promised_date);


--
-- Name: idx_promises_due_reminder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promises_due_reminder ON public.payment_promises USING btree (promised_date) WHERE ((status = ANY (ARRAY['pending'::text, 'partial'::text])) AND (reminded_at IS NULL));


--
-- Name: idx_promises_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_promises_one_pending ON public.payment_promises USING btree (conversation_id, promised_date, amount) WHERE ((status = ANY (ARRAY['pending'::text, 'partial'::text])) AND (deleted_at IS NULL));


--
-- Name: idx_promises_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promises_status ON public.payment_promises USING btree (status);


--
-- Name: idx_promises_watch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promises_watch ON public.payment_promises USING btree (checked_at NULLS FIRST) WHERE ((status = ANY (ARRAY['pending'::text, 'partial'::text])) AND (deleted_at IS NULL));


--
-- Name: idx_roles_key_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_roles_key_alive ON public.roles USING btree (key) WHERE (deleted_at IS NULL);


--
-- Name: idx_targets_campaign_client_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_targets_campaign_client_alive ON public.campaign_targets USING btree (campaign_id, client_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_targets_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_targets_state ON public.campaign_targets USING btree (campaign_id, state);


--
-- Name: idx_telegram_accounts_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_accounts_alive ON public.telegram_accounts USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_telegram_accounts_phone_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telegram_accounts_phone_alive ON public.telegram_accounts USING btree (phone) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_email_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email_alive ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role_id);


--
-- Name: payment_checks_one_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_checks_one_open_idx ON public.payment_checks USING btree (conversation_id) WHERE (status = ANY (ARRAY['watching'::text, 'reviewing'::text]));


--
-- Name: payment_checks_operator_confirmed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_checks_operator_confirmed_idx ON public.payment_checks USING btree (conversation_id, confirmed_at) WHERE (status = 'confirmed_by_operator'::text);


--
-- Name: payment_checks_watching_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_checks_watching_idx ON public.payment_checks USING btree (checked_at NULLS FIRST) WHERE (status = 'watching'::text);


--
-- Name: phone_calls_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_client_idx ON public.phone_calls USING btree (client_id, started_at DESC);


--
-- Name: talabnomalar_bir_marta; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX talabnomalar_bir_marta ON public.talabnomalar USING btree (contract_id) WHERE (holat = ANY (ARRAY['yuborilmoqda'::text, 'yuborildi'::text, 'xato'::text]));


--
-- Name: talabnomalar_client_muddat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX talabnomalar_client_muddat ON public.talabnomalar USING btree (client_id, muddat_sanasi) WHERE (holat = 'yuborildi'::text);


--
-- Name: agent_rules trg_agent_rules_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_rules_touch BEFORE UPDATE ON public.agent_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: campaigns trg_campaigns_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: clients trg_clients_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clients_touch BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: contracts trg_contracts_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contracts_touch BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: conversations trg_conv_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conv_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: agent_lessons trg_lessons_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lessons_touch BEFORE UPDATE ON public.agent_lessons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: recontact_topics trg_recontact_topics_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recontact_topics_touch BEFORE UPDATE ON public.recontact_topics FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roles trg_roles_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_touch BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: agent_rule_sections trg_rule_sections_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rule_sections_touch BEFORE UPDATE ON public.agent_rule_sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: telegram_accounts trg_tg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tg_touch BEFORE UPDATE ON public.telegram_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: users trg_users_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_touch BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: agent_lessons agent_lessons_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_lessons
    ADD CONSTRAINT agent_lessons_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: agent_rules agent_rules_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_rules
    ADD CONSTRAINT agent_rules_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.agent_rule_sections(id) ON DELETE CASCADE;


--
-- Name: agent_rules agent_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_rules
    ADD CONSTRAINT agent_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: agent_usage agent_usage_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_usage
    ADD CONSTRAINT agent_usage_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: api_tokens api_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campaign_targets campaign_targets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_targets campaign_targets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: campaign_targets campaign_targets_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;


--
-- Name: campaign_targets campaign_targets_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_targets
    ADD CONSTRAINT campaign_targets_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: client_phone_blocks client_phone_blocks_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_phone_blocks
    ADD CONSTRAINT client_phone_blocks_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: client_phone_blocks client_phone_blocks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_phone_blocks
    ADD CONSTRAINT client_phone_blocks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_profiles client_profiles_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: clients clients_created_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_import_batch_id_fkey FOREIGN KEY (created_import_batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;


--
-- Name: clients clients_telegram_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_telegram_account_id_fkey FOREIGN KEY (telegram_account_id) REFERENCES public.telegram_accounts(id) ON DELETE SET NULL;


--
-- Name: clients clients_telegram_hash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_telegram_hash_account_id_fkey FOREIGN KEY (telegram_hash_account_id) REFERENCES public.telegram_accounts(id) ON DELETE SET NULL;


--
-- Name: contract_payment_events contract_payment_events_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_events
    ADD CONSTRAINT contract_payment_events_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_payments contract_payments_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payments
    ADD CONSTRAINT contract_payments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_created_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_created_import_batch_id_fkey FOREIGN KEY (created_import_batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_telegram_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_telegram_account_id_fkey FOREIGN KEY (telegram_account_id) REFERENCES public.telegram_accounts(id) ON DELETE SET NULL;


--
-- Name: import_batches import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: nomalum_suhbatlar nomalum_suhbatlar_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomalum_suhbatlar
    ADD CONSTRAINT nomalum_suhbatlar_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: nomalum_suhbatlar nomalum_suhbatlar_topilgan_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomalum_suhbatlar
    ADD CONSTRAINT nomalum_suhbatlar_topilgan_client_id_fkey FOREIGN KEY (topilgan_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: oylik_eslatmalar oylik_eslatmalar_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oylik_eslatmalar
    ADD CONSTRAINT oylik_eslatmalar_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: oylik_eslatmalar oylik_eslatmalar_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oylik_eslatmalar
    ADD CONSTRAINT oylik_eslatmalar_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: payment_checks payment_checks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_checks
    ADD CONSTRAINT payment_checks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: payment_checks payment_checks_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_checks
    ADD CONSTRAINT payment_checks_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;


--
-- Name: payment_checks payment_checks_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_checks
    ADD CONSTRAINT payment_checks_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: payment_checks payment_checks_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_checks
    ADD CONSTRAINT payment_checks_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: payment_promises payment_promises_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.phone_calls(id) ON DELETE SET NULL;


--
-- Name: payment_promises payment_promises_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: payment_promises payment_promises_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;


--
-- Name: payment_promises payment_promises_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: payment_promises payment_promises_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_promises
    ADD CONSTRAINT payment_promises_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: phone_calls phone_calls_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: phone_calls phone_calls_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;


--
-- Name: phone_calls phone_calls_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: phone_calls phone_calls_promise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_promise_id_fkey FOREIGN KEY (promise_id) REFERENCES public.payment_promises(id) ON DELETE SET NULL;


--
-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: talabnomalar talabnomalar_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talabnomalar
    ADD CONSTRAINT talabnomalar_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: talabnomalar talabnomalar_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talabnomalar
    ADD CONSTRAINT talabnomalar_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id);


--
-- Name: talabnomalar talabnomalar_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talabnomalar
    ADD CONSTRAINT talabnomalar_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id);


--
-- Name: telegram_accounts telegram_accounts_llm_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_llm_model_id_fkey FOREIGN KEY (llm_model_id) REFERENCES public.llm_models(id) ON DELETE SET NULL;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

-- ─── Boshlang'ich ma'lumot: rollar ───
--
-- PostgreSQL database dump
--


-- Dumped from database version 14.23 (Homebrew)
-- Dumped by pg_dump version 14.23 (Homebrew)


--
-- Data for Name: llm_models; Type: TABLE DATA; Schema: public; Owner: -
--


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.roles VALUES ('b5f78e91-dcb2-40ff-a587-8cf0fc51e8d8', 'operator', 'Operator', 'Mijozlar bilan ishlaydi, sozlamalarga tegmaydi', '{dashboard.view,conversations.view,conversations.send,conversations.manage,conversations.agent_toggle,clients.view,clients.edit,clients.telegram_lookup,clients.start_conversation,campaigns.view,campaigns.create,campaigns.control,import.view,import.run,telegram.view,settings.view,agent.view,agent.propose,contracts.sync,clients.create}', true, '2026-10-20 12:11:34.014239+05', '2026-10-20 12:11:34.130189+05', NULL);
INSERT INTO public.roles VALUES ('4547c08e-e649-48e4-9c34-82a14b2ede45', 'viewer', 'Kuzatuvchi', 'Faqat o''qish', '{dashboard.view,conversations.view,clients.view,campaigns.view,import.view,telegram.view,settings.view,agent.view}', true, '2026-10-20 12:11:34.014239+05', '2026-10-20 12:11:34.042958+05', NULL);
INSERT INTO public.roles VALUES ('9d6c7e69-e36d-41ec-9df0-e4ae7a553c35', 'mcp_agent', 'MCP agent', 'Boshqa AI agentlar uchun: o''qish va xavfsiz amallar. Mijozga xabar yubora olmaydi.', '{dashboard.view,conversations.view,conversations.manage,clients.view,clients.edit,campaigns.view,import.view,telegram.view,settings.view,agent.view,agent.propose}', true, '2026-10-20 12:11:34.052656+05', '2026-10-20 12:11:34.052656+05', NULL);
INSERT INTO public.roles VALUES ('aa89fb37-5c2f-4406-8f36-4bd92d29635c', 'call_agent', 'Qo''ng''iroq agenti', 'Ovozli qo''ng''iroq platformasi uchun: shartnoma bo''yicha qo''ng''iroqdan oldingi ma''lumot va natijani yozish. Mijozga xabar yubora olmaydi.', '{calls.brief,calls.record}', true, '2026-10-20 12:11:34.237017+05', '2026-10-20 12:11:34.237017+05', NULL);
INSERT INTO public.roles VALUES ('670a3b95-e904-4ba3-a5d8-a4321013ae7a', 'admin', 'Administrator', 'Barcha imkoniyatlar', '{dashboard.view,conversations.view,conversations.send,conversations.manage,conversations.agent_toggle,clients.view,clients.edit,clients.telegram_lookup,clients.start_conversation,campaigns.view,campaigns.create,campaigns.control,import.view,import.run,telegram.view,telegram.manage,settings.view,settings.edit,settings.kill_switch,users.view,users.manage,roles.manage,audit.view,agent.view,agent.edit,agent.propose,conversations.reset,telegram.inbox,clients.delete,import.undo,contracts.sync,reports.view,clients.create,logs.view,clients.export,holidays.view,holidays.manage,conversations.edit_message,conversations.delete_message,talabnoma.view,talabnoma.send}', true, '2026-10-20 12:11:34.014239+05', '2026-10-20 12:11:34.255102+05', NULL);


--
-- PostgreSQL database dump complete
--
