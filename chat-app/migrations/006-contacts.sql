CREATE TABLE IF NOT EXISTS contacts (
  "ownerId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("ownerId","contactId"),
  CHECK ("ownerId" <> "contactId")
);
CREATE INDEX IF NOT EXISTS contacts_subject_idx ON contacts ("contactId");
