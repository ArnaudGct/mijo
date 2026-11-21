import { db, readState } from './db';
import { insertRecipe } from './commands';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mediaDir } from './media';
import { parseNotion } from './notion';
export async function importBatch(rows: ReturnType<typeof parseNotion>[], apply: boolean) {
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    const known = new Set(s.recipes.map((r) => r.sourceKey));
    let added = 0,
      skipped = 0;
    if (apply && s.recipes.length && rows.some((r) => !known.has(r.sourceKey))) {
      const folder = join(mediaDir(), '.avant-import');
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const versions = await tx`select * from recipe_versions`;
      await writeFile(
        join(folder, 'revision-' + s.revision + '-' + crypto.randomUUID() + '.json'),
        JSON.stringify({ state: s, versions }),
        { flag: 'wx', mode: 0o600 },
      );
    }
    for (const r of rows) {
      if (known.has(r.sourceKey)) {
        skipped++;
        continue;
      }
      known.add(r.sourceKey);
      if (apply) await insertRecipe(tx, r.data, r.sourceKey, r.original);
      added++;
    }
    if (apply && added) await tx`update preferences set revision=revision+1 where id=1`;
    return {
      total: rows.length,
      added,
      skipped,
      incomplete: rows.filter((r) => r.issues.length).length,
      withIngredients: rows.filter((r) => r.data.ingredients.length).length,
      withSteps: rows.filter((r) => r.data.steps.length).length,
      withCover: rows.filter((r) => r.data.image).length,
    };
  });
}
