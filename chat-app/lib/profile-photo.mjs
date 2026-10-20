import sharp from 'sharp';
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export async function preparePhoto(buffer) {
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) throw new Error('Choose a JPG, PNG or WebP photo smaller than 2 MB.');
  const image = sharp(buffer, { limitInputPixels: 16000000, failOn: 'error' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Choose a still JPG, PNG or WebP photo.');
  return image.rotate().resize(256, 256, { fit: 'cover' }).flatten({ background: '#edf1e6' }).jpeg({ quality: 85 }).toBuffer();
}
