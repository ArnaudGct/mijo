import { load } from 'cheerio';
import { duration, type Recipe } from './model';
import { getPage, extract } from './web-import';
import { discoveryTitle, type Discovery } from './recipe-sources';
import { discoveryCourse } from './discovery-course';

const indexes = [
  {
    publisher: 'Marmiton',
    url: 'https://www.marmiton.org/recettes/index/categorie/plat-principal',
    pattern: /^\/recettes\/recette_[^/]+_\d+\.aspx$/,
  },
  { publisher: '750g', url: 'https://www.750g.com/recettes_plats.htm', pattern: /-r\d+\.htm$/ },
  {
    publisher: 'CuisineAZ',
    url: 'https://www.cuisineaz.com/categories/plats-cat48649',
    pattern: /^\/recettes\/[^/]+-\d+\.aspx$/,
  },
];
export async function sampleSources(perSite: number, day: number) {
  const batches = await Promise.all(
    indexes.map(async ({ publisher, url, pattern }) => {
      const recipes: { card: Discovery; recipe: Recipe }[] = [];
      try {
        const listing = await getPage(url);
        const $ = load(listing.html);
        const links = new Set<string>();
        for (const a of $('a[href]').toArray()) {
          const link = URL.parse($(a).attr('href')!, listing.url);
          if (
            link?.origin === new URL(url).origin &&
            pattern.test(link.pathname) &&
            !/cookeo|thermomix|monsieur-cuisine|vin-chaud|cocktail|punch-|buche-|sangria/i.test(
              link.pathname,
            )
          )
            links.add(link.origin + link.pathname);
        }
        const all = [...links];
        const offset = all.length ? (day * 7) % all.length : 0;
        const candidates = [...all.slice(offset), ...all.slice(0, offset)].slice(0, perSite + 3);
        for (const link of candidates) {
          if (recipes.length >= perSite) break;
          try {
            const page = await getPage(link);
            const recipe = extract(page.html, page.url);
            if (!recipe.base || !recipe.ingredients.length || !recipe.steps.length || !recipe.image)
              continue;
            const course = discoveryCourse(recipe.title, recipe.tags);
            if (!course) continue;
            recipes.push({
              recipe,
              card: {
                course,
                title: discoveryTitle(recipe.title),
                url: recipe.url,
                image: recipe.image,
                publisher,
                minutes: duration(recipe),
              },
            });
          } catch {
            /* An individual recipe can disappear while its index is still online. */
          }
        }
      } catch {
        /* Other publishers remain available. */
      }
      return recipes;
    }),
  );
  return batches.flat();
}

// Retain successful batches if one publisher is down. Expire old previews with their batch.
let cached: Awaited<ReturnType<typeof sampleSources>> = [];
let until = 0;
let pending: Promise<void> | undefined;
export async function discoveryFeed() {
  if (Date.now() >= until) {
    pending ??= sampleSources(3, Math.floor(Date.now() / 86400000))
      .then((rows) => {
        const updated = new Set(rows.map((r) => r.card.publisher));
        cached = [...cached.filter((r) => !updated.has(r.card.publisher)), ...rows];
        until = Date.now() + (updated.size === indexes.length ? 86400000 : 3600000);
      })
      .finally(() => {
        pending = undefined;
      });
    await pending;
  }
  return cached.map((r) => r.card).filter((card) => card.course === 'main');
}
export function cachedDiscovery(url: string) {
  return cached.find((row) => row.card.url === url)?.recipe;
}
