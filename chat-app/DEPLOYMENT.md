# GitHub + Render deployment

The repository root contains `render.yaml`; the application lives in `chat-app/`.

1. Connect GitHub to Render and select the intended workspace.
2. Create a Blueprint from `https://github.com/salilsen056-svg/chat-app` on `main`.
3. Supply `MONGODB_URI` using a MongoDB Atlas connection string in the Render secret prompt. Never use localhost/127.0.0.1, and never commit credentials.
4. Ensure the Atlas database user can access `hello_chat`, and configure Atlas Network Access to allow the Render service's outbound IP ranges.
5. Apply the Blueprint. The web service uses the free compute plan, Node 22, build `npm ci --include=dev && npm run build`, and start `npm start`.
6. Wait for deployment to become live and check `https://<your-service>.onrender.com/api/health` for `{"status":"ok"}`. This checks MongoDB connectivity too.
7. Verify signup/login, two-browser messaging, reactions, deletion and profile-photo upload on the HTTPS site.

The server uses Render's PORT and binds to 0.0.0.0. Production session cookies require HTTPS. Socket.IO runs in the same web service. Images are stored in MongoDB; a persistent disk is not required.

Free services can sleep after inactivity, so the first visit may take time. Upgrade only if you choose to. Keep one server instance until a shared Socket.IO adapter and distributed rate limiter are added.

Existing local accounts/messages do not automatically migrate to Atlas. A new cloud database starts empty. Keep `.env.local`, node_modules, .next and local database files out of Git.
