import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import next from 'next';
import { MAX_PHOTO_BYTES, preparePhoto } from './lib/profile-photo.mjs';
import env from '@next/env';
import { MongoClient, ObjectId } from 'mongodb';
import { Server } from 'socket.io';
import { hashPassword, checkPassword, cookieToken, cleanMessage } from './lib/security.mjs';
env.loadEnvConfig(process.cwd());
const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const app = next({ dev, webpack: true });
await app.prepare();
let database;
async function db() {
  if (!process.env.MONGODB_URI) throw new Error('Add MONGODB_URI to .env.local, then restart the server.');
  if (!database) database = (async () => {
    const client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).connect();
    const d = client.db(process.env.MONGODB_DB || 'hello_chat');
    await Promise.all([d.collection('users').createIndex({ email: 1 }, { unique: true }), d.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), d.collection('messages').createIndex({ conversation: 1, createdAt: -1 })]);
    return d;
  })().catch(e => { database = undefined; throw e; });
  return database;
}
const digest = token => createHash('sha256').update(token).digest('hex');
const publicUser = u => ({ id: u._id.toString(), name: u.name, email: u.email, avatarUrl: u.photoVersion ? `/api/avatars/${u._id.toString()}?v=${u.photoVersion}` : null });
async function authenticate(header) {
  const token = cookieToken(header);
  if (!token) return null;
  const d = await db();
  const session = await d.collection('sessions').findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
  return session ? d.collection('users').findOne({ _id: new ObjectId(session.userId) }) : null;
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
      await (await db()).command({ ping: 1 });
      return reply(200, { status: 'ok' });
    }
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reply(403, { error: 'Invalid origin.' });
    if (['/api/login','/api/signup'].includes(url.pathname) && req.method === 'POST') {
      limit(`auth:${req.socket.remoteAddress}`, 20);
      const input = await body(req);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = input.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) return reply(400, { error: 'Enter a valid email and a password with 8–128 characters.' });
      const d = await db(); let user;
      if (url.pathname === '/api/signup') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 60) return reply(400, { error: 'Enter a name with 1–60 characters.' });
        user = { name, email, password: hashPassword(password), createdAt: new Date() };
        try { user._id = (await d.collection('users').insertOne(user)).insertedId; } catch(e) { if (e.code === 11000) return reply(409, { error: 'An account already exists with this email.' }); throw e; }
      } else {
        user = await d.collection('users').findOne({ email });
        if (!user || !checkPassword(password, user.password)) return reply(401, { error: 'Email or password is incorrect.' });
      }
      const token = randomBytes(32).toString('hex');
      await d.collection('sessions').insertOne({ _id: digest(token), userId: user._id.toString(), expiresAt: new Date(Date.now() + 7 * 86400000) });
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${dev ? '' : '; Secure'}`);
      return reply(200, { user: publicUser(user) });
    }
    const user = await authenticate(req.headers.cookie);
    if (!user) return reply(401, { error: 'Please sign in.' });
    const id = user._id.toString();
    if (url.pathname.startsWith('/api/avatars/') && req.method === 'GET') {
      const photoId = url.pathname.slice('/api/avatars/'.length);
      if (!ObjectId.isValid(photoId)) return reply(404, { error: 'Photo not found.' });
      const owner = await (await db()).collection('users').findOne({ _id: new ObjectId(photoId) }, { projection: { photo: 1 } });
      if (!owner?.photo) return reply(404, { error: 'Photo not found.' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(Buffer.from(owner.photo.buffer));
    }
    if (url.pathname === '/api/profile/photo' && ['POST', 'DELETE'].includes(req.method)) {
      limit(`photo:${id}`, 10);
      const d = await db();
      if (req.method === 'DELETE') {
        await d.collection('users').updateOne({ _id: user._id }, { $unset: { photo: '', photoVersion: '' } });
      } else {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type'])) return reply(400, { error: 'Choose a JPG, PNG or WebP photo.' });
        if (Number(req.headers['content-length']) > MAX_PHOTO_BYTES) return reply(413, { error: 'Photo must be smaller than 2 MB.' });
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_PHOTO_BYTES) return reply(413, { error: 'Photo must be smaller than 2 MB.' }); chunks.push(chunk); }
        let photo;
        try { photo = await preparePhoto(Buffer.concat(chunks)); } catch { return reply(400, { error: 'Invalid photo. Choose a still JPG, PNG or WebP smaller than 2 MB (up to 16 megapixels).' }); }
        await d.collection('users').updateOne({ _id: user._id }, { $set: { photo, photoVersion: randomBytes(12).toString('hex') } });
      }
      const updated = publicUser(await d.collection('users').findOne({ _id: user._id }, { projection: { photo: 0, password: 0 } }));
      io.emit('profile:updated', { id: updated.id, avatarUrl: updated.avatarUrl });
      return reply(200, { user: updated });
    }
    if (url.pathname === '/api/me' && req.method === 'GET') return reply(200, { user: publicUser(user) });
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      await (await db()).collection('sessions').deleteOne({ _id: digest(cookieToken(req.headers.cookie)) });
      for (const socket of await io.in(id).fetchSockets()) socket.disconnect(true);
      res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return reply(200, { ok: true });
    }
    if (url.pathname === '/api/users' && req.method === 'GET') {
      const users = await (await db()).collection('users').find({ _id: { $ne: user._id } }, { projection: { photo: 0, password: 0 } }).sort({ name: 1 }).limit(200).toArray();
      const latest = await (await db()).collection('messages').aggregate([
        { $match: { $or: [{ from: id }, { to: id }] } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$conversation', message: { $first: '$$ROOT' } } },
        { $project: { 'message._id': 1, 'message.text': 1, 'message.from': 1, 'message.to': 1, 'message.deleted': 1, 'message.createdAt': 1 } }
      ]).toArray();
      const previews = new Map(latest.map(({ message }) => [message.from === id ? message.to : message.from, message]));
      return reply(200, { users: users.map(u => ({ ...publicUser(u), lastMessage: previews.get(u._id.toString()) || null })) });
    }
    if (url.pathname === '/api/messages' && req.method === 'GET') {
      const peer = url.searchParams.get('with'); if (!ObjectId.isValid(peer || '')) return reply(400, { error: 'Invalid user.' });
      const messages = await (await db()).collection('messages').find({ conversation: [id, peer].sort().join(':') }).sort({ createdAt: -1 }).limit(100).toArray();
      return reply(200, { messages: messages.reverse().map(m => ({ ...m, id: m._id.toString() })) });
    }
    reply(404, { error: 'Not found.' });
  } catch (e) { console.error(e.message); reply(503, { error: /MONGODB_URI/.test(e.message) ? e.message : 'Unable to complete the request. Check the database connection or try again shortly.' }); }
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
      if (!ObjectId.isValid(input?.id || '') || ![null, '❤️', '👍', '😡', '😄'].includes(input?.emoji)) return ack({ error: 'Invalid reaction.' });
      const d = await db();
      const field = `reactions.${user.id}`;
      const change = input.emoji === null ? { $unset: { [field]: '' } } : { $set: { [field]: input.emoji } };
      const message = await d.collection('messages').findOneAndUpdate(
        { _id: new ObjectId(input.id), deleted: { $ne: true }, $or: [{ from: user.id }, { to: user.id }] },
        { ...change, $inc: { reactionVersion: 1 } }, { returnDocument: 'after' }
      );
      if (!message) return ack({ error: 'This message is unavailable.' });
      const update = { id: message._id.toString(), reactions: message.reactions || {}, reactionVersion: message.reactionVersion };
      io.to(message.from).to(message.to).emit('message:reactions', update);
      ack({ ok: true, ...update });
    } catch { ack({ error: 'Unable to update reaction. Please try again.' }); }
  });
  socket.on('message:delete', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) return ack({ error: 'Session expired. Please sign in again.' });
      limit(`delete:${user.id}`, 60);
      if (!ObjectId.isValid(input?.id || '')) return ack({ error: 'Invalid message.' });
      const d = await db();
      const message = await d.collection('messages').findOneAndUpdate(
        { _id: new ObjectId(input.id), from: user.id },
        { $set: { deleted: true }, $unset: { text: '', reactions: '' } },
        { returnDocument: 'after' }
      );
      if (!message) return ack({ error: 'Only the sender can delete this message.' });
      io.to(user.id).to(message.to).emit('message:deleted', { id: message._id.toString(), from: user.id, to: message.to });
      ack({ ok: true });
    } catch { ack({ error: 'Unable to delete the message. Please try again.' }); }
  });
  socket.on('message:send', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) { socket.disconnect(); return ack({ error: 'Session expired. Please sign in again.' }); }
      limit(`message:${user.id}`, 60);
      const text = cleanMessage(input?.text), to = input?.to;
      if (!ObjectId.isValid(to || '') || to === user.id) throw new Error('Choose a valid recipient.');
      const d = await db(); if (!await d.collection('users').findOne({ _id: new ObjectId(to) })) throw new Error('User not found.');
      const message = { from: user.id, to, text, conversation: [user.id, to].sort().join(':'), createdAt: new Date() };
      message.id = (await d.collection('messages').insertOne({ ...message })).insertedId.toString();
      io.to(user.id).to(to).emit('message:new', message); ack({ ok: true });
    } catch(e) { ack({ error: e.message }); }
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Hello Chat: http://localhost:${port}`));
