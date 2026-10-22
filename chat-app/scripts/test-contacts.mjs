import assert from 'node:assert/strict';
import pg from 'pg';
import sharp from 'sharp';
if(!process.env.TEST_DATABASE_URL)throw Error('Disposable test database required');
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
const base=process.env.API_BASE_URL||'http://127.0.0.1:3002',actors=[];
async function signup(name){const res=await fetch(base+'/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:`contact-${name}-${Date.now()}@example.com`,password:'disposable-test-password'})});assert.equal(res.status,200);const actor={user:(await res.json()).user,cookie:res.headers.get('set-cookie').split(';')[0]};actors.push(actor);return actor;}
const req=(a,path,options={})=>fetch(base+path,{...options,headers:{Cookie:a.cookie,...options.headers}});
try{
 const [a,b,c]=[await signup('A'),await signup('B'),await signup('C')];
 const image=await sharp({create:{width:30,height:30,channels:3,background:'#008060'}}).png().toBuffer();
 assert.equal((await req(a,'/api/profile/photo',{method:'POST',headers:{'Content-Type':'image/png'},body:image})).status,200);
 const avatar=`/api/avatars/${a.user.id}`;
 assert.equal((await req(a,avatar)).status,200);
 assert.equal((await req(b,avatar)).status,404);
 const profile=async viewer=>(await(await req(viewer,'/api/users')).json()).users.find(u=>u.id===a.user.id);
 assert.equal(await profile(b),undefined);
 assert.equal((await req(b,`/api/contacts/${a.user.id}`,{method:'POST'})).status,200);
 assert.equal((await req(b,`/api/contacts/${a.user.id}`,{method:'POST'})).status,200);
 assert.equal((await profile(b)).savedContact,true);assert.equal((await profile(b)).email,a.user.email);
 assert.equal((await req(b,avatar)).status,200);assert.equal((await req(c,avatar)).status,404);
 // Saving is directional: A saving C does not give C access to A.
 await req(a,`/api/contacts/${c.user.id}`,{method:'POST'});assert.equal((await req(c,avatar)).status,404);
 assert.equal((await req(b,`/api/contacts/${a.user.id}`,{method:'DELETE'})).status,200);
 assert.equal((await req(b,avatar)).status,404);assert.equal(await profile(b),undefined);
 assert.equal((await req(b,`/api/contacts/${b.user.id}`,{method:'POST'})).status,400);
 const added=await req(b,'/api/contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.user.email})});assert.equal(added.status,200);
 const list=(await(await req(b,'/api/users')).json()).users;assert.deepEqual(list.map(u=>u.id),[a.user.id]);
 await pool.query('INSERT INTO messages (id,"from","to",conversation,text) VALUES ($1,$2,$3,$4,$5)',['d'.repeat(24),a.user.id,c.user.id,[a.user.id,c.user.id].sort().join(':'),'private A C']);
 const hidden=(await(await req(b,'/api/messages?with='+c.user.id)).json()).messages;assert.equal(hidden.length,0);
 assert.equal((await(await req(b,'/api/users')).json()).users.some(u=>u.id===c.user.id),false);
 await pool.query('DELETE FROM messages WHERE id=$1',['d'.repeat(24)]);
 const mid='e'.repeat(24),conversation=[a.user.id,b.user.id].sort().join(':');
 await pool.query('INSERT INTO messages(id,"from","to",conversation,text) VALUES($1,$2,$3,$4,$5)',[mid,a.user.id,b.user.id,conversation,'Delete chat test']);
 assert.equal((await req(b,'/api/chats/'+a.user.id,{method:'DELETE'})).status,200);
 assert.equal((await(await req(b,'/api/users')).json()).users.some(u=>u.id===a.user.id),false);
 assert.equal((await(await req(b,'/api/messages?with='+a.user.id)).json()).messages.length,0);
 assert.equal((await(await req(a,'/api/messages?with='+b.user.id)).json()).messages.length,1);
 assert.equal((await req(b,avatar)).status,200);
 await pool.query('INSERT INTO messages(id,"from","to",conversation,text) VALUES($1,$2,$3,$4,$5)',['f'.repeat(24),a.user.id,b.user.id,conversation,'New message']);
 assert.equal((await(await req(b,'/api/users')).json()).users.some(u=>u.id===a.user.id),true);
 assert.equal((await(await req(b,'/api/messages?with='+a.user.id)).json()).messages.length,1);
 await req(b,'/api/chats/'+a.user.id,{method:'DELETE'});
 await req(b,'/api/contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.user.email})});
 assert.equal((await(await req(b,'/api/users')).json()).users.some(u=>u.id===a.user.id),true);
 console.log('PASS: delete chat preserves recipient history and saved contact; new messages and explicit reopen restore list entry');
 console.log('PASS: private profile, direct photo access, directional save, duplicate save, third-party denial, and removal revocation');
}finally{for(const a of actors){await pool.query('DELETE FROM messages WHERE "from"=$1 OR "to"=$1',[a.user.id]);await pool.query('DELETE FROM users WHERE id=$1',[a.user.id]);}await pool.end();}
