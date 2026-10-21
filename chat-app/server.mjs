import { callConfiguration } from './lib/ice-config.mjs';
import { statusStore } from './lib/status-store.mjs';
import { installCalls } from './lib/calls.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exportLine } from './lib/chat-export.mjs';
import { randomBytes, createHash } from 'node:crypto';
import next from 'next';
import { MAX_PHOTO_BYTES, preparePhoto } from './lib/profile-photo.mjs';
import env from '@next/env';
import { BODY_LIMIT, prepareMedia, byteRange } from './lib/media.mjs';
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
    if(url.pathname==='/api/calls/config' && req.method==='GET') {
      try{return reply(200,await callConfiguration());}catch{return reply(503,{error:'Call relay is unavailable. Check the TURN server configuration.'});}
    }
    if(url.pathname==='/api/statuses'){
      if(req.method==='GET')return reply(200,{statuses:await statusStore.list()});
      if(req.method==='POST'){
        limit('status:'+id,10);const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>BODY_LIMIT)return reply(413,{error:'Upload exceeds 10 MB.'});chunks.push(chunk);}
        let text,media;
        try{
          const data=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']||''}}).formData();
          text=data.get('text')||'';if(typeof text!=='string'||text.length>2000)throw Error('Status must be at most 2000 characters.');
          text=text.trim();const file=data.get('file');if(file?.size)media=await prepareMedia(Buffer.from(await file.arrayBuffer()),file.type,file.name);
          if(!text&&!media)throw Error('Add text, a photo or a video.');
        }catch(e){return reply(400,{error:e.message});}
        if(!await authenticate(req.headers.cookie))return reply(401,{error:'Please sign in again.'});
        try{const status=await statusStore.create(id,text,media);io.emit('status:updated');return reply(200,status);}catch(e){if(e.message.startsWith('Media storage'))return reply(507,{error:e.message});throw e;}
      }
    }
    if(url.pathname.startsWith('/api/statuses/')){
      const parts=url.pathname.split('/'),statusId=parts[3];if(!validId(statusId))return reply(404,{error:'Status not found.'});
      if(parts.length===4 && req.method==='DELETE'){if(!await statusStore.remove(statusId,id))return reply(404,{error:'Status not found.'});io.emit('status:updated');return reply(200,{ok:true});}
      if(parts[4]==='media' && parts.length===5 && ['GET','HEAD'].includes(req.method)){
        const media=await statusStore.media(statusId);if(!media)return reply(404,{error:'Status expired or removed.'});
        const range=byteRange(req.headers.range,media.data.length);if(!range){res.writeHead(416,{'Content-Range':'bytes */'+media.data.length});return res.end();}
        const headers={'Content-Type':media.mediaMime,'Content-Length':range.end-range.start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
        if(range.partial)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+media.data.length;
        res.writeHead(range.partial?206:200,headers);return res.end(req.method==='HEAD'?undefined:media.data.subarray(range.start,range.end+1));
      }
    }
    if (url.pathname === '/api/messages/export' && req.method === 'GET') {
      limit(`export:${id}`,10);
      const peerId=url.searchParams.get('with');
      if(!validId(peerId)||peerId===id)return reply(400,{error:'Invalid conversation.'});
      const peer=await store.user(peerId);if(!peer)return reply(404,{error:'User not found.'});
      async function* content(){
        yield `\uFEFFHello Chat - Conversation export\n${user.name.replace(/[\r\n]/g,' ')} & ${peer.name.replace(/[\r\n]/g,' ')}\nExported: ${new Date().toISOString()}\nTimes are UTC. Media files are not embedded.\nMessages removed with Delete for me or Clear chat are excluded.\n\n`;
        for await(const message of store.exportMessages(id,peerId))yield exportLine(message);
      }
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="chat-export-${peerId}.txt"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      await pipeline(Readable.from(content()),res);return;
    }
    if (url.pathname === '/api/messages/media' && req.method === 'POST') {
      limit(`upload:${id}`,10);
      const to=url.searchParams.get('to');
      if (!validId(to) || to===id || !await store.user(to)) return reply(400,{error:'Choose a valid recipient.'});
      if (!req.headers['content-type']?.startsWith('multipart/form-data;')) return reply(400,{error:'Choose a photo or video to upload.'});
      if (Number(req.headers['content-length'])>BODY_LIMIT) return reply(413,{error:'Upload exceeds the 10 MB limit.'});
      const chunks=[];let bytes=0;
      for await (const chunk of req) { bytes+=chunk.length;if(bytes>BODY_LIMIT)return reply(413,{error:'Upload exceeds the 10 MB limit.'});chunks.push(chunk); }
      let media,caption;
      try {
        const data=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']}}).formData();
        const file=data.get('file');caption=data.get('caption') || '';
        if (!file || typeof file.arrayBuffer!=='function') throw new Error('Choose a photo or video.');
        if (typeof caption!=='string' || caption.length>2000) throw new Error('Caption must be at most 2000 characters.');
        media=await prepareMedia(Buffer.from(await file.arrayBuffer()),file.type,file.name);
      } catch(e) {return reply(400,{error:e.message.startsWith('Choose') || /limit|smaller|must be|invalid|match/.test(e.message) ? e.message : 'Unable to read this file. Choose a JPG, PNG, WebP, MP4 or WebM.'});}
      if (!await authenticate(req.headers.cookie)) return reply(401,{error:'Session expired. Please sign in again.'});
      let message;
      try {message=await store.sendMedia(id,to,caption.trim(),media);} catch(e) {if(e.message.startsWith('Media storage'))return reply(507,{error:e.message});throw e;}
      io.to(id).to(to).emit('message:new',message);
      return reply(200,{message});
    }
    if (url.pathname.startsWith('/api/media/') && ['GET','HEAD'].includes(req.method)) {
      const messageId=url.pathname.slice('/api/media/'.length);
      if (!validId(messageId))return reply(404,{error:'Media not found.'});
      const info=await store.mediaInfo(messageId,id);
      if(!info)return reply(404,{error:'Media not found.'});
      const range=byteRange(req.headers.range,info.size);
      if(!range){res.writeHead(416,{'Content-Range':`bytes */${info.size}`,'Cache-Control':'no-store'});return res.end();}
      const length=range.end-range.start+1;
      const headers={'Content-Type':info.mediaMime,'Accept-Ranges':'bytes','Content-Length':length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(info.mediaName).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`};
      if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${info.size}`;
      if(req.method==='HEAD'){res.writeHead(range.partial?206:200,headers);return res.end();}
      const file=await store.mediaBytes(messageId,id,range.start,length);
      if(!file)return reply(404,{error:'Media not found.'});
      res.writeHead(range.partial?206:200,headers);return res.end(file.data);
    }
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
  } catch (e) { console.error(e.message); if(res.headersSent){res.destroy();return;} reply(503, { error: /DATABASE_URL/.test(e.message) ? e.message : 'Unable to complete the request. Check the database connection or try again shortly.' }); }
});
const io = new Server(server, { maxHttpBufferSize: 65536, allowRequest: (req, done) => { try { done(null, !req.headers.origin || new URL(req.headers.origin).host === req.headers.host); } catch { done(null, false); } } });
io.use(async (socket, done) => { try { const user = await authenticate(socket.request.headers.cookie); if (!user) return done(new Error('Please sign in.')); socket.data.user = publicUser(user); done(); } catch { done(new Error('Database unavailable.')); } });
installCalls(io,authenticate,limit);
io.on('connection', socket => {
  const user = socket.data.user; socket.join(user.id);
  store.delivered(user.id).then(rows=>{for(const m of rows)io.to(m.from).to(user.id).emit('message:receipt',m);}).catch(()=>{});

  socket.on('message:receipts',async(input,ack)=>{
    if(typeof ack!=='function')return;
    try{
      if(!await authenticate(socket.request.headers.cookie))throw Error('Session expired.');
      limit('receipts:'+user.id,120);
      if(!Array.isArray(input?.ids)||input.ids.length>100||input.ids.some(id=>!validId(id)))throw Error('Invalid receipt.');
      const rows=await store.receipts(user.id,input.ids,input.read===true);
      for(const m of rows)io.to(m.from).to(user.id).emit('message:receipt',m);
      ack({ok:true});
    }catch(e){ack({error:e.message});}
  });
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
  socket.on('chat:clear', async (input, ack) => {
    if(typeof ack!=='function')return;
    try {
      if(!await authenticate(socket.request.headers.cookie))return ack({error:'Session expired. Please sign in again.'});
      limit(`clear:${user.id}`,10);
      if(!validId(input?.with)||input.with===user.id||!await store.user(input.with))return ack({error:'Invalid conversation.'});
      const ids=await store.clear(user.id,input.with);
      const result={with:input.with,ids};
      io.to(user.id).emit('chat:cleared',result);ack({ok:true,...result});
    }catch{ack({error:'Unable to clear this chat. Please try again.'});}
  });
  socket.on('message:hide', async (input, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!await authenticate(socket.request.headers.cookie)) return ack({error:'Session expired. Please sign in again.'});
      limit(`hide:${user.id}`,60);
      if (!validId(input?.id || '')) return ack({error:'Invalid message.'});
      const hidden=await store.hide(input.id,user.id);
      if(!hidden)return ack({error:'This message is unavailable.'});
      io.to(user.id).emit('message:hidden',{id:input.id});
      ack({ok:true,id:input.id});
    }catch {ack({error:'Unable to remove this message. Please try again.'});}
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
