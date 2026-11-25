import https from 'node:https';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';
import { load } from 'cheerio';
import { recipe, blankRecipe } from './model';
import { fromHelloFreshPage } from './hellofresh';
import { parseLine } from './ingredients';
import { vegetarianLabel } from './recipe-diet';
const agent = 'Mijo/1.0';
const decompress = promisify(gunzip);
class DestinationError extends Error {}
export function publicAddress(ip: string) {
  try {
    return ipaddr.process(ip).range() === 'unicast';
  } catch {
    return false;
  }
}
export function publicUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    !u.hostname.includes('.') ||
    isIP(u.hostname) ||
    u.hostname.endsWith('.local') ||
    u.hostname.endsWith('.localhost')
  )
    throw new DestinationError('Adresse HTTPS publique requise.');
  return u;
}
async function request(u: URL, deadline: number, limit: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw Error('Délai dépassé.');
  const addresses = await Promise.race([
    dns.lookup(u.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(Error('Délai DNS dépassé.')), remaining);
      t.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new DestinationError('Destination privée ou réservée.');
  const addr = addresses.find((a) => a.family === 4) ?? addresses[0];
  return new Promise<{ code: number; location?: string; body: Buffer }>((resolve, reject) => {
    const req = https.get(
      {
        hostname: addr.address,
        servername: u.hostname,
        path: u.pathname + u.search,
        headers: {
          host: u.host,
          'user-agent': agent,
          accept: 'text/html,text/plain;q=0.8',
          'accept-encoding': 'identity',
        },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > limit) {
            req.destroy(Error('Réponse trop volumineuse.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            code: res.statusCode ?? 0,
            location: res.headers.location,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error('Le site ne répond pas.')),
      Math.max(1, deadline - Date.now()),
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}
// Signed media locations come only from the authenticated Notion Files API.
export async function notionPhotoBytes(raw: string) {
  const u = publicUrl(raw);
  if (
    !['amazonaws.com', 'notion.so', 'notionusercontent.com'].some((domain) =>
      u.hostname.endsWith('.' + domain),
    )
  )
    throw Error('Hôte de média Notion non reconnu.');
  const response = await request(u, Date.now() + 15000, 8 * 1024 * 1024);
  if (response.code !== 200) throw Error('Photo Notion indisponible.');
  return response.body;
}
export async function getPage(raw: string, maxBytes = 3000000) {
  let u = publicUrl(raw);
  const until = Date.now() + 15000;
  for (let n = 0; n <= 3; n++) {
    const robotsUrl = new URL('/robots.txt', u);
    const policy = await request(robotsUrl, until, 600000);
    if (
      policy.code !== 404 &&
      policy.code !== 410 &&
      (policy.code !== 200 ||
        robotsParser(robotsUrl.href, policy.body.toString('utf8')).isAllowed(
          u.href,
          'Mijo',
        ) === false)
    )
      throw Error('Lecture automatisée non autorisée par le site.');
    const res = await request(u, until, maxBytes);
    if (res.code >= 300 && res.code < 400 && res.location) {
      u = publicUrl(new URL(res.location, u).href);
      continue;
    }
    if (res.code !== 200) throw Error('Accès au site refusé ou indisponible (' + res.code + ').');
    const body =
      res.body[0] === 0x1f && res.body[1] === 0x8b
        ? await decompress(res.body, { maxOutputLength: maxBytes })
        : res.body;
    return { html: body.toString('utf8'), url: u.href };
  }
  throw Error('Trop de redirections.');
}
type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {};
const list = (x: unknown): unknown[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
function findRecipe(x: unknown): Obj | undefined {
  if (Array.isArray(x)) return x.map(findRecipe).find(Boolean);
  const o = obj(x);
  if (list(o['@type']).some((t) => String(t).split('/').pop() === 'Recipe')) return o;
  return o['@graph'] ? findRecipe(o['@graph']) : undefined;
}
function plain(x: unknown) {
  return typeof x === 'string' ? load(x, null, false).text().trim() : '';
}
function minutes(x: unknown) {
  const m = String(x ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?$/i);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : null;
}
function image(x: unknown, base: string) {
  const a = list(x)[0];
  const v = typeof a === 'string' ? a : obj(a).url;
  if (typeof v !== 'string' || !v) return '';
  try {
    const u = new URL(v, base);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}
function steps(x: unknown, base: string): { text: string; image: string }[] {
  return list(x).flatMap((v) => {
    const o = obj(v);
    if (o.itemListElement) return steps(o.itemListElement, base);
    return plain(typeof v === 'string' ? v : (o.text ?? o.name))
      .split(/\n+/)
      .filter(Boolean)
      .map((text) => ({ text, image: image(o.image, base) }));
  });
}
export function extract(html: string, url: string) {
  const official = fromHelloFreshPage(html, url);
  if (official) return official;
  if (new URL(url).origin === 'https://www.hellofresh.fr')
    throw Error('La fiche HelloFresh ne fournit pas de recette complète.');
  const $ = load(html);
  let found: Obj | undefined;
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      found = findRecipe(JSON.parse($(el).text()));
      if (found) break;
    } catch {
      /* Certains documents contiennent aussi des scripts incomplets. */
    }
  }
  const o = found ?? {},
    n = obj(o.nutrition);
  // Some publishers store the course in the breadcrumb and only a dish family in recipeCategory.
  const course = $('[itemtype$="BreadcrumbList"] [itemprop="name"], [class*="readcrumb"] a')
    .toArray()
    .map((el) => $(el).text().trim())
    .find((label) =>
      /^(entrées?|plats?(?: principaux| principal)?|desserts?|apéritifs?|accompagnements?|boissons?)$/i.test(
        label,
      ),
    );
  const servings = String(list(o.recipeYield)[0] ?? '')
    .trim()
    .match(/^(?:pour\s+)?(\d{1,2})(?:\s*(?:personnes?|portions?|servings?))?$/i);
  return recipe.parse({
    ...blankRecipe(),
    url,
    source: new URL(url).hostname,
    rights: 'Source externe · usage personnel, droits de l’éditeur.',
    title:
      plain(o.name) ||
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      new URL(url).hostname,
    description: plain(o.description) || $('meta[name="description"]').attr('content') || '',
    image: image(o.image ?? $('meta[property="og:image"]').attr('content'), url),
    base: servings ? Number(servings[1]) : null,
    prep: minutes(o.prepTime),
    cook: minutes(o.cookTime),
    total: minutes(o.totalTime),
    diet: [
      ...list(o.suitableForDiet),
      ...list(o.keywords).flatMap((v) => String(v).split(',')),
    ].some((v) => vegetarianLabel(typeof v === 'string' ? v : String(obj(v)['@id'] ?? '')))
      ? 'Végétarien'
      : '',
    tags: [...new Set([...(course ? [course] : []), ...list(o.recipeCategory).map(String)])].slice(
      0,
      40,
    ),
    batch: [...list(o.keywords), ...list(o.recipeCategory)].some((v) =>
      String(v)
        .split(',')
        .some((t) => /^batch[ -]cooking$/i.test(t.trim())),
    ),
    cuisine: list(o.recipeCuisine).join(', '),
    ingredients: list(o.recipeIngredient).map(plain).filter(Boolean).map(parseLine),
    steps: steps(o.recipeInstructions, url),
    nutrition: Object.entries(n)
      .filter(([k, v]) => k !== '@type' && typeof v === 'string')
      .map(([k, v]) => k + ' ' + v)
      .join(' · '),
  });
}
export async function previewUrl(raw: string) {
  const u = publicUrl(raw);
  try {
    const p = await getPage(u.href);
    return { data: extract(p.html, p.url), warning: '', original: p.url };
  } catch (e) {
    if (e instanceof DestinationError) throw e;
    return {
      data: { ...blankRecipe(), title: u.hostname, url: u.href, source: u.hostname },
      warning: e instanceof Error ? e.message : 'Extraction indisponible',
      original: u.href,
    };
  }
}
