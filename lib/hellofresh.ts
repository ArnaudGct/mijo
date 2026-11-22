import { load } from 'cheerio';
import { z } from 'zod';
import { blankRecipe, recipe } from './model';
import { shoppingCategory, normalize, rounded } from './ingredients';

const named = z.object({ name: z.string() });
const source = z.object({
  recipeId: z.string().regex(/^[a-f0-9]{24}$/),
  languageCode: z.literal('fr-FR'),
  name: z.string(),
  websiteUrl: z.url(),
  description: z.string().nullish(),
  imagePath: z.string().nullish(),
  difficulty: z.number().nullish(),
  prepTime: z.string().nullish(),
  totalTime: z.string().nullish(),
  tags: z.array(named).nullish(),
  cuisines: z.array(named).nullish(),
  utensils: z.array(named).nullish(),
  nutrition: z.array(named.extend({ amount: z.number(), unit: z.string() })).nullish(),
  ingredients: z.array(named.extend({ id: z.string() })),
  yields: z.array(
    z.object({
      yields: z.number().int().positive(),
      ingredients: z.array(
        z.object({ id: z.string(), amount: z.number().nullish(), unit: z.string().nullish() }),
      ),
    }),
  ),
  steps: z.array(
    z.object({
      index: z.number(),
      instructionsHTML: z.string().nullish(),
      instructions: z.string().nullish(),
      images: z.array(z.object({ path: z.string().optional() })).nullish(),
    }),
  ),
});
function plain(html: string) {
  const $ = load(html, null, false);
  $('br').replaceWith('\n');
  $('li,p').append('\n');
  return $.text()
    .replace(/[^\S\n]+/g, ' ')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}
function minutes(iso?: string | null) {
  const match = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?$/);
  return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : null;
}
function photo(path?: string | null) {
  return path?.startsWith('/') && !path.startsWith('//')
    ? 'https://media.hellofresh.com/w_750,q_auto,f_auto,c_limit,fl_lossy/hellofresh_s3' + path
    : '';
}
// Public French recipe pages expose exact yields, including pantry ingredients.
export function helloFreshRecipe(payload: unknown) {
  const parsed = source.safeParse(payload);
  if (!parsed.success) return null;
  const r = parsed.data;
  const url = new URL(r.websiteUrl);
  if (url.origin !== 'https://www.hellofresh.fr' || !url.pathname.endsWith('-' + r.recipeId))
    return null;
  const amounts = r.yields.find((y) => y.yields === 2) ?? r.yields[0];
  if (!amounts?.ingredients.length) return null;
  const names = new Map(r.ingredients.map((i) => [i.id, plain(i.name)]));
  if (amounts.ingredients.some((i) => !names.get(i.id))) return null;
  const tags = (r.tags ?? []).map((t) => t.name);
  const ingredients = amounts.ingredients.map((i) => {
    const name = names.get(i.id)!;
    const [q, unit] = normalize(i.amount ?? 0, i.unit ?? '');
    return {
      name,
      sourceId: 'hellofresh:' + i.id,
      quantity: q > 0 ? rounded(q) : null,
      unit:
        unit ||
        (q > 0 && i.id === '6405bfefb9d07cd5d38d7c59'
          ? 'sachet'
          : q > 0 && i.id === '6405bf1cb9d07cd5d38d796e'
            ? 'lot HelloFresh'
            : ''),
      raw: [i.amount || '', i.unit, name].filter(Boolean).join(' '),
      category: shoppingCategory(name),
    };
  });
  const steps = r.steps
    .toSorted((a, b) => a.index - b.index)
    .map((s) => ({
      text: plain(s.instructionsHTML || s.instructions || ''),
      image: photo(s.images?.[0]?.path),
    }));
  if (!steps.length || steps.some((s) => !s.text)) return null;
  return recipe.parse({
    ...blankRecipe(),
    title: r.name,
    description: plain(r.description || ''),
    base: amounts.yields,
    url: url.href,
    source: 'HelloFresh',
    rights: 'HelloFresh France · usage personnel',
    image: photo(r.imagePath),
    tags,
    cuisine: (r.cuisines ?? []).map((v) => v.name).join(', '),
    equipment: (r.utensils ?? []).map((v) => v.name),
    difficulty: ['', 'Facile', 'Moyen', 'Difficile'][r.difficulty ?? 0] ?? '',
    // On the French site prepTime is displayed as "Temps total", totalTime is the active preparation time.
    total: minutes(r.prepTime),
    prep: minutes(r.totalTime),
    nutrition: (r.nutrition ?? []).map((n) => n.name + ' ' + n.amount + ' ' + n.unit).join(' · '),
    diet: tags.some((t) => /végétarien|végétalien|veggie|vegan/i.test(t))
      ? 'Végétarien'
      : ingredients.some(
            (i) =>
              i.category === 'Viandes et poissons' &&
              /poisson|saumon|crevette|haddock|cabillaud|lieu|merlu|truite/i.test(i.name),
          )
        ? 'Poisson'
        : ingredients.some((i) => i.category === 'Viandes et poissons')
          ? 'Viande'
          : '',
    ingredients,
    steps,
    verified: true,
  });
}
export function fromHelloFreshPage(html: string, url: string) {
  if (new URL(url).origin !== 'https://www.hellofresh.fr') return null;
  const data = load(html)('script#__NEXT_DATA__').text();
  if (!data) return null;
  try {
    return helloFreshRecipe(JSON.parse(data)?.props?.pageProps?.ssrPayload?.recipe);
  } catch {
    return null;
  }
}
