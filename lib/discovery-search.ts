import { z } from 'zod';
import { load } from 'cheerio';
import { today } from './dates';
import { duration, type Recipe } from './model';
import { extract, getPage } from './web-import';
import { searchWords } from './discovery-taste';
import { courses, discoveryCourse, type Course } from './discovery-course';
import { discoveryTitle, type Discovery } from './recipe-sources';

const publishers = [
  {
    name: '750g',
    origin: 'https://www.750g.com',
    index: '/recettes-plats/',
    shard: null,
    recipe: /^\/(.+)-r\d+\.htm$/,
    listings: ['/recettes-entrees/', '/recettes-desserts/'],
  },
  {
    name: 'Marmiton',
    origin: 'https://www.marmiton.org',
    index: '/wsitemap_recipes_index.xml',
    shard: /^\/wsitemap_recipes_\d+\.xml$/,
    recipe: /^\/recettes\/recette_(.+)_\d+\.aspx$/,
  },
  {
    name: 'CuisineAZ',
    origin: 'https://www.cuisineaz.com',
    index: '/xml/sitemap.xml',
    shard: /^\/xml\/sitemap-cuisineaz-recette-\d+\.xml$/,
    recipe: /^\/recettes\/(.+)-\d+\.aspx$/,
  },
  {
    name: 'Jow',
    origin: 'https://jow.fr',
    index: '/sitemap.xml',
    shard: null,
    recipe: /^\/(?:fr\/)?recipes\/(.+)-[a-z0-9]{15,}$/,
  },
];
export const discoveryQuery = z.object({
  course: z.enum(courses).default('main'),
  query: z.string().trim().max(100),
  publisher: z.enum(['', 'Marmiton', 'CuisineAZ', 'Jow', '750g']),
  minutes: z.number().int().min(0).max(300),
  order: z.enum(['affinity', 'explore', 'quick']),
  taste: z.array(z.string().max(64)).max(36),
  offset: z.number().int().nonnegative().max(300000),
  day: z.iso.date().default(today),
});
type Candidate = { url: string; publisher: string; tokens: string[]; hint: Course | null };
function locations(xml: string) {
  return Array.from(
    xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?(https:\/\/[^<>\s\]]+)(?:\]\]>)?\s*<\/loc>/gi),
    (m) => m[1],
  );
}
let known: Candidate[] = [];
let refreshed = '',
  retryAfter = 0,
  pending: Promise<void> | undefined;
