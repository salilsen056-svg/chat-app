import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {io as client} from 'socket.io-client';
import {once} from 'node:events';
import {installCalls} from '../lib/calls.mjs';

test('call readiness survives reconnect and distinguishes connected old clients',async()=>{
 const http=createServer(),io=new Server(http),clients=[];
 const a='a'.repeat(24),b='b'.repeat(24);
 io.use((s,next)=>{s.data.user={id:s.handshake.auth.user,name:'Test'};next();});
 const calls=installCalls(io,async()=>true,()=>{});
 http.listen(0,'127.0.0.1');await once(http,'listening');
 const connect=async(user,ready)=>{const s=client(`http://127.0.0.1:${http.address().port}`,{auth:{user,callReady:ready},forceNew:true});clients.push(s);await once(s,'connect');return s;};
 const emit=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
 try{
  const caller=await connect(a,true),chatOnly=await connect(b,false);
  assert.match((await emit(caller,'call:start',{to:b,kind:'voice'})).error,/connected, but calling is not ready/);
  const callee=await connect(b,true);
  let incoming=once(callee,'call:incoming');
  let call=await emit(caller,'call:start',{to:b,kind:'voice'});assert.ok(call.id);await incoming;
  const ended=once(caller,'call:ended');callee.disconnect();await ended;
  callee.connect();await once(callee,'connect');
  incoming=once(callee,'call:incoming');call=await emit(caller,'call:start',{to:b,kind:'video'});assert.ok(call.id);await incoming;
  const endedAgain=once(caller,'call:ended');callee.disconnect();await endedAgain;
  callee.connect();await once(callee,'connect');
  await new Promise(resolve=>chatOnly.emit('call:ready',resolve));
  for(const kind of ['voice','video']){
   const firstRing=once(chatOnly,'call:incoming'),secondRing=once(callee,'call:incoming');
   call=await emit(caller,'call:start',{to:b,kind});assert.ok(call.id);
   await Promise.all([firstRing,secondRing]);
   const answered=once(caller,'call:accepted'),otherStopped=once(chatOnly,'call:ended');
   assert.equal((await emit(callee,'call:accept',{id:call.id})).ok,true);
   await answered;assert.equal((await otherStopped)[0].reason,'Answered on another device');
   assert.ok((await emit(chatOnly,'call:accept',{id:call.id})).error);
   assert.ok((await emit(chatOnly,'call:signal',{id:call.id,signal:{type:'answer',sdp:'fake'}})).error);
   const received=once(callee,'call:signal');
   assert.equal((await emit(caller,'call:signal',{id:call.id,signal:{type:'offer',sdp:'test'}})).ok,true);await received;
   const done=once(caller,'call:ended');callee.emit('call:end',{id:call.id});await done;
  }
  callee.disconnect();chatOnly.disconnect();
  // Acknowledgement proves the server has registered the listener.
  await new Promise(resolve=>caller.timeout(2000).emit('call:ready',(err,result)=>{assert.ifError(err);assert.equal(result.ok,true);resolve();}));
  assert.match((await emit(caller,'call:start',{to:b,kind:'voice'})).error,/not connected right now/);
 }finally{for(const s of clients)s.disconnect();calls.close();await new Promise(resolve=>io.close(resolve));}
});
