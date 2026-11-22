import { readFile } from 'node:fs/promises';
import { shoppingCategory } from './ingredients';
import type { Recipe } from './model';
import { helloFreshRecipe } from './hellofresh';
type Match = { id: string; title: string; file?: string; url?: string; match?: string };
export async function reviewedCatalog(dir: string) {
  const matches: Match[] = JSON.parse(await readFile(dir + '/matches.json', 'utf8'));
  const key = (s: string) => 'notion:' + s.replaceAll('-', '').toLowerCase();
  const indexed = new Map(matches.map((m) => [key(m.id), m]));
  const confirmed = new Map<string, Recipe>();
  for (const m of matches) {
    if (!m.file) continue;
    if (!/^[a-f0-9]{24}\.json$/.test(m.file)) throw Error('Nom de source invalide');
    const d = helloFreshRecipe(JSON.parse(await readFile(dir + '/recipes/' + m.file, 'utf8')));
    if (!d || d.url !== m.url) throw Error('Source incomplète ou incohérente : ' + m.title);
    confirmed.set(key(m.id), d);
  }
  // Pick one published display name per ingredient ID across this import. Keep the
  // source wording in raw, so equivalent entries group in shopping and stock.
  const labels = new Map<string, Map<string, number>>();
  for (const d of confirmed.values())
    for (const i of d.ingredients) {
      if (!i.sourceId) continue;
      const group = labels.get(i.sourceId) ?? new Map<string, number>();
      group.set(i.name, (group.get(i.name) ?? 0) + 1);
      labels.set(i.sourceId, group);
    }
  const canonical = new Map(
    [...labels].map(([id, names]) => [
      id,
      [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))[0][0],
    ]),
  );
  const byName = new Map<string, Set<string>>();
  for (const [id, names] of labels)
    for (const name of names.keys()) {
      const ids = byName.get(name) ?? new Set<string>();
      ids.add(id);
      byName.set(name, ids);
    }
  function relink(i: Recipe['ingredients'][number]) {
    const ids = byName.get(i.name);
    const sourceId = i.sourceId ?? (ids?.size === 1 ? [...ids][0] : undefined);
    const name = (sourceId && canonical.get(sourceId)) || i.name;
    return { ...i, name, sourceId, category: shoppingCategory(name) };
  }
  function resolve(sourceKey: string, old: Recipe) {
    const match = indexed.get(sourceKey);
    let d = confirmed.get(sourceKey);
    const variant = match?.match?.match(/^variante Notion, portions corroborées \((\d+)\)$/);
    if (d && variant) {
      const names = new Map(d.ingredients.map((i) => [i.name.toLocaleLowerCase('fr'), i]));
      const ingredients = old.ingredients.map((i) => ({
        ...i,
        sourceId: names.get(i.name.toLocaleLowerCase('fr'))?.sourceId,
        unit: i.unit || (/selon le goût/i.test(i.raw) ? 'selon le goût' : ''),
      }));
      d = {
        ...old,
        source: 'Notion · variante HelloFresh',
        url: d.url,
        ingredients,
        base: Number(variant[1]),
        steps: old.steps,
        verified: true,
      };
    }
    if (d) d = { ...d, ingredients: d.ingredients.map(relink) };
    return d;
  }
  return { indexed, resolve, size: confirmed.size };
}
