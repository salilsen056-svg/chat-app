import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { preparePhoto, MAX_PHOTO_BYTES } from '../lib/profile-photo.mjs';
test('profile photo is decoded, cropped and reencoded as a 256px JPEG', async () => {
  const input = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#4d8a67' } }).png().toBuffer();
  const output = await preparePhoto(input), meta = await sharp(output).metadata();
  assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 256); assert.equal(meta.height, 256); assert.equal(meta.exif, undefined);
});
test('invalid and oversized photo data is rejected', async () => {
  await assert.rejects(preparePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')));
  await assert.rejects(preparePhoto(Buffer.from('invalid')));
  await assert.rejects(preparePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1)));
});
