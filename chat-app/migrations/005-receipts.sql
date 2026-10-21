ALTER TABLE messages ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "readAt" timestamptz;
