import test from 'node:test';
import assert from 'node:assert/strict';
import { store, db, closeDatabase, publicMessage } from '../lib/database.mjs';
import { importLegacy } from '../lib/import-legacy.mjs';
const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
test('PostgreSQL: authorization, atomic reactions, history, expiry and safe legacy import', { skip: !enabled }, async () => {
  const d=await db(); const ids=[];
  try {
    const suffix=Date.now();
    const a=await store.createUser('DB A',`db-a-${suffix}@example.com`,'hash'), b=await store.createUser('DB B',`db-b-${suffix}@example.com`,'hash'), outsider=await store.createUser('DB C',`db-c-${suffix}@example.com`,'hash');ids.push(a.id,b.id,outsider.id);
    await assert.rejects(store.createUser('Duplicate',a.email,'hash'),{code:'23505'});
    const m=await store.send(a.id,b.id,'Hello SQL');
    assert.equal((await store.history(b.id,a.id))[0].text,'Hello SQL');
    assert.equal((await store.history(outsider.id,a.id)).length,0);
    assert.equal((await store.users(b.id)).find(u=>u.id===a.id).lastMessage.text,'Hello SQL');
    assert.equal(await store.react(m.id,outsider.id,'❤️'),undefined);
    await Promise.all([store.react(m.id,a.id,'❤️'),store.react(m.id,b.id,'👍')]);
    let current=(await store.history(a.id,b.id))[0];assert.equal(current.reactions[a.id],'❤️');assert.equal(current.reactions[b.id],'👍');assert.equal(current.reactionVersion,2);
    await store.react(m.id,b.id,null);current=(await store.history(a.id,b.id))[0];assert.equal(current.reactions[b.id],undefined);
    assert.equal(await store.delete(m.id,b.id),undefined);
    current=await store.delete(m.id,a.id);assert.equal(current.text,null);assert.deepEqual(current.reactions,{});assert.equal('text' in publicMessage(current),false);assert.equal(await store.react(m.id,b.id,'❤️'),undefined);
    assert.equal(await store.hide(m.id,outsider.id),undefined);
    assert.equal((await store.hide(m.id,a.id)).id,m.id);
    assert.equal((await store.history(a.id,b.id)).length,0);
    assert.equal((await store.history(b.id,a.id)).length,1);
    assert.equal((await store.users(a.id)).find(u=>u.id===b.id).lastMessage,null);
    assert.equal((await store.hide(m.id,a.id)).id,m.id);
    const beforeClear=await store.send(a.id,b.id,'Before clear');
    await store.clear(b.id,a.id);
    assert.equal((await store.history(b.id,a.id)).length,0);
    assert.equal((await store.history(a.id,b.id)).some(item=>item.id===beforeClear.id),true);
    const afterClear=await store.send(a.id,b.id,'After clear');
    assert.equal((await store.history(b.id,a.id))[0].id,afterClear.id);
    await store.clear(b.id,a.id);assert.deepEqual(await store.clear(b.id,a.id),[]);
    await d.query('INSERT INTO messages (id,"from","to",conversation,text,"createdAt") SELECT lpad(to_hex(g),24,\'0\'),$1,$2,$3,\'Export row \'||g,to_timestamp(1792490000)+interval \'0.000123 seconds\' FROM generate_series(10000,10505) g',[a.id,b.id,[a.id,b.id].sort().join(':')]);
    const exported=[];for await(const row of store.exportMessages(a.id,b.id))exported.push(row);
    const visible=await d.query('SELECT count(*) FROM messages m WHERE conversation=$1 AND NOT EXISTS(SELECT 1 FROM hidden_messages h WHERE h."messageId"=m.id AND h."userId"=$2)',[[a.id,b.id].sort().join(':'),a.id]);
    assert.equal(exported.length,Number(visible.rows[0].count));assert.equal(new Set(exported.map(m=>m.id)).size,exported.length);
    console.log('Verified export pagination beyond 500 rows with identical microsecond timestamps.');
    await store.createSession(`expired-${suffix}`,a.id,new Date(Date.now()-1000));assert.equal(await store.authenticate(`expired-${suffix}`),undefined);
    await store.createSession(`active-${suffix}`,a.id,new Date(Date.now()+60000));assert.equal((await store.authenticate(`active-${suffix}`)).id,a.id);
    await store.setPhoto(a.id,Buffer.from([1,2,3]),'version');assert.deepEqual((await store.photo(a.id)).photo,Buffer.from([1,2,3]));
    await assert.rejects(importLegacy({},d),/empty PostgreSQL/);
    console.log('Verified parameterized PostgreSQL CRUD and concurrency.');
  } finally {
    await d.query('DELETE FROM messages WHERE "from"=ANY($1::text[]) OR "to"=ANY($1::text[])',[ids]);await d.query('DELETE FROM users WHERE id=ANY($1::text[])',[ids]);await closeDatabase();
  }
});
