import { accountId, originalNotebook } from './account-scope';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function mediaDir() {
  const root = process.env.MEDIA_DIR || './data/media';
  const id = accountId();
  // Preserve the imported owner's existing photo URLs and volume.
  return id === originalNotebook ? root : join(root, 'accounts', id);
}
export async function storePhoto(source: Buffer, persist = true) {
  if (source.length > 8 * 1024 * 1024) throw Error('Photo trop volumineuse.');
  const img = sharp(source, { limitInputPixels: 25000000, failOn: 'warning' });
  const m = await img.metadata();
  if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(m.format ?? ''))
    throw Error('Format photographique non pris en charge.');
  const encoded = await img
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  const hex = createHash('sha256').update(encoded).digest('hex');
  const name =
    [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-') + '.webp';
  if (persist) {
    await mkdir(mediaDir(), { recursive: true });
    try {
      await writeFile(join(mediaDir(), name), encoded, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (
        (e as NodeJS.ErrnoException).code !== 'EEXIST' ||
        !(await readFile(join(mediaDir(), name))).equals(encoded)
      )
        throw e;
    }
  }
  return '/api/media/' + name;
}
