-- Mijozlar matn o'rniga ovozli xabar, rasm (ko'pincha to'lov cheki),
-- video yoki hujjat yuboradi. Ularni saqlash va ovozni matnga o'girish uchun.

ALTER TABLE messages
  ADD COLUMN media_kind        TEXT
    CHECK (media_kind IN ('photo','voice','audio','video','video_note','document','sticker','other')),
  ADD COLUMN media_path        TEXT,
  ADD COLUMN media_mime        TEXT,
  ADD COLUMN media_size_bytes  BIGINT,
  ADD COLUMN media_duration_sec INTEGER,
  ADD COLUMN media_file_name   TEXT,
  -- Ovozli xabarning matnga o'girilgan varianti (STT natijasi).
  ADD COLUMN transcript        TEXT,
  ADD COLUMN transcript_status TEXT NOT NULL DEFAULT 'none'
    CHECK (transcript_status IN ('none','pending','done','failed'));

CREATE INDEX idx_messages_media ON messages (media_kind) WHERE media_kind IS NOT NULL;
