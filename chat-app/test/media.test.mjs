import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareMedia, byteRange, IMAGE_LIMIT, VIDEO_LIMIT } from '../lib/media.mjs';
test('media: decodes and reencodes photos; rejects spoofed and oversized uploads',async()=>{
 const photo=await sharp({create:{width:1900,height:1200,channels:3,background:'#008069'}}).png().toBuffer();
 const result=await prepareMedia(photo,'image/png','../holiday.png');
 assert.equal(result.type,'image');assert.equal(result.mime,'image/jpeg');assert.equal(result.name,'holiday.jpg');assert.equal((await sharp(result.data).metadata()).width,1600);
 await assert.rejects(prepareMedia(Buffer.from('<script>bad</script>'),'image/png','bad.png'));
 await assert.rejects(prepareMedia(Buffer.alloc(IMAGE_LIMIT+1),'image/jpeg','big.jpg'));
 await assert.rejects(prepareMedia(Buffer.alloc(VIDEO_LIMIT+1),'video/mp4','big.mp4'));
 await assert.rejects(prepareMedia(Buffer.from('bad'),'video/mp4','bad.mp4'));
 await assert.rejects(prepareMedia(Buffer.from('<svg/>'),'image/svg+xml','bad.svg'));
});
test('range requests support video seeking and reject invalid or multiple ranges',()=>{
 assert.deepEqual(byteRange(undefined,100),{start:0,end:99,partial:false});
 assert.deepEqual(byteRange('bytes=10-19',100),{start:10,end:19,partial:true});
 assert.deepEqual(byteRange('bytes=90-',100),{start:90,end:99,partial:true});
 assert.deepEqual(byteRange('bytes=-10',100),{start:90,end:99,partial:true});
 assert.deepEqual(byteRange('bytes=90-200',100),{start:90,end:99,partial:true});
 for(const range of ['bytes=100-','bytes=20-10','bytes=-0','bytes=-','bytes=0-1,3-4','nonsense'])assert.equal(byteRange(range,100),null);
});
