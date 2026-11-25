import { originalNotebook, accountId } from './account-scope';
import { db, readState } from './db';
import { insertRecipe } from './commands';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mediaDir } from './media';
import { existsSync } from 'node:fs';
import { reviewedCatalog } from './reviewed-catalog';
import { problems, type Recipe } from './model';
import { previewUrl } from './web-import';
import { parseNotion } from './notion';
export async function importBatch(rows: ReturnType<typeof parseNotion>[], apply: boolean) {
  const ready = (r: Recipe) => !!(r.base && r.steps.length && r.ingredients.length);
  const catalogDir = 'data/private/reconciliation';
  const catalog =
    accountId() === originalNotebook && existsSync(join(catalogDir, 'matches.json'))
      ? await reviewedCatalog(catalogDir)
      : null;
  const existing = new Set(
    (await db()`select source_key from recipes where account_id=${accountId()}`).map(
      (r) => r.source_key,
    ),
  );
  // Do network reads before acquiring the write lock. Re-check keys inside the transaction.
  for (const row of rows) {
    if (existing.has(row.sourceKey)) continue;
    let published = catalog?.resolve(row.sourceKey, row.data);
    if (!published && !ready(row.data) && !catalog?.indexed.has(row.sourceKey)) {
      const photoId = row.original.match(/hellofresh_s3\/([a-f0-9]{24})\//)?.[1];
      const slug = row.data.title
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const url =
        row.data.url ||
        (photoId ? 'https://www.hellofresh.fr/recipes/' + slug + '-' + photoId : '');
      if (url) {
        const preview = await previewUrl(url);
        if (
          !preview.warning &&
          ready(preview.data) &&
          preview.data.title.trim().toLocaleLowerCase('fr') ===
            row.data.title.trim().toLocaleLowerCase('fr')
        )
          published = preview.data;
      }
    }
    if (published) {
      row.data = {
        ...published,
        title: row.data.title === 'Végétarien' ? published.title : row.data.title,
        favorite: row.data.favorite,
        rating: row.data.rating,
        image: row.data.image || published.image,
      };
      row.issues = problems(row.data);
    }
  }
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    const known = new Set(s.recipes.map((r) => r.sourceKey));
    let added = 0,
      skipped = 0,
      withheld = 0;
    if (apply && s.recipes.length && rows.some((r) => ready(r.data) && !known.has(r.sourceKey))) {
      const folder = join(mediaDir(), '.avant-import');
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const versions =
        await tx`select id,recipe_id,data from recipe_versions where account_id=${accountId()}`;
      await writeFile(
        join(folder, 'revision-' + s.revision + '-' + crypto.randomUUID() + '.json'),
        JSON.stringify({ state: s, versions }),
        { flag: 'wx', mode: 0o600 },
      );
    }
    for (const r of rows) {
      if (known.has(r.sourceKey)) {
        skipped++;
        const saved = s.recipes.find((x) => x.sourceKey === r.sourceKey);
        if (saved) {
          r.data = saved.data;
          r.issues = problems(saved.data);
        }
        continue;
      }
      if (!ready(r.data)) {
        withheld++;
        continue;
      }
      known.add(r.sourceKey);
      if (apply) await insertRecipe(tx, r.data, r.sourceKey, r.original);
      added++;
    }
    if (apply && added)
      await tx`update preferences set revision=revision+1 where account_id=${accountId()} and id=1`;
    return {
      total: rows.length,
      added,
      withheld,
      skipped,
      incomplete: rows.filter((r) => r.issues.length).length,
      withIngredients: rows.filter((r) => r.data.ingredients.length).length,
      withSteps: rows.filter((r) => r.data.steps.length).length,
      withCover: rows.filter((r) => r.data.image).length,
    };
  });
}
