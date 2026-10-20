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
    await store.createSession(`expired-${suffix}`,a.id,new Date(Date.now()-1000));assert.equal(await store.authenticate(`expired-${suffix}`),undefined);
    await store.createSession(`active-${suffix}`,a.id,new Date(Date.now()+60000));assert.equal((await store.authenticate(`active-${suffix}`)).id,a.id);
    await store.setPhoto(a.id,Buffer.from([1,2,3]),'version');assert.deepEqual((await store.photo(a.id)).photo,Buffer.from([1,2,3]));
    await assert.rejects(importLegacy({},d),/empty PostgreSQL/);
    console.log('Verified parameterized PostgreSQL CRUD and concurrency.');
  } finally {
    await d.query('DELETE FROM messages WHERE "from"=ANY($1::text[]) OR "to"=ANY($1::text[])',[ids]);await d.query('DELETE FROM users WHERE id=ANY($1::text[])',[ids]);await closeDatabase();
  }
});
