import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseNotion, type Page } from '../lib/notion';
import { archivePages } from '../lib/archive';
import { importBatch } from '../lib/import-db';
import { db } from '../lib/db';
import { setTimeout as delay } from 'node:timers/promises';
import { storePhoto } from '../lib/media';
import { notionPhotoBytes } from '../lib/web-import';
if (existsSync('.env')) process.loadEnvFile('.env');
const arg = process.argv.slice(2),
  path = arg.find((x) => !x.startsWith('--')),
  errors: { id: string; message: string }[] = [];
type Block = { id: string; type: string; has_children: boolean; [key: string]: unknown };
type Rich = { plain_text: string };
type Info = {
  rich_text?: Rich[];
  external?: { url: string };
  file?: { url: string };
  url?: string;
};
async function notion(endpoint: string, body?: unknown) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.notion.com/v1/' + endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + process.env.NOTION_TOKEN,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) return res.json();
    if (attempt === 3 || (res.status !== 429 && res.status < 500))
      throw Error('Notion HTTP ' + res.status);
    const seconds = Number(res.headers.get('retry-after')) || 2 ** attempt;
    if (seconds > 60) throw Error('Notion demande un nouvel essai après ' + seconds + ' secondes.');
    await delay(seconds * 1000);
  }
  throw Error('Notion indisponible.');
}
async function pagePhoto(info: Info | undefined, id: string) {
  if (info?.external?.url) return info.external.url;
  if (!info?.file?.url) return '';
  try {
    return await storePhoto(await notionPhotoBytes(info.file.url), arg.includes('--apply'));
  } catch {
    errors.push({
      id,
      message: 'Photo hébergée indisponible. Reprendre depuis l’archive avec médias.',
    });
    return '';
  }
}
async function children(id: string, depth = 0): Promise<string> {
  if (depth > 24) throw Error('Imbrication trop profonde');
  let cursor = '',
    out = '';
  do {
    const page = await notion(
      'blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''),
    );
    for (const b of page.results as Block[]) {
      const x = b[b.type] as Info;
      const v = (x.rich_text ?? []).map((t) => t.plain_text).join('');
      const prefix: Record<string, string> = {
        heading_1: '# ',
        heading_2: '## ',
        heading_3: '### ',
        bulleted_list_item: '- ',
        numbered_list_item: '- ',
      };
      out +=
        (b.type === 'image'
          ? '![](' + (await pagePhoto(x, b.id)) + ')'
          : (prefix[b.type] ?? '') + v) + '\n';
      if (b.has_children) out += await children(b.id, depth + 1);
    }
    cursor = page.has_more ? page.next_cursor : '';
  } while (cursor);
  return out;
}
async function api() {
  if (!process.env.NOTION_TOKEN)
    throw Error('Indiquez un fichier JSON/ZIP ou NOTION_TOKEN pour cette migration.');
  const pages: Page[] = [];
  let cursor = '';
  do {
    const batch = await notion('data_sources/5d63f744-aa67-822c-8ab1-8761427eeca5/query', {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const p of batch.results) {
      try {
        pages.push({
          id: p.id,
          title: p.properties.Nom.title.map((t: Rich) => t.plain_text).join(''),
          url: p.url,
          cover: await pagePhoto(p.cover, p.id),
          rating: p.properties.Favoris?.select?.name?.length ?? 0,
          content: await children(p.id),
        });
      } catch (e) {
        errors.push({ id: p.id, message: String(e) });
      }
    }
    cursor = batch.has_more ? batch.next_cursor : '';
  } while (cursor);
  return pages;
}
try {
  const input = path && !path.endsWith('.zip') ? JSON.parse(await readFile(path, 'utf8')) : null;
  if (input?.errors) errors.push(...input.errors);
  const rows = path?.endsWith('.zip')
    ? await archivePages(await readFile(path), arg.includes('--apply'))
    : ((input?.pages ?? (await api())).map(parseNotion) as ReturnType<typeof parseNotion>[]);
  const apply = arg.includes('--apply');
  const stats = await importBatch(rows, apply);
  await mkdir('data/private/import', { recursive: true });
  await writeFile(
    'data/private/import/report-' + (apply ? 'import' : 'preview') + '.json',
    JSON.stringify(
      {
        apply,
        ...stats,
        errors,
        details: rows.map((r) => ({
          source: r.sourceKey,
          title: r.data.title,
          issues: r.issues,
          ingredientsAVerifier: r.data.ingredients
            .filter(
              (i) => i.quantity === null || !i.unit || /sachet|paquet|pot|boîte/i.test(i.unit),
            )
            .map((i) => ({
              nom: i.name,
              libelleOriginal: i.raw,
              raison:
                i.quantity === null
                  ? 'Quantité inconnue'
                  : !i.unit
                    ? 'Unité inconnue'
                    : 'Vérifier la taille du conditionnement',
            })),
        })),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log({ mode: apply ? 'Import' : 'Prévisualisation', ...stats, errors: errors.length });
} finally {
  await db().end();
}
