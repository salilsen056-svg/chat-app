import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {prepareMedia,IMAGE_LIMIT,VIDEO_LIMIT} from '../lib/media.mjs';
const base='http://127.0.0.1:3002',sockets=[];
const req=(a,path,method='GET',body)=>fetch(base+path,{method,headers:{Cookie:a.cookie,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
async function signup(name){const r=await fetch(base+'/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:name+Date.now()+'@example.com',password:'test-password-123'})});assert.equal(r.status,200);return{...(await r.json()),cookie:r.headers.get('set-cookie').split(';')[0]};}
async function connect(a){const s=io(base,{extraHeaders:{Cookie:a.cookie}});sockets.push(s);await new Promise((r,j)=>{s.on('connect',r);s.on('connect_error',j)});s.emit('call:ready');return s;}
const emit=(s,e,p)=>new Promise((r,j)=>s.timeout(3000).emit(e,p,(err,result)=>err?j(err):r(result)));
try{
 const a=await signup('GroupA'),b=await signup('GroupB'),c=await signup('Outsider');
 await req(a,'/api/contacts/'+b.user.id,'POST');
 let r=await req(a,'/api/groups','POST',{name:'Test group',members:[b.user.id]});assert.equal(r.status,200);const g=(await r.json()).group.id;
 assert.equal((await req(b,'/api/groups/'+g+'/messages','POST',{text:'Hello group'})).status,200);
 assert.equal((await(await req(a,'/api/groups/'+g+'/messages')).json()).messages.length,1);
 assert.equal((await req(c,'/api/groups/'+g+'/messages')).status,404);
 assert.equal((await req(c,'/api/groups/'+g+'/messages','POST',{text:'Intruder'})).status,404);
 const video=Buffer.alloc(VIDEO_LIMIT);video.writeUInt32BE(24,0);video.write('ftyp',4);
 assert.equal((await prepareMedia(video,'video/mp4','test.mp4')).data.length,VIDEO_LIMIT);
 await assert.rejects(prepareMedia(Buffer.alloc(VIDEO_LIMIT+1),'video/mp4','too-large.mp4'));
 await assert.rejects(prepareMedia(Buffer.alloc(IMAGE_LIMIT+1),'image/png','too-large.png'));
 const form=new FormData();form.set('file',new Blob([video],{type:'video/mp4'}),'limit.mp4');
 r=await req(a,'/api/messages/media?to='+b.user.id,'POST',form);assert.equal(r.status,200,await r.text());
 const audio=Buffer.alloc(32);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(audio);audio.write('webm',8);
 const voice=new FormData();voice.set('file',new Blob([audio],{type:'audio/webm'}),'voice.webm');
 r=await req(a,'/api/messages/media?to='+b.user.id,'POST',voice);assert.equal(r.status,200);assert.equal((await r.json()).message.mediaType,'audio');
 const sa=await connect(a),sb=await connect(b);
 assert.equal((await req(a,'/api/blocks/'+b.user.id,'POST')).status,200);
 assert.ok((await emit(sb,'message:send',{to:a.user.id,text:'blocked'})).error);
 assert.ok((await emit(sb,'call:start',{to:a.user.id,kind:'voice'})).error);
 assert.equal((await req(b,'/api/messages/media?to='+a.user.id,'POST',voice)).status,403);
 assert.equal((await(await req(b,'/api/contacts/'+a.user.id,'POST')).json()).user.profileVisible,false);
 assert.equal((await req(b,'/api/groups/'+g+'/messages','POST',{text:'Shared group remains'})).status,200);
 await req(a,'/api/blocks/'+b.user.id,'DELETE');
 assert.equal((await emit(sb,'message:send',{to:a.user.id,text:'unblocked'})).ok,true);
 await req(b,'/api/groups/'+g,'DELETE');
 assert.equal((await req(b,'/api/groups/'+g+'/messages')).status,404);
 console.log('PASS: 30MB video stored, oversized media rejected, audio stored, block/unblock text/media/calls, group membership and leave privacy');
}finally{for(const s of sockets)s.disconnect();}
