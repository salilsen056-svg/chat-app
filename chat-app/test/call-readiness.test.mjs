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
  chatOnly.disconnect();
  // Acknowledgement proves the server has registered the listener.
  await new Promise(resolve=>caller.timeout(2000).emit('call:ready',(err,result)=>{assert.ifError(err);assert.equal(result.ok,true);resolve();}));
  assert.match((await emit(caller,'call:start',{to:b,kind:'voice'})).error,/not connected right now/);
 }finally{for(const s of clients)s.disconnect();calls.close();await new Promise(resolve=>io.close(resolve));}
});
