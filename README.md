# Hello Chat

Next.js + PostgreSQL + Socket.IO chat app. Source and setup: [chat-app/README.md](chat-app/README.md). Render deployment: [chat-app/DEPLOYMENT.md](chat-app/DEPLOYMENT.md).

The root render.yaml provisions the web service and PostgreSQL automatically; no MongoDB Atlas secret is required.

The older Bangla architecture PDF documents the previous MongoDB implementation and is retained as a historical reference. Current schema and database access are in chat-app/migrations/ and chat-app/lib/database.mjs.
