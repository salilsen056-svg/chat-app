# Hello Chat

A WhatsApp-inspired one-to-one chat app using Next.js App Router, React, PostgreSQL and Socket.IO.

## Local setup

Requires Node.js 22+ and PostgreSQL. Create a database named `hello_chat`, then:

```sh
npm install
cp .env.example .env.local
# Edit DATABASE_URL to point at your PostgreSQL database.
npm run db:migrate
npm run dev
```

The app also initializes its schema on first database access. Open http://localhost:3000 and create two accounts in separate browser profiles/incognito windows. The users list refreshes every 15 seconds; conversations load the latest 100 messages.

For a local Docker database:

```sh
docker run --name hello-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=hello_chat -p 127.0.0.1:5432:5432 -v hello-postgres-data:/var/lib/postgresql/data -d postgres:17
```

Use the sample password only for local development. Keep `.env.local` private.

## Features

- Signup/login with salted scrypt hashes, HttpOnly session cookies and seven-day expiry.
- PostgreSQL foreign keys, unique email, parameterized SQL, indexes and pooled connections.
- Persistent private messages, timestamps, deleted-message tombstones and atomic emoji reactions.
- Photo/video messages with optional captions and preview. JPG/PNG/WebP photos up to 5 MB are validated and reencoded; MP4/WebM videos up to 10 MB are signature-checked and stored as uploaded. Video codec support depends on the browser; unsupported files can still be downloaded.
- Click a photo or the Download button to download; video controls support seeking through authenticated byte-range responses.
- Media is stored in PostgreSQL message_media bytea and can only be fetched by the two participants. Deletion removes the blob too. A 250 MB application-wide attachment cap protects the free database; deleting sent media releases attachment capacity.
- Circular profile photos: validated JPEG/PNG/WebP uploads up to 2 MB, cropped/reencoded to 256px JPEG and stored in bytea.
- Bold/italic formatting, live preview, composer emoji picker and selected-only message reactions.
- Header actions: select any message for persistent Delete for me; select your own message for Delete for everyone. Export chat downloads your full visible history as UTF-8 text (UTC timestamps, captions and media filenames; media bytes are downloaded separately). Clear chat in the header persistently hides the current conversation only for you, with confirmation; new messages still arrive. Bold/Italic controls live in the chat header; the composer is a compact rectangle.
- Sender-only Delete for everyone; Love, Like, Angry and Happy reactions with live counts.
- Chat previews, recent-chat filter, search within the latest 100 messages, mobile navigation and light/dark theme.
- Database-aware health check at `/api/health`.

The single check means saved to the server. Delivery/read receipts, calls, group chats, status, password reset, verification, blocking and end-to-end encryption are not implemented.

## Database structure

`migrations/001-initial.sql` creates users, sessions and messages. `002-media.sql` adds attachment metadata and blob storage without changing existing messages. IDs remain 24-character hex strings to preserve legacy account and message references. Messages use JSONB for per-user reactions and bytea in users for photos. An advisory lock serializes schema initialization. Expired sessions are rejected on every authentication and cleaned when a new session is created.

`lib/database.mjs` owns PostgreSQL access; `server.mjs` handles HTTP and sockets. The application has no runtime dependency on MongoDB.

## Optional import from the old MongoDB database

The import requires an **empty PostgreSQL target**, preserves existing IDs, password hashes, active sessions, messages, deletion markers, reactions, timestamps and profile photos, and leaves the MongoDB source unchanged. All imported records are in a single SQL transaction; failures roll back.

Install the optional import-only driver without recording it in app dependencies:

```sh
npm install --no-save --package-lock=false mongodb
```

Set `MIGRATION_MONGODB_URI`, optionally `MIGRATION_MONGODB_DB` (default `hello_chat`), and target `DATABASE_URL` through private environment variables, then:

```sh
npm run db:import-mongodb
```

Do not paste secrets into command history or Git. Review the target and back up important databases first. A subsequent `npm ci` removes the optional MongoDB driver.

## Production

```sh
npm run build
npm start
```

Use HTTPS and a persistent Node host supporting WebSocket connections. `../render.yaml` provisions a Render web service plus PostgreSQL and supplies DATABASE_URL automatically. Read DEPLOYMENT.md for free-tier expiry and deployment checks. Use a shared Socket.IO adapter and distributed rate limiter before scaling beyond one instance.

## Tests

```sh
npm test
npm run build
# Optional real-PostgreSQL repository tests; requires a disposable test database:
TEST_DATABASE_URL=postgresql://... npm run test:database
```

## Status, calling and message receipts
- Status updates support text and validated photo/video attachments. Every signed-in account can view them; they expire after 24 hours. Only the owner may delete an update. Expired blobs are purged on feed access or upload. Status media shares the 250 MB attachment budget.
- Voice/video calls use authenticated Socket.IO signaling and browser WebRTC. Both people must keep the app open. Accept/reject, busy/offline handling, end call, mute, camera toggle and disconnect cleanup are included. Calls are not recorded.
- One grey tick means saved; two grey ticks mean delivered to the recipient's connected app; blue double ticks mean the message was visible in their focused chat. Read timestamps persist in PostgreSQL and only the recipient can update them.
- STUN is configured by default. For calls across networks that block direct peer connections, configure a TURN relay with TURN_URL, TURN_USERNAME and TURN_CREDENTIAL in server secrets. Credentials are sent only to authenticated callers; prefer a dedicated limited-quota relay account and rotate them. TURN is not provisioned automatically.
- The production service runs one instance; call state is held in memory and active calls end during restarts/deploys. Multi-instance deployment requires shared signaling/call coordination.
- Verification: npm test; TEST_DATABASE_URL=... npm run test:database; with the app running against the same disposable database on port 3002, TEST_DATABASE_URL=... npm run test:features. The feature test creates and removes only its own synthetic accounts and records.
