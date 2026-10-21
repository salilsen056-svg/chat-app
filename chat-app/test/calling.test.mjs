import test from 'node:test';
import assert from 'node:assert/strict';
import {signalQueue} from '../lib/webrtc-signaling.mjs';
import {callConfiguration} from '../lib/ice-config.mjs';
test('ICE arriving before and during SDP waits for remote description',async()=>{
 const order=[],sent=[];let release;
 const gate=new Promise(r=>release=r);
 const pc={remoteDescription:null,async setRemoteDescription(d){await gate;this.remoteDescription=d;order.push('description');},async addIceCandidate(c){assert.ok(this.remoteDescription);order.push(c);},async createAnswer(){return{type:'answer',sdp:'answer'};},async setLocalDescription(){order.push('answer');}};
 const push=signalQueue(pc,async s=>sent.push(s));
 await push({type:'candidate',candidate:'early'});
 const offer=push({type:'offer',sdp:'offer'}),late=push({type:'candidate',candidate:'late'});release();await Promise.all([offer,late]);
 assert.deepEqual(order,['description','early','answer','late']);assert.equal(sent.length,1);
});
test('TURN configuration supports static and provider credentials without leaking API key',async()=>{
 assert.equal((await callConfiguration({})).relayConfigured,false);
 assert.equal((await callConfiguration({TURN_URL:'turn:example.com:3478',TURN_USERNAME:'u',TURN_CREDENTIAL:'p'})).relayConfigured,true);
 const config=await callConfiguration({METERED_DOMAIN:'test-app.metered.live',METERED_API_KEY:'private-test-key'},async()=>({ok:true,json:async()=>[{urls:'turn:test.example:443',username:'u',credential:'temporary'}]}));
 assert.equal(config.relayConfigured,true);assert.equal(JSON.stringify(config).includes('private-test-key'),false);
 await assert.rejects(()=>callConfiguration({METERED_DOMAIN:'localhost',METERED_API_KEY:'x'}),/Invalid/);
});
