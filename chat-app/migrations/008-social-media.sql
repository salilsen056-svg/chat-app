ALTER TABLE message_media DROP CONSTRAINT IF EXISTS message_media_data_check;
ALTER TABLE message_media ADD CONSTRAINT message_media_data_check CHECK(octet_length(data) BETWEEN 1 AND 31457280);
ALTER TABLE statuses DROP CONSTRAINT IF EXISTS statuses_data_check;
ALTER TABLE statuses ADD CONSTRAINT statuses_data_check CHECK(data IS NULL OR octet_length(data)<=31457280);
CREATE TABLE IF NOT EXISTS blocks (
 "ownerId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "blockedId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY("ownerId","blockedId"), CHECK("ownerId"<>"blockedId")
);
CREATE TABLE IF NOT EXISTS chat_groups (
 id text PRIMARY KEY, name varchar(80) NOT NULL,
 "ownerId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_members (
 "groupId" text NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY("groupId","userId")
);
CREATE TABLE IF NOT EXISTS group_messages (
 id text PRIMARY KEY, "groupId" text NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 "from" text NOT NULL REFERENCES users(id), text text NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_messages_history ON group_messages("groupId","createdAt",id);
