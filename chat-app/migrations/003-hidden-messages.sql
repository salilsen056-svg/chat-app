CREATE TABLE IF NOT EXISTS hidden_messages (
  "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "messageId" text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  "hiddenAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "messageId")
);
