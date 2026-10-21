import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),{io}=require('socket.io-client'),{Pool}=require('pg'),sharp=require('sharp');
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable test database and run the app against it on API_BASE_URL.');
const base=process.env.API_BASE_URL||'http://127.0.0.1:3002',pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),ids=[],sockets=[];
const event=(s,n)=>new Promise((r,j)=>{const t=setTimeout(()=>j(Error(n+' timeout')),5000);s.once(n,v=>{clearTimeout(t);r(v);});});
const emit=(s,n,d)=>new Promise((r,j)=>s.timeout(5000).emit(n,d,(e,v)=>e?j(e):r(v)));
async function signup(name){const r=await fetch(base+'/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:name+Date.now()+'@example.com',password:'synthetic-test-only-123'})});assert.equal(r.status,200);const user=(await r.json()).user;ids.push(user.id);return{user,cookie:r.headers.get('set-cookie').split(';')[0]};}
async function connect(actor){const s=io(base,{extraHeaders:{Cookie:actor.cookie},reconnection:false});sockets.push(s);await event(s,'connect');s.emit('call:ready');return s;}
const get=(path,a,options={})=>fetch(base+path,{...options,headers:{Cookie:a.cookie,...options.headers}});
try{
 const a=await signup('StatusAlice'),b=await signup('StatusBob'),c=await signup('StatusCarol'),sa=await connect(a),sb=await connect(b),sc=await connect(c);
 assert.equal((await fetch(base+'/api/statuses')).status,401);assert.equal((await fetch(base+'/api/calls/config')).status,401);
 const data=new FormData();data.set('text','সবার জন্য status');const photo=await sharp({create:{width:120,height:80,channels:3,background:'#008069'}}).png().toBuffer();data.set('file',new Blob([photo],{type:'image/png'}),'status.png');
 let response=await get('/api/statuses',a,{method:'POST',body:data});assert.equal(response.status,200);const status=await response.json();
 const feed=await(await get('/api/statuses',c)).json();assert.equal(feed.statuses.find(s=>s.id===status.id).text,'সবার জন্য status');assert.equal(JSON.stringify(feed).includes('"data"'),false);
 response=await get('/api/statuses/'+status.id+'/media',b,{headers:{Range:'bytes=0-15'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,16);
 assert.equal((await get('/api/statuses/'+status.id,c,{method:'DELETE'})).status,404);
 await pool.query('UPDATE statuses SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[status.id]);assert.equal((await get('/api/statuses/'+status.id+'/media',b)).status,404);assert.equal((await(await get('/api/statuses',b)).json()).statuses.some(s=>s.id===status.id),false);
 console.log('PASS: status shared across accounts, private authentication, validated media/ranges, owner-only deletion and expiry.');
 const incoming=event(sb,'message:new');assert.equal((await emit(sa,'message:send',{to:b.user.id,text:'Read receipt test'})).ok,true);const message=await incoming;
 await emit(sc,'message:receipts',{ids:[message.id],read:true});let row=(await pool.query('SELECT * FROM messages WHERE id=$1',[message.id])).rows[0];assert.equal(row.readAt,null);assert.equal(row.deliveredAt,null);
 let receipt=event(sa,'message:receipt');await emit(sb,'message:receipts',{ids:[message.id]});assert.ok((await receipt).deliveredAt);row=(await pool.query('SELECT * FROM messages WHERE id=$1',[message.id])).rows[0];assert.equal(row.readAt,null);
 receipt=event(sa,'message:receipt');await emit(sb,'message:receipts',{ids:[message.id],read:true});assert.ok((await receipt).readAt);
 const history=await(await get('/api/messages?with='+b.user.id,a)).json();assert.ok(history.messages.find(m=>m.id===message.id).readAt);
 console.log('PASS: delivered vs read receipts persist; unrelated accounts cannot mark a message read.');
 let incomingCall=event(sb,'call:incoming');let call=await emit(sa,'call:start',{to:b.user.id,kind:'video'});assert.ok(call.id);assert.equal((await incomingCall).from.id,a.user.id);
 assert.ok((await emit(sc,'call:start',{to:b.user.id,kind:'voice'})).error);assert.ok((await emit(sc,'call:accept',{id:call.id})).error);
 const accepted=event(sa,'call:accepted');assert.equal((await emit(sb,'call:accept',{id:call.id})).ok,true);await accepted;
 assert.ok((await emit(sc,'call:signal',{id:call.id,signal:{type:'offer',sdp:'fake'}})).error);
 const signal=event(sb,'call:signal');assert.equal((await emit(sa,'call:signal',{id:call.id,signal:{type:'offer',sdp:'synthetic-test-offer'}})).ok,true);assert.equal((await signal).signal.sdp,'synthetic-test-offer');
 let ended=event(sa,'call:ended');sb.emit('call:end',{id:call.id});await ended;
 incomingCall=event(sb,'call:incoming');call=await emit(sa,'call:start',{to:b.user.id,kind:'voice'});await incomingCall;ended=event(sa,'call:ended');sb.disconnect();assert.equal((await ended).reason,'Connection lost');
 assert.ok((await emit(sa,'call:start',{to:b.user.id,kind:'voice'})).error);console.log('PASS: video/voice signaling, participant authorization, busy state, accept/end/disconnect and offline handling.');
}finally{for(const s of sockets)s.disconnect();await pool.query('DELETE FROM messages WHERE "from"=ANY($1::text[]) OR "to"=ANY($1::text[])',[ids]);await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[ids]);await pool.end();}
