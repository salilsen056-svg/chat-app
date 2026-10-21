let cached;
export async function callConfiguration(env=process.env, fetcher=fetch) {
 const iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
 if(env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL){
  iceServers.push({urls:env.TURN_URL.split(',').map(s=>s.trim()),username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
 } else if(env.METERED_DOMAIN && env.METERED_API_KEY){
  const domain=env.METERED_DOMAIN.trim().toLowerCase();
  if(!/^[a-z0-9-]+\.metered\.(live|ca)$/.test(domain))throw Error('Invalid TURN provider domain.');
  const cacheKey=domain+':'+env.METERED_API_KEY;
  if(!cached||cached.key!==cacheKey||cached.until<Date.now()){
   const response=await fetcher(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`,{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('TURN provider is unavailable. Check the relay credentials.');
   const servers=await response.json();
   if(!Array.isArray(servers)||!servers.some(s=>[].concat(s.urls||[]).some(u=>/^turns?:/.test(u))))throw Error('TURN provider returned no relay servers.');
   cached={key:cacheKey,until:Date.now()+60000,servers:servers.map(({urls,username,credential})=>({urls,username,credential}))};
  }
  iceServers.push(...cached.servers);
 }
 return {iceServers,relayConfigured:iceServers.some(s=>[].concat(s.urls).some(u=>/^turns?:/.test(u)))};
}
