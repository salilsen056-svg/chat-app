import { randomBytes } from 'node:crypto';
// One live call per account. Signaling is scoped to the exact two sockets.
export function installCalls(io, authenticate, limit, profileFor=async user=>({id:user.id,name:user.name})) {
 const calls=new Map(), busy=new Map();
 const finish=(call,reason)=>{clearTimeout(call.timer);calls.delete(call.id);busy.delete(call.from);busy.delete(call.to);io.to([call.caller,...call.targets]).emit('call:ended',{id:call.id,reason});};
 io.on('connection',socket=>{
  const user=socket.data.user;
  socket.data.callReady=socket.handshake.auth?.callReady===true;
  socket.on('call:ready',(ack)=>{socket.data.callReady=true;if(typeof ack==='function')ack({ok:true});});
  socket.on('call:not-ready',()=>{socket.data.callReady=false;});
  const authorized=()=>authenticate(socket.request.headers.cookie);
  socket.on('call:start',async(input,ack)=>{if(typeof ack!=='function')return;try{
   if(!await authorized())throw Error('Please sign in again.');limit(`call:${user.id}`,10);
   if(!/^[0-9a-f]{24}$/.test(input?.to)||input.to===user.id||!['voice','video'].includes(input.kind))throw Error('Invalid call.');
   if(busy.has(user.id)||busy.has(input.to))throw Error('One of you is already on a call.');
   const peers=[...io.sockets.sockets.values()].filter(s=>s.connected&&s.data.user?.id===input.to);
   const targets=peers.filter(s=>s.data.callReady).map(s=>s.id);
   if(!targets.length)throw Error(peers.length?'This person is connected, but calling is not ready. Ask them to refresh the app.':'This person is not connected right now. Ask them to reopen the app.');
   const callerProfile=await profileFor(user,input.to);
   if(busy.has(user.id)||busy.has(input.to))throw Error('One of you is already on a call.');
   const call={id:randomBytes(12).toString('hex'),from:user.id,to:input.to,caller:socket.id,callee:null,targets,kind:input.kind,accepted:false};
   calls.set(call.id,call);busy.set(user.id,call.id);busy.set(input.to,call.id);call.timer=setTimeout(()=>finish(call,'No answer'),45000);
   io.to(targets).emit('call:incoming',{id:call.id,from:callerProfile,kind:call.kind});ack({id:call.id});
  }catch(e){ack({error:e.message});}});
  socket.on('call:accept',async(input,ack)=>{if(typeof ack!=='function')return;try{if(!await authorized())throw Error('Please sign in again.');const call=calls.get(input?.id);if(!call||!call.targets.includes(socket.id)||call.accepted)throw Error('Call is no longer available.');call.accepted=true;call.callee=socket.id;const otherDevices=call.targets.filter(id=>id!==socket.id);if(otherDevices.length)io.to(otherDevices).emit('call:ended',{id:call.id,reason:'Answered on another device'});clearTimeout(call.timer);call.timer=setTimeout(()=>finish(call,'Call connection timed out'),60000);io.to(call.caller).emit('call:accepted',{id:call.id});ack({ok:true});}catch(e){ack({error:e.message});}});
  socket.on('call:signal',async(input,ack)=>{if(typeof ack!=='function')return;try{if(!await authorized())throw Error('Session expired.');limit(`signal:${user.id}`,600);const call=calls.get(input?.id);if(!call?.accepted||![call.caller,call.callee].includes(socket.id))throw Error('Invalid call.');const signal=input.signal;if(!signal||JSON.stringify(signal).length>60000||!['offer','answer','candidate','connected'].includes(signal.type))throw Error('Invalid signal.');if((signal.type==='offer'&&socket.id!==call.caller)||(signal.type==='answer'&&socket.id!==call.callee))throw Error('Invalid signal role.');if(signal.type==='connected')clearTimeout(call.timer);else io.to(socket.id===call.caller?call.callee:call.caller).emit('call:signal',{id:call.id,signal});ack({ok:true});}catch(e){ack({error:e.message});}});
  socket.on('call:end',input=>{const call=calls.get(input?.id);if(call&&(call.caller===socket.id||(call.accepted?call.callee===socket.id:call.targets.includes(socket.id))))finish(call,call.accepted?'Call ended':'Call declined or cancelled');});
  socket.on('disconnect',()=>{const call=calls.get(busy.get(user.id));if(!call)return;if(call.caller===socket.id||call.callee===socket.id){finish(call,'Connection lost');return;}if(!call.accepted){call.targets=call.targets.filter(id=>id!==socket.id);if(!call.targets.length)finish(call,'Connection lost');}});
 });
 return {close(){for(const call of calls.values())finish(call,'Server restarting');}};
}
