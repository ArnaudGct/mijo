import { accountId } from './account-scope';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { db, readState, put, saveVersion, tables } from './db';
import { snapshot, recipe, id } from './model';
import { UserError } from './commands';
import sharp from 'sharp';
import { mediaDir } from './media';
const filename = z.string().regex(/^[a-f0-9-]{36}\.webp$/);
const archive = z.object({
  format: z.enum(['mijo/1', 'table-de-saison/1']),
  state: snapshot,
  versions: z.array(z.object({ id, recipe_id: id, data: recipe })),
  media: z.array(z.object({ name: filename, bytes: z.string().base64() })),
  history: z
    .array(z.object({ week: z.iso.date(), data: z.record(z.string(), z.unknown()) }))
    .default([]),
});
export async function backup() {
  const result = await db().begin('isolation level repeatable read read only', async (tx) => ({
    state: await readState(tx),
    versions:
      await tx`select id,recipe_id,data from recipe_versions where account_id=${accountId()}`,
    history: await tx`select week::text,data from week_history where account_id=${accountId()}`,
  }));
  const names = new Set(
    [...JSON.stringify(result).matchAll(/\/api\/media\/([a-f0-9-]{36}\.webp)/g)].map((x) => x[1]),
  );
  const media = [];
  for (const name of names)
    media.push({ name, bytes: (await readFile(join(mediaDir(), name))).toString('base64') });
  return { format: 'mijo/1', ...result, media };
}
export async function restore(input: unknown) {
  const a = archive.parse(input);
  await db().begin(async (tx) => {
    const s = await readState(tx, true);
    if (s.revision || tables.some((t) => s[t].length))
      throw new UserError(
        'La restauration exige un carnet vide pour préserver les données existantes.',
      );
    await mkdir(mediaDir(), { recursive: true });
    for (const m of a.media) {
      const buf = Buffer.from(m.bytes, 'base64');
      if (
        buf.length > 8e6 ||
        (await sharp(buf, { limitInputPixels: 25000000 }).metadata()).format !== 'webp'
      )
        throw new UserError('Photographie invalide.');
      try {
        await writeFile(join(mediaDir(), m.name), buf, { flag: 'wx' });
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code !== 'EEXIST' ||
          !(await readFile(join(mediaDir(), m.name))).equals(buf)
        )
          throw e;
      }
    }
    for (const t of tables) {
      for (const row of a.state[t]) await put(tx, t, row);
      if (t === 'recipes')
        for (const v of a.versions) await saveVersion(tx, v.id, v.recipe_id, v.data);
    }
    for (const h of a.history)
      await tx`insert into week_history(account_id,week,data) values(${accountId()},${h.week},${tx.json(JSON.parse(JSON.stringify(h.data)))})`;
    await tx`update preferences set revision=${a.state.revision + 1},data=${tx.json(a.state.prefs)} where account_id=${accountId()} and id=1`;
  });
  return { restored: a.state.recipes.length };
}
