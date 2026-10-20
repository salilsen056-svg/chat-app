ALTER TABLE messages ADD COLUMN IF NOT EXISTS "mediaType" text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "mediaName" text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "mediaMime" text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "mediaSize" integer;
CREATE TABLE IF NOT EXISTS message_media (
  "messageId" text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  data bytea NOT NULL,
  CHECK (octet_length(data) BETWEEN 1 AND 10485760)
);
