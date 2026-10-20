import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import next from 'next';
import { MAX_PHOTO_BYTES, preparePhoto } from './lib/profile-photo.mjs';
import env from '@next/env';
import { store, validId, publicMessage } from './lib/database.mjs';
import { Server } from 'socket.io';
import { hashPassword, checkPassword, cookieToken, cleanMessage } from './lib/security.mjs';
env.loadEnvConfig(process.cwd());
const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const app = next({ dev, webpack: true });
await app.prepare();
const digest = token => createHash('sha256').update(token).digest('hex');
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.photoVersion ? `/api/avatars/${u.id}?v=${u.photoVersion}` : null });
async function authenticate(header) {
  const token = cookieToken(header);
  if (!token) return null;
  return store.authenticate(digest(token));
}
async function body(req) {
  let value = ''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 16000) throw new Error('Request too large.'); }
  try { return JSON.parse(value); } catch { throw new Error('Invalid request.'); }
}
const attempts = new Map();
function limit(key, max, window = 60000) {
  const now = Date.now(); if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  let item = attempts.get(key); if (!item || item.until < now) { item = { count: 0, until: now + window }; attempts.set(key, item); }
  if (++item.count > max) throw new Error('Too many requests. Please try again shortly.');
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return app.getRequestHandler()(req, res);
  const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      await store.health();
      return reply(200, { status: 'ok' });
    }
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reply(403, { error: 'Invalid origin.' });
    if (['/api/login','/api/signup'].includes(url.pathname) && req.method === 'POST') {
      limit(`auth:${req.socket.remoteAddress}`, 20);
      const input = await body(req);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = input.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) return reply(400, { error: 'Enter a valid email and a password with 8–128 characters.' });
      let user;
      if (url.pathname === '/api/signup') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 60) return reply(400, { error: 'Enter a name with 1–60 characters.' });
        try { user = await store.createUser(name, email, hashPassword(password)); } catch(e) { if (e.code === '23505') return reply(409, { error: 'An account already exists with this email.' }); throw e; }
      } else {
        user = await store.login(email);
        if (!user || !checkPassword(password, user.password)) return reply(401, { error: 'Email or password is incorrect.' });
      }
      const token = randomBytes(32).toString('hex');
      await store.createSession(digest(token), user.id, new Date(Date.now() + 7 * 86400000));
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${dev ? '' : '; Secure'}`);
      return reply(200, { user: publicUser(user) });
    }
    const user = await authenticate(req.headers.cookie);
    if (!user) return reply(401, { error: 'Please sign in.' });
    const id = user.id;
    if (url.pathname.startsWith('/api/avatars/') && req.method === 'GET') {
      const photoId = url.pathname.slice('/api/avatars/'.length);
      if (!validId(photoId)) return reply(404, { error: 'Photo not found.' });
      const owner = await store.photo(photoId);
      if (!owner?.photo) return reply(404, { error: 'Photo not found.' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(owner.photo);
    }
    if (url.pathname === '/api/profile/photo' && ['POST', 'DELETE'].includes(req.method)) {
      limit(`photo:${id}`, 10);
      if (req.method === 'DELETE') {
        await store.setPhoto(id, null, null);
      } else {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type'])) return reply(400, { error: 'Choose a JPG, PNG or WebP photo.' });
        if (Number(req.headers['content-length']) > MAX_PHOTO_BYTES) return reply(413, { error: 'Photo must be smaller than 2 MB.' });
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_PHOTO_BYTES) return reply(413, { error: 'Photo must be smaller than 2 MB.' }); chunks.push(chunk); }
        let photo;
        try { photo = await preparePhoto(Buffer.concat(chunks)); } catch { return reply(400, { error: 'Invalid photo. Choose a still JPG, PNG or WebP smaller than 2 MB (up to 16 megapixels).' }); }
        await store.setPhoto(id, photo, randomBytes(12).toString('hex'));
      }
      const updated = publicUser(await store.user(id));
      io.emit('profile:updated', { id: updated.id, avatarUrl: updated.avatarUrl });
      return reply(200, { user: updated });
    }
    if (url.pathname === '/api/me' && req.method === 'GET') return reply(200, { user: publicUser(user) });
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      await store.deleteSession(digest(cookieToken(req.headers.cookie)));
      for (const socket of await io.in(id).fetchSockets()) socket.disconnect(true);
      res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return reply(200, { ok: true });
    }
    if (url.pathname === '/api/users' && req.method === 'GET') {
      const users = await store.users(id);
      return reply(200, { users: users.map(u => ({ ...publicUser(u), lastMessage: u.lastMessage ? publicMessage(u.lastMessage) : null })) });
    }
    if (url.pathname === '/api/messages' && req.method === 'GET') {
      const peer = url.searchParams.get('with'); if (!validId(peer || '')) return reply(400, { error: 'Invalid user.' });
      return reply(200, { messages: (await store.history(id, peer)).map(publicMessage) });
    }
    reply(404, { error: 'Not found.' });
  } catch (e) { console.error(e.message); reply(503, { error: /DATABASE_URL/.test(e.message) ? e.message : 'Unable to complete the request. Check the database connection or try again shortly.' }); }
});
const io = new Server(server, { maxHttpBufferSize: 16000, allowRequest: (req, done) => { try { done(null, !req.headers.origin || new URL(req.headers.origin).host === req.headers.host); } catch { done(null, false); } } });
io.use(async (socket, done) => { try { const user = await authenticate(socket.request.headers.cookie); if (!user) return done(new Error('Please sign in.')); socket.data.user = publicUser(user); done(); } catch { done(new Error('Database unavailable.')); } });
io.on('connection', socket => {
  const user = socket.data.user; socket.join(user.id);
  socket.on('message:react', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) return ack({ error: 'Session expired. Please sign in again.' });
      limit(`reaction:${user.id}`, 120);
      if (!validId(input?.id || '') || ![null, '❤️', '👍', '😡', '😄'].includes(input?.emoji)) return ack({ error: 'Invalid reaction.' });
      const message = await store.react(input.id, user.id, input.emoji);
      if (!message) return ack({ error: 'This message is unavailable.' });
      const update = { id: message.id, reactions: message.reactions || {}, reactionVersion: message.reactionVersion };
      io.to(message.from).to(message.to).emit('message:reactions', update);
      ack({ ok: true, ...update });
    } catch { ack({ error: 'Unable to update reaction. Please try again.' }); }
  });
  socket.on('message:delete', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) return ack({ error: 'Session expired. Please sign in again.' });
      limit(`delete:${user.id}`, 60);
      if (!validId(input?.id || '')) return ack({ error: 'Invalid message.' });
      const message = await store.delete(input.id, user.id);
      if (!message) return ack({ error: 'Only the sender can delete this message.' });
      io.to(user.id).to(message.to).emit('message:deleted', { id: message.id, from: user.id, to: message.to });
      ack({ ok: true });
    } catch { ack({ error: 'Unable to delete the message. Please try again.' }); }
  });
  socket.on('message:send', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) { socket.disconnect(); return ack({ error: 'Session expired. Please sign in again.' }); }
      limit(`message:${user.id}`, 60);
      const text = cleanMessage(input?.text), to = input?.to;
      if (!validId(to || '') || to === user.id) throw new Error('Choose a valid recipient.');
      if (!await store.user(to)) throw new Error('User not found.');
      const message = await store.send(user.id, to, text);
      io.to(user.id).to(to).emit('message:new', message); ack({ ok: true });
    } catch(e) { ack({ error: e.message }); }
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Hello Chat: http://localhost:${port}`));
