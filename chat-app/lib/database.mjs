import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
export const newId = () => randomBytes(12).toString('hex');
export const validId = value => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value);
let pool, ready;
export async function db() {
  if (!process.env.DATABASE_URL) throw new Error('Add DATABASE_URL to .env.local, then restart the server.');
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    pool.on('error', () => console.error('PostgreSQL idle connection error.'));
  }
  if (!ready) ready = (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(73912231)');
      for (const file of ['001-initial.sql', '002-media.sql', '003-hidden-messages.sql', '004-status.sql', '005-receipts.sql', '006-contacts.sql']) await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  })().catch(error => { ready = undefined; throw error; });
  await ready;
  return pool;
}
export async function closeDatabase() { if (pool) await pool.end(); pool = undefined; ready = undefined; }
const one = async (sql, args) => (await (await db()).query(sql, args)).rows[0];
export const store = {
  canViewProfile: async (viewer,subject) => viewer===subject || Boolean(await one('SELECT 1 FROM contacts WHERE "ownerId"=$1 AND "contactId"=$2',[viewer,subject])),
  saveContact: (viewer,subject) => one('INSERT INTO contacts ("ownerId","contactId") VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING "contactId"',[viewer,subject]),
  removeContact: (viewer,subject) => one('DELETE FROM contacts WHERE "ownerId"=$1 AND "contactId"=$2 RETURNING "contactId"',[viewer,subject]),
  async profileViewers(subject){return(await(await db()).query('SELECT "ownerId" FROM contacts WHERE "contactId"=$1',[subject])).rows.map(r=>r.ownerId);},
  async receipts(userId,ids,read){return(await(await db()).query('UPDATE messages SET "deliveredAt"=coalesce("deliveredAt",now()),"readAt"=CASE WHEN $3 THEN coalesce("readAt",now()) ELSE "readAt" END WHERE "to"=$1 AND id=ANY($2::text[]) AND NOT deleted AND ("deliveredAt" IS NULL OR ($3 AND "readAt" IS NULL)) RETURNING id,"from","to","deliveredAt","readAt"',[userId,ids,read])).rows;},
  async delivered(userId){return(await(await db()).query('UPDATE messages SET "deliveredAt"=now() WHERE "to"=$1 AND "deliveredAt" IS NULL AND NOT deleted RETURNING id,"from","to","deliveredAt","readAt"',[userId])).rows;},
  health: () => one('SELECT 1 AS ok'),
  user: id => one('SELECT id,name,email,"photoVersion" FROM users WHERE id=$1', [id]),
  login: email => one('SELECT id,name,email,password,"photoVersion" FROM users WHERE email=$1', [email]),
  createUser: (name,email,password) => one('INSERT INTO users (id,name,email,password) VALUES ($1,$2,$3,$4) RETURNING id,name,email,"photoVersion"', [newId(),name,email,password]),
  authenticate: digest => one('SELECT u.id,u.name,u.email,u."photoVersion" FROM sessions s JOIN users u ON u.id=s."userId" WHERE s.id=$1 AND s."expiresAt">now()', [digest]),
  async createSession(id,userId,expiresAt) {
    const d = await db();
    await d.query('DELETE FROM sessions WHERE "expiresAt" < now()');
    await d.query('INSERT INTO sessions (id,"userId","expiresAt") VALUES ($1,$2,$3)', [id,userId,expiresAt]);
  },
  deleteSession: id => one('DELETE FROM sessions WHERE id=$1 RETURNING id', [id]),
  photo: id => one('SELECT photo FROM users WHERE id=$1', [id]),
  setPhoto: (id,photo,version) => one('UPDATE users SET photo=$2,"photoVersion"=$3 WHERE id=$1 RETURNING id,name,email,"photoVersion"', [id,photo,version]),
  async users(id) {
    const result = await (await db()).query(`SELECT u.id,u.name,u.email,u."photoVersion", EXISTS(SELECT 1 FROM contacts c WHERE c."ownerId"=$1 AND c."contactId"=u.id) AS "savedContact", row_to_json(latest) AS "lastMessage" FROM users u LEFT JOIN LATERAL
      (SELECT id,"from","to",text,deleted,"createdAt","deliveredAt","readAt","mediaType","mediaName","mediaMime","mediaSize" FROM messages WHERE NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h."userId"=$1 AND h."messageId"=messages.id) AND conversation=least(u.id,$1)||':'||greatest(u.id,$1) ORDER BY "createdAt" DESC,id DESC LIMIT 1) latest ON true
      WHERE u.id<>$1 ORDER BY u.name LIMIT 200`, [id]);
    return result.rows;
  },
  async history(id,peer) {
    const result=await (await db()).query('SELECT * FROM (SELECT * FROM messages WHERE conversation=$1 AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h."userId"=$2 AND h."messageId"=messages.id) ORDER BY "createdAt" DESC,id DESC LIMIT 100) recent ORDER BY "createdAt",id', [[id,peer].sort().join(':'),id]);
    return result.rows;
  },
  send: (from,to,text) => one('INSERT INTO messages (id,"from","to",text,conversation) VALUES ($1,$2,$3,$4,$5) RETURNING *', [newId(),from,to,text,[from,to].sort().join(':')]),
  react: (id,userId,emoji) => one(`UPDATE messages SET reactions=CASE WHEN $3::text IS NULL THEN reactions-$2::text ELSE jsonb_set(reactions,ARRAY[$2::text],to_jsonb($3::text),true) END,
    "reactionVersion"="reactionVersion"+1 WHERE id=$1 AND ("from"=$2 OR "to"=$2) AND NOT deleted RETURNING *`, [id,userId,emoji]),
  async sendMedia(from,to,text,media) {
    const client=await (await db()).connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(73912232)');
      const used=await client.query('SELECT (SELECT coalesce(sum(octet_length(data)),0) FROM message_media)+(SELECT coalesce(sum(octet_length(data)),0) FROM statuses WHERE "expiresAt">now()) AS bytes');
      if (Number(used.rows[0].bytes)+media.data.length>250*1024*1024) throw new Error('Media storage is full. Delete some sent media before uploading more.');
      const result=await client.query('INSERT INTO messages (id,"from","to",text,conversation,"mediaType","mediaName","mediaMime","mediaSize") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [newId(),from,to,text || (media.type==='image' ? '📷 Photo' : '🎬 Video'),[from,to].sort().join(':'),media.type,media.name,media.mime,media.data.length]);
      await client.query('INSERT INTO message_media ("messageId",data) VALUES ($1,$2)', [result.rows[0].id,media.data]);
      await client.query('COMMIT');return result.rows[0];
    } catch(e) { await client.query('ROLLBACK');throw e; }
    finally {client.release();}
  },
  mediaInfo: (id,userId) => one('SELECT m."mediaMime",m."mediaName",octet_length(b.data) AS size FROM messages m JOIN message_media b ON b."messageId"=m.id WHERE m.id=$1 AND (m."from"=$2 OR m."to"=$2) AND NOT m.deleted AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h."userId"=$2 AND h."messageId"=m.id)', [id,userId]),
  mediaBytes: (id,userId,start,length) => one('SELECT substring(b.data,$3::int,$4::int) AS data FROM messages m JOIN message_media b ON b."messageId"=m.id WHERE m.id=$1 AND (m."from"=$2 OR m."to"=$2) AND NOT m.deleted AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h."userId"=$2 AND h."messageId"=m.id)', [id,userId,start+1,length]),
  async *exportMessages(userId,peerId) {
    const client=await (await db()).connect();let committed=false;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      let time=null,lastId=null;
      for(;;){
        const result=await client.query('SELECT m.*,m."createdAt"::text AS "_cursorTime",u.name AS "senderName" FROM messages m JOIN users u ON u.id=m."from" WHERE m.conversation=$1 AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h."userId"=$2 AND h."messageId"=m.id) AND ($3::timestamptz IS NULL OR (m."createdAt",m.id)>($3::timestamptz,$4::text)) ORDER BY m."createdAt",m.id LIMIT 500', [[userId,peerId].sort().join(':'),userId,time,lastId]);
        for(const row of result.rows)yield row;
        if(result.rows.length<500)break;
        const last=result.rows.at(-1);time=last._cursorTime;lastId=last.id;
      }
      await client.query('COMMIT');committed=true;
    }finally{if(!committed)await client.query('ROLLBACK').catch(()=>{});client.release();}
  },
  async clear(userId,peerId) {
    const result=await (await db()).query('INSERT INTO hidden_messages ("userId","messageId") SELECT $1,id FROM messages WHERE conversation=$2 ON CONFLICT ("userId","messageId") DO NOTHING RETURNING "messageId" AS id',[userId,[userId,peerId].sort().join(':')]);
    return result.rows.map(m=>m.id);
  },
  hide: (id,userId) => one('INSERT INTO hidden_messages ("userId","messageId") SELECT $2,id FROM messages WHERE id=$1 AND ("from"=$2 OR "to"=$2) ON CONFLICT ("userId","messageId") DO UPDATE SET "hiddenAt"=hidden_messages."hiddenAt" RETURNING "messageId" AS id', [id,userId]),
  async delete(id,userId) {
    const client=await (await db()).connect();
    try {
      await client.query('BEGIN');
      const result=await client.query('UPDATE messages SET deleted=true,text=NULL,reactions=\'{}\'::jsonb,"mediaType"=NULL,"mediaName"=NULL,"mediaMime"=NULL,"mediaSize"=NULL WHERE id=$1 AND "from"=$2 RETURNING *', [id,userId]);
      if(result.rows[0]) await client.query('DELETE FROM message_media WHERE "messageId"=$1',[id]);
      await client.query('COMMIT');return result.rows[0];
    } catch(e) {await client.query('ROLLBACK');throw e;}
    finally {client.release();}
  },
};
export function publicMessage(m) {
  if (!m.deleted) return m;
  const { text, reactions, ...rest } = m;
  return rest;
}
