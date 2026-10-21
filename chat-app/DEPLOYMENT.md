# PostgreSQL + Render deployment

The repository root contains `render.yaml`; the application lives in `chat-app/`.

1. Create a Blueprint from `https://github.com/salilsen056-svg/chat-app` on `main` in the intended Render workspace.
2. Review the two free resources: `salil-hello-chat` (web) and `salil-hello-chat-db` (PostgreSQL), both in Singapore.
3. Apply the Blueprint. Render injects the internal PostgreSQL URL into `DATABASE_URL` via `fromDatabase`; no Atlas URI or manual database password is needed.
4. The app connects using a pg Pool (maximum 10 connections). Schema setup runs transactionally under an advisory lock at first database access; `/api/health` checks database readiness.
5. Wait for the deploy to become live. Check `/api/health` returns `{"status":"ok"}` and test two-browser messaging, reactions, deletion and profile photos on HTTPS.

The web service binds to 0.0.0.0 using Render's PORT. It uses Node 22, build `npm ci --include=dev && npm run build`, and start `npm start`. Socket.IO runs in the same process; retain one instance. Production cookies require HTTPS.

Database external access is blocked by `ipAllowList: []`. The app uses Render's private connection. Profile photos and message attachments are stored in PostgreSQL bytea; no persistent web-service disk is needed. Attachments have a 250 MB app-wide cap; monitor database storage as messages and photos grow. For external PostgreSQL connections, use your provider's verified TLS connection settings (`sslmode=verify-full` with an appropriate CA when required); certificate verification is never disabled by the app.

Free Render PostgreSQL expires after 30 days and has 1 GB storage. Back up or upgrade before expiry; expired free databases are eventually deleted. The free web service can sleep after inactivity. Paid upgrades require your choice.

Local MongoDB records are not automatically uploaded to Render. Use the optional read-only-source import described in README.md if you want to migrate existing data. Never commit DATABASE_URL, legacy database credentials or `.env.local`.

Voice/video calling: HTTPS is required for camera/microphone access. Calls require both participants online with the app open. Optional TURN_URL, TURN_USERNAME, TURN_CREDENTIAL secrets enable relay fallback across restrictive networks; no relay service is included by default. Statuses and persisted read receipts use additive migrations 004/005 on startup.
