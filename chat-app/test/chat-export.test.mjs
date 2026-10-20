import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLine } from '../lib/chat-export.mjs';
test('text exports preserve Bangla, timestamps and media metadata without exposing deleted text',()=>{
 const m={senderName:'Test\nName',createdAt:'2026-10-20T10:00:00Z',text:'বাংলা লেখা'};
 assert.match(exportLine(m),/Test Name: বাংলা লেখা/);assert.match(exportLine(m),/2026-10-20T10:00:00.000Z/);
 assert.match(exportLine({...m,mediaType:'image',mediaName:'photo.jpg',mediaSize:12}),/Photo: photo.jpg, 12 bytes/);
 assert.equal(exportLine({...m,deleted:true}).includes('বাংলা লেখা'),false);
});
