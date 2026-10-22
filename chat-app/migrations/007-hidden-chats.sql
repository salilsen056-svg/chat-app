CREATE TABLE IF NOT EXISTS hidden_chats (
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "peerId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY ("userId","peerId")
);
