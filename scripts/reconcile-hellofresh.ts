import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isDeepStrictEqual as equal } from 'node:util';
import { db, readState, put } from '../lib/db';
import { parseNotion, type Page } from '../lib/notion';
import { recipe } from '../lib/model';
import { reviewedCatalog } from '../lib/reviewed-catalog';
import { today } from '../lib/dates';
import { insertRecipe } from '../lib/commands';

const dir = 'data/private/reconciliation';
const apply = process.argv.includes('--apply');
if (existsSync('.env')) process.loadEnvFile('.env');
const catalog = await reviewedCatalog(dir);
const report: { title: string; action: string; source?: string; preuve?: string }[] = [];
let versions = 0,
  preps = 0,
  archives = 0;
try {
  await db().begin(async (tx) => {
    const s = await readState(tx, true);
    for (const row of s.recipes) {
      if (!row.sourceKey?.startsWith('notion:')) continue;
      const match = catalog.indexed.get(row.sourceKey);
      if (!match) throw Error('Comparaison manquante : ' + row.data.title);
      const original: Page = JSON.parse(row.original);
      const old = parseNotion(original).data;
      // Older imports left these meat cuts in Autres and taste-only units blank.
      const quantitiesOriginal =
        row.data.ingredients.length === old.ingredients.length &&
        old.ingredients.every((expected, index) => {
          const saved = row.data.ingredients[index];
          const category =
            saved.category === 'Autres' &&
            expected.category === 'Viandes et poissons' &&
            /^(bavette|pavé de|chair à saucisse|steak|blanc de poulet|émincés de|jambon|poitrine fumée|chorizo|cabillaud|haddock|merlu|truite)/i.test(
              expected.name,
            )
              ? saved.category
              : expected.category;
          const unit = expected.unit === 'selon le goût' && !saved.unit ? '' : expected.unit;
          return equal({ ...expected, category, unit }, saved);
        });
      const d = catalog.resolve(row.sourceKey, old);
      if (!d) {
        const personal = !original.cover && !/hello[fF]resh|⏱/i.test(original.content);
        const untouchedCore =
          quantitiesOriginal && equal(old.steps, row.data.steps) && equal(old.base, row.data.base);
        const archive =
          !personal &&
          !row.data.verified &&
          untouchedCore &&
          (!row.data.base || !row.data.steps.length || !row.data.ingredients.length);
        if (archive && !row.archived) {
          archives++;
          if (apply) await put(tx, 'recipes', { ...row, archived: true });
        }
        report.push({
          title: row.data.title,
          action: archive
            ? 'Archive, variante non confirmée'
            : personal
              ? 'Recette personnelle conservée'
              : 'Fiche conservée',
        });
        continue;
      }
      const hasPrior = row.data.source === d.source && row.data.url === d.url && row.data.verified;
      const result = { ...row.data };
      // Keep household edits and the original document. Quantities and base form one unit.
      const quantitiesUnedited =
        quantitiesOriginal && (row.data.base === old.base || row.data.base === d.base);
      if (quantitiesUnedited) {
        result.base = d.base;
        result.ingredients = d.ingredients;
      }
      if (equal(row.data.steps, old.steps)) result.steps = d.steps;
      const fields = [
        'prep',
        'total',
        'difficulty',
        'description',
        'equipment',
        'tags',
        'cuisine',
        'diet',
        'nutrition',
        'source',
        'url',
        'rights',
      ] as const;
      for (const field of fields)
        if (equal(row.data[field], old[field])) Object.assign(result, { [field]: d[field] });
      if (!row.data.image) result.image = d.image;
      if (row.data.title === 'Végétarien' && old.title === row.data.title) result.title = d.title;
      if (
        equal(result.ingredients, d.ingredients) &&
        result.base === d.base &&
        equal(result.steps, d.steps)
      )
        result.verified = true;
      const officialById = new Map(d.ingredients.map((i) => [i.sourceId, i]));
      const previouslyReviewed = {
        ...row.data,
        ingredients: row.data.ingredients.map((i) => {
          const official = i.sourceId && officialById.get(i.sourceId);
          if (!official) return i;
          return {
            ...i,
            category: i.category === 'Autres' ? official.category : i.category,
            unit:
              !i.unit && i.quantity === official.quantity && row.data.base === d.base
                ? official.unit
                : i.unit,
          };
        }),
      };
      const data = recipe.parse(hasPrior ? previouslyReviewed : result);
      const changed = !equal(data, row.data);
      let current = row;
      if (changed) {
        versions++;
        if (apply)
          current = await insertRecipe(tx, data, row.sourceKey, row.original, row.id, row.archived);
      }
      for (const p of s.preps) {
        if (
          p.recipeId !== row.id ||
          p.done ||
          p.ticks.length ||
          p.day < today() ||
          s.meals.some((m) => m.prepId === p.id && m.consumed)
        )
          continue;
        const sameEdition = changed && p.version === row.version && equal(p.snapshot, row.data);
        if (
          !sameEdition &&
          p.snapshot.base &&
          p.snapshot.ingredients.length &&
          p.snapshot.steps.length
        )
          continue;
        if (!data.base || !data.ingredients.length || !data.steps.length) continue;
        // A previously pinned personal ingredient list or step edit must survive the repair.
        const compatible = (['ingredients', 'steps', 'base'] as const).every(
          (f) =>
            equal(p.snapshot[f], old[f]) ||
            equal(p.snapshot[f], row.data[f]) ||
            equal(p.snapshot[f], data[f]),
        );
        if (!compatible) continue;
        preps++;
        if (apply) await put(tx, 'preps', { ...p, snapshot: data, version: current.version });
      }
      report.push({
        title: data.title,
        action: changed ? 'Fiche complétée' : 'Déjà rapprochée',
        source: d.url,
        preuve: match.match,
      });
    }
    if (apply && (versions || archives || preps))
      await tx`update preferences set revision=revision+1 where id=1`;
  });
  await writeFile(
    dir + '/' + (apply ? 'resultat' : 'simulation') + '.json',
    JSON.stringify({ versions, preps, archives, recettes: report }, null, 2),
    { mode: 0o600 },
  );
  console.log({
    comparees: report.length,
    rapprochees: catalog.size,
    versions,
    preps,
    archives,
    apply,
  });
} finally {
  await db().end();
}
