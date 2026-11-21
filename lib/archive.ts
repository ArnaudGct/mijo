import { posix } from 'node:path';
import { storePhoto } from './media';
import yauzl from 'yauzl';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { type Page, parseNotion } from './notion';
export async function archivePages(buf: Buffer, persist = false) {
  if (buf.length > 24 * 1024 * 1024) throw Error('Archive trop grande (24 Mo maximum).');
  const entries = await new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, strictFileNames: true }, (err, zip) => {
      if (err || !zip) return reject(Error('Archive illisible.'));
      const files = new Map<string, Buffer>();
      let bytes = 0,
        count = 0,
        actual = 0;
      function fail() {
        zip.close();
        reject(Error('Archive invalide ou trop volumineuse.'));
      }
      zip.on('error', fail);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: yauzl.Entry) => {
        const path = entry.fileName;
        if (
          ++count > 5000 ||
          (bytes += entry.uncompressedSize) > 100 * 1024 * 1024 ||
          entry.isEncrypted() ||
          path.includes('..') ||
          path.startsWith('/') ||
          ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
        )
          return fail();
        if (!/\.(md|csv|png|jpe?g|webp|avif)$/i.test(path)) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > (/\.(md|csv)$/i.test(path) ? 700000 : 8000000)) return fail();
        zip.openReadStream(entry, (e, s) => {
          if (e || !s) return fail();
          const chunks: Buffer[] = [];
          let length = 0;
          s.on('data', (b: Buffer) => {
            length += b.length;
            actual += b.length;
            if (length > entry.uncompressedSize || actual > 30 * 1024 * 1024) {
              s.destroy();
              fail();
            } else chunks.push(b);
          });
          s.on('error', fail);
          s.on('end', () => {
            files.set(path, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
  const pages = new Map<string, Page>();
  const key = (name: string, seed: string) =>
    name.match(/([a-f0-9]{32})(?:\.[a-z]+)?$/i)?.[1] ??
    createHash('sha256').update(seed).digest('hex').slice(0, 32);
  const media = new Map<string, string>();
  const originals = new Map<string, string>();
  for (const [path, buffer] of entries) {
    if (!path.endsWith('.md')) continue;
    const original = buffer.toString('utf8');
    let content = original;
    for (const match of original.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      const ref = match[2];
      if (/^[a-z]+:|^\//i.test(ref)) continue;
      const relative = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(ref)));
      if (relative.startsWith('../')) continue;
      const data = entries.get(relative);
      if (!data) continue;
      if (!media.has(relative)) media.set(relative, await storePhoto(data, persist));
      content = content.replace(match[0], '![' + match[1] + '](' + media.get(relative) + ')');
    }
    const title = content.match(/^# (.+)$/m)?.[1] ?? path.split('/').pop()!.replace(/\.md$/, '');
    const id = key(path, title);
    originals.set(id, original);
    const cover = content
      .split(/(?:^|\n)#{1,3}[^\n]*(?:ingrédients|préparation)/i)[0]
      .match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
    pages.set(id, { id, title, content, cover });
  }
  for (const [path, buffer] of entries) {
    if (!path.endsWith('.csv')) continue;
    const content = buffer.toString('utf8');
    const records = parse(content, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      max_record_size: 700000,
    }) as Record<string, string>[];
    for (const r of records) {
      const title = r.Nom || r.Name || r.Titre;
      if (!title || [...pages.values()].some((p) => p.title === title)) continue;
      const id = key(r.URL ?? '', title);
      pages.set(id, {
        id,
        title,
        content: Object.entries(r)
          .map(([k, v]) => k + ' : ' + v)
          .join('\n'),
      });
    }
  }
  return [...pages.values()].map((p) => {
    const row = parseNotion(p);
    row.original = JSON.stringify({ ...p, content: originals.get(p.id) ?? p.content });
    return row;
  });
}
