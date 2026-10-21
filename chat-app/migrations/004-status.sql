CREATE TABLE IF NOT EXISTS statuses (
 id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 text text NOT NULL DEFAULT '' CHECK (length(text)<=2000),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "expiresAt" timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 "mediaType" text, "mediaMime" text, "mediaName" text, data bytea,
 CHECK (length(text)>0 OR data IS NOT NULL), CHECK (data IS NULL OR octet_length(data)<=10485760)
);
CREATE INDEX IF NOT EXISTS statuses_expiry ON statuses("expiresAt");