const catalogs = new Map<string, Candidate[]>();
const verifiedOn = new Map<string, string>();
async function loadCatalogs() {
  const day = today();
  if (refreshed === day || Date.now() < retryAfter) return known;
  pending ??= Promise.all(
    publishers
      .map(async (site) => {
        if (verifiedOn.get(site.name) === day) return true;
        const root = site.origin + site.index;
        const index = await getPage(root, 16_000_000);
        const pages = site.shard
          ? locations(index.html).filter(
              (link) =>
                link.startsWith(site.origin + '/') && site.shard!.test(new URL(link).pathname),
            )
          : [root, ...(site.listings ?? []).map((path) => site.origin + path)];
        if (!pages.length) throw Error('Index vide');
        const rows: Candidate[] = [];
        for (const page of pages) {
          const xml = page === root ? index.html : (await getPage(page, 16_000_000)).html;
          const $ = site.listings ? load(xml) : null;
          const links = $
            ? $('a[href]')
                .toArray()
                .map((a) => URL.parse($(a).attr('href')!, page)?.href ?? '')
            : locations(xml);
          for (const url of links) {
            if (!url.startsWith(site.origin + '/')) continue;
            const slug = url.slice(site.origin.length).match(site.recipe)?.[1];
            if (slug)
              rows.push({
                url,
                publisher: site.name,
                tokens: searchWords(slug),
                hint: discoveryCourse(slug),
              });
          }
        }
        if (!rows.length) throw Error('Aucune recette publiée');
        catalogs.set(site.name, rows);
        verifiedOn.set(site.name, day);
        return true;
      })
      .map((p) => p.catch(() => false)),
  )
    .then((ok) => {
      known = [...new Map([...catalogs.values()].flat().map((x) => [x.url, x])).values()];
      if (ok.every(Boolean)) refreshed = day;
      else retryAfter = Date.now() + 60000;
    })
    .finally(() => {
      pending = undefined;
    });
  await pending;
  return known;
}
function hash(text: string) {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0) / 4294967296;
}
const details = new Map<string, { at: number; recipe: Recipe | null }>();
export function searchPreview(url: string) {
  return details.get(url)?.recipe;
}
async function fetchCard(c: Candidate) {
  let entry = details.get(c.url);
  if (!entry || Date.now() - entry.at > (entry.recipe ? 86400000 : 60000)) {
    let result: Recipe | null = null;
    try {
      const page = await getPage(c.url),
        r = extract(page.html, page.url);
      if (r.base && r.steps.length && r.ingredients.length && r.image) result = r;
    } catch {
      /* A publisher can retire a recipe before removing its link. */
    }
    entry = { at: Date.now(), recipe: result };
    if (details.size >= 400) details.delete(details.keys().next().value!);
    details.set(c.url, entry);
  }
  const r = entry.recipe;
  const course = r && discoveryCourse(r.title, r.tags);
  return r && course
    ? {
        course,
        url: r.url,
        title: discoveryTitle(r.title),
        minutes: duration(r),
        publisher: c.publisher,
        image: r.image,
      }
    : null;
}
export async function discoverPage(q: z.output<typeof discoveryQuery>) {
  const catalog = await loadCatalogs();
  if (!catalog.length || (q.publisher && !catalogs.has(q.publisher)))
    throw Error('Les catalogues ne répondent pas.');
  const terms = searchWords(q.query),
    profile = new Map(q.taste.map((t, i) => [t, 1 - i / (q.taste.length + 1)]));
  const ranked = catalog
    .filter(
      (c) =>
        (!q.publisher || c.publisher === q.publisher) && terms.every((t) => c.tokens.includes(t)),
    )
    .map((c) => {
      const noise = hash(q.day + '|' + c.url);
      const fit =
        q.order === 'explore' ? 0 : c.tokens.reduce((n, t) => n + (profile.get(t) ?? 0), 0);
      const priority = c.hint === q.course ? 2 : c.hint === null ? 1 : 0;
      return { c, score: noise + Math.min(fit, 3) * 0.7, noise, priority };
    });
  ranked.sort(
    (a, b) => b.priority - a.priority || b.score - a.score || a.c.url.localeCompare(b.c.url),
  );
  // Every fifth place explores a different dish. The ordering stays stable across page requests.
  const outside =
    q.order === 'affinity'
      ? ranked
          .filter((r) => r.noise < 0.2)
          .sort((a, b) => b.priority - a.priority || a.noise - b.noise)
      : [];
  const regular = outside.length ? ranked.filter((r) => r.noise >= 0.2) : ranked;
  const ordered: Candidate[] = [];
  let a = 0,
    b = 0;
  while (a < regular.length || b < outside.length) {
    if (b < outside.length && (ordered.length % 5 === 4 || a === regular.length))
      ordered.push(outside[b++].c);
    else ordered.push(regular[a++].c);
  }
  let cursor = q.offset;
  const cards: Discovery[] = [];
  while (cursor < ordered.length && cards.length < 15 && cursor - q.offset < 40) {
    const group = ordered.slice(cursor, cursor + Math.min(4, 15 - cards.length));
    cursor += group.length;
    const found = await Promise.all(group.map(fetchCard));
    for (const card of found)
      if (
        card?.course === q.course &&
        (!q.minutes || (card.minutes !== null && card.minutes <= q.minutes))
      )
        cards.push(card);
  }
  return { cards, next: cursor < ordered.length ? cursor : null, total: ranked.length };
}
