import test from 'node:test';
import assert from 'node:assert/strict';
import {cropRect} from '../lib/photo-crop.mjs';
test('DP crop stays in image bounds for landscape, portrait, zoom and positioning',()=>{
 assert.deepEqual(cropRect(1200,800),{sx:200,sy:0,size:800});
 assert.deepEqual(cropRect(800,1200,2,1,0),{sx:400,sy:0,size:400});
 for(const [w,h] of [[800,1200],[1200,800]])for(const z of [1,2,3])for(const x of [0,.5,1])for(const y of [0,.5,1]){
  const r=cropRect(w,h,z,x,y);assert.ok(r.sx>=0&&r.sy>=0&&r.sx+r.size<=w&&r.sy+r.size<=h);
 }
});
