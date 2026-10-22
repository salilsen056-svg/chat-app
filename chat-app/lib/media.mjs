import sharp from 'sharp';
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export const VIDEO_LIMIT = 30 * 1024 * 1024;
export const BODY_LIMIT = VIDEO_LIMIT + 64 * 1024;
export async function prepareMedia(buffer, mime, filename) {
  mime=String(mime).split(';')[0].trim().toLowerCase();
  const name = String(filename || 'attachment').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0,120) || 'attachment';
  if (!buffer.length) throw new Error('Choose a nonempty photo or video.');
  if (['image/jpeg','image/png','image/webp'].includes(mime)) {
    if (buffer.length > IMAGE_LIMIT) throw new Error('Photos must be 10 MB or smaller.');
    const image = sharp(buffer, { limitInputPixels: 32000000, failOn: 'error' });
    const meta=await image.metadata();
    if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) > 1) throw new Error('Choose a still JPG, PNG or WebP photo.');
    const data=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:85}).toBuffer();
    return { data, type:'image', mime:'image/jpeg', name:name.replace(/\.[^.]+$/, '')+'.jpg' };
  }
  if(['audio/webm','audio/mp4','audio/ogg'].includes(mime)){
    if(buffer.length>10*1024*1024)throw Error('Voice recordings must be 10 MB or smaller.');
    const valid=mime==='audio/webm'?buffer.length>16&&buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&buffer.subarray(0,4096).includes(Buffer.from('webm')):mime==='audio/ogg'?buffer.subarray(0,4).toString()==='OggS':buffer.length>=24&&buffer.subarray(4,8).toString()==='ftyp';
    if(!valid)throw Error('Invalid voice recording.');
    return{data:buffer,type:'audio',mime,name};
  }
  if (!['video/mp4','video/webm'].includes(mime)) throw new Error('Choose a JPG, PNG, WebP, MP4 or WebM file.');
  if (buffer.length > VIDEO_LIMIT) throw new Error('Videos must be 30 MB or smaller.');
  const mp4=buffer.length >= 24 && buffer.subarray(4,8).toString()==='ftyp' && buffer.readUInt32BE(0)>=16 && buffer.readUInt32BE(0)<=buffer.length;
  const webm=buffer.length>16 && buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && buffer.subarray(0,4096).includes(Buffer.from('webm'));
  if ((mime==='video/mp4' && !mp4) || (mime==='video/webm' && !webm)) throw new Error('The video file is invalid or does not match its type.');
  return {data:buffer,type:'video',mime,name};
}
export function byteRange(header, size) {
  if (!header) return { start:0, end:size-1, partial:false };
  const match=/^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) { const suffix=Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix<=0) return null; start=Math.max(0,size-suffix);end=size-1; }
  else { start=Number(match[1]);end=match[2] ? Math.min(Number(match[2]),size-1):size-1; }
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start) return null;
  return {start,end,partial:true};
}
