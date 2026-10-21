// Socket listeners may run concurrently. Serialize SDP and ICE so candidates
// never race setRemoteDescription or arrive while its promise is unresolved.
export function signalQueue(connection,send,isCurrent=()=>true){
 let queue=Promise.resolve(),pending=[];
 return signal=>{
  const work=queue.then(async()=>{
   if(!isCurrent())return;
   if(signal.type==='candidate'){
    if(!connection.remoteDescription)pending.push(signal.candidate);
    else await connection.addIceCandidate(signal.candidate);
    return;
   }
   if(!['offer','answer'].includes(signal.type))throw Error('Invalid call signal.');
   await connection.setRemoteDescription({type:signal.type,sdp:signal.sdp});
   if(!isCurrent())return;
   for(const candidate of pending)await connection.addIceCandidate(candidate);
   pending=[];
   if(signal.type==='offer'){
    const answer=await connection.createAnswer();
    await connection.setLocalDescription(answer);
    if(isCurrent())await send({type:'answer',sdp:answer.sdp});
   }
  });
  queue=work.catch(()=>{});
  return work;
 };
}
