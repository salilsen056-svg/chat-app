// The source is read-only; the PostgreSQL import is atomic and refuses nonempty targets.
export async function importLegacy(source, pool) {
  const client = await pool.connect();
  const counts = { users: 0, sessions: 0, messages: 0 };
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users,sessions,messages IN ACCESS EXCLUSIVE MODE');
    const existing = await client.query('SELECT (SELECT count(*) FROM users)+(SELECT count(*) FROM messages)+(SELECT count(*) FROM sessions) AS n');
    if (Number(existing.rows[0].n)) throw new Error('Import requires an empty PostgreSQL database. No changes made.');
    for await (const u of source.collection('users').find()) {
      await client.query('INSERT INTO users (id,name,email,password,"createdAt",photo,"photoVersion") VALUES ($1,$2,$3,$4,$5,$6,$7)', [u._id.toString(),u.name,u.email,u.password,u.createdAt || new Date(),u.photo ? Buffer.from(u.photo.buffer) : null,u.photoVersion || null]);
      counts.users++;
    }
    for await (const s of source.collection('sessions').find({ expiresAt: { $gt: new Date() } })) {
      await client.query('INSERT INTO sessions (id,"userId","expiresAt") VALUES ($1,$2,$3)', [s._id,s.userId,s.expiresAt]);counts.sessions++;
    }
    for await (const m of source.collection('messages').find()) {
      await client.query('INSERT INTO messages (id,"from","to",conversation,text,"createdAt",deleted,reactions,"reactionVersion") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [m._id.toString(),m.from,m.to,[m.from,m.to].sort().join(':'),m.deleted ? null : m.text,m.createdAt,!!m.deleted,JSON.stringify(m.deleted ? {} : m.reactions || {}),m.reactionVersion || 0]);counts.messages++;
    }
    await client.query('COMMIT');return counts;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
