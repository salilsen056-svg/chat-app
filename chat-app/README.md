# Hello Chat

A responsive one-to-one chat app built with Next.js App Router, React, MongoDB, and Socket.IO.

## Start locally

Requires Node.js 20.9+ and a running MongoDB instance (local MongoDB or MongoDB Atlas).

```sh
npm install
cp .env.example .env.local
# Set MONGODB_URI in .env.local to your local or Atlas connection string.
npm run dev
```

Open http://localhost:3000. Create two accounts in separate browser profiles (or use an incognito window), select the other account, and send messages. The people list refreshes every 15 seconds. The most recent 100 messages load when a conversation opens.

If you have Docker, a local database can be started with:

```sh
docker run --name hello-mongo -p 127.0.0.1:27017:27017 -v hello-mongo-data:/data/db -d mongo:8
```

## Production

```sh
npm run build
npm start
```

Deploy the custom Node server on a host supporting persistent WebSocket connections. Use HTTPS in production for secure session cookies. This custom server is not designed for Vercel serverless hosting. Run one server instance; multiple replicas need a shared Socket.IO adapter and distributed rate limiting.

## Included

- Signup and login with salted scrypt password hashes.
- Random session tokens in HttpOnly, SameSite cookies; hashed tokens stored in MongoDB with seven-day expiry.
- Authenticated socket connections and server-side sender identity.
- Database-backed private messages with timestamps and a conversation index.
- Sender-only Delete for everyone: removes stored message text and syncs a deleted-message placeholder to both participants.
- Input validation, origin checks, basic in-process auth/message rate limits.
- Responsive people search, connection status, logout, and error states.
- Love ❤️, Like 👍, Angry 😡, and Happy 😄 reactions on messages. Each participant can select one reaction, switch it, or tap it again to remove it. Counts update live and persist in MongoDB; deleted messages cannot receive reactions.
- Bold and italic formatting buttons with a live preview; select text and use the toolbar or Ctrl/⌘+B and Ctrl/⌘+I. Supports **bold**, *italic*, and ***both*** in messages.

The app requires MongoDB for authentication and messaging. It does not seed fake users or simulate delivery. For a public launch, add email verification, password reset, reporting/blocking, and operational monitoring. Messages are stored in MongoDB, without end-to-end encryption.

## Verification

```sh
npm test
npm run build
```
