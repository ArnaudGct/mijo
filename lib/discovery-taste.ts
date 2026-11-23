import { fold } from './grocery-names';
import type { State } from './model';
const common = new Set(
  'avec pour dans une les des aux son ses sur chez style sauce recette facile rapide maison facon frais fraiche petit petite poudre tranche gousse piece selon gout huile olive poivre beurre sachet cuisine blanc blanche noir verte rouges soupe cuillere bouillon eau sel sucre morceaux accompagnement melange fait rape minutes plat nouvelle vegetarien viande poisson'.split(
    ' ',
  ),
);
export function searchWords(text: string) {
  return fold(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => t.replace(/s$/, ''))
    .filter(
      (t) =>
        t.length > 1 &&
        !['de', 'la', 'le', 'du', 'au', 'et', 'des', 'les', 'aux'].includes(t) &&
        !/^\d+$/.test(t),
    );
}
export function words(text: string) {
  return searchWords(text).filter((t) => t.length <= 64 && !common.has(t));
}
export function tastes(s: State) {
  const weights = new Map<string, number>();
  const cooked = new Set(s.preps.filter((p) => p.done).map((p) => p.recipeId));
  for (const r of s.recipes.filter((r) => !r.archived)) {
    const weight = 1 + (r.data.favorite ? 4 : 0) + r.data.rating / 2 + (cooked.has(r.id) ? 2 : 0);
    for (const word of new Set(words(r.data.title + ' ' + r.data.cuisine)))
      weights.set(word, (weights.get(word) ?? 0) + weight * 2);
    for (const word of new Set(r.data.ingredients.flatMap((i) => words(i.name))))
      weights.set(word, (weights.get(word) ?? 0) + weight * 0.5);
  }
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 36)
    .map(([term]) => term);
}
export type DiscoveryFilters = {
  query: string;
  publisher: string;
  minutes: number;
  order: 'affinity' | 'explore' | 'quick';
};
export const defaults: DiscoveryFilters = {
  query: '',
  publisher: '',
  minutes: 0,
  order: 'affinity',
};
