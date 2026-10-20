CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  name varchar(60) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  password text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  photo bytea,
  "photoVersion" text
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions ("expiresAt");
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{24}$'),
  "from" text NOT NULL REFERENCES users(id),
  "to" text NOT NULL REFERENCES users(id),
  conversation text NOT NULL,
  text text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reactionVersion" integer NOT NULL DEFAULT 0,
  CHECK ("from" <> "to"),
  CHECK (conversation = least("from", "to") || ':' || greatest("from", "to")),
  CHECK ((deleted AND text IS NULL AND reactions = '{}'::jsonb) OR (NOT deleted AND text IS NOT NULL AND length(text) BETWEEN 1 AND 2000))
);
CREATE INDEX IF NOT EXISTS messages_history_idx ON messages (conversation, "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages ("from", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages ("to", "createdAt" DESC);
