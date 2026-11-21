import { db, readState, put } from './db';
import { needs } from './shopping';
import { date } from './model';
import { z } from 'zod';
import { UserError } from './commands';
export const change = z.object({
  week: date,
  key: z.string().max(600),
  quantity: z.number().nonnegative(),
  unknown: z.boolean(),
  checked: z.boolean(),
  before: z.boolean(),
});
export async function syncChecks(input: unknown) {
  const edits = z.array(change).max(1000).parse(input);
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    for (const e of edits) {
      const r = needs(s, e.week).rows.find((x) => x.key === e.key);
      if (!r || r.buy !== e.quantity || r.unknown !== e.unknown)
        throw new UserError(
          'La liste a changé. Conservez vos coches et comparez avec la liste en ligne.',
          409,
        );
      if (r.checked === e.checked) continue;
      const saved = s.items.find((i) => i.key === e.key && i.week === e.week);
      const row = {
        id: saved?.id ?? crypto.randomUUID(),
        week: e.week,
        key: r.key,
        name: r.name,
        quantity: saved?.quantity ?? null,
        unit: r.unit,
        category: r.category,
        manual: r.manual,
        checked: e.checked,
        bag: saved?.bag ?? null,
      };
      await put(tx, 'items', row);
      s.items = s.items.filter((i) => i.id !== row.id).concat(row);
    }
    if (edits.length) await tx`update preferences set revision=revision+1 where id=1`;
    return { synced: edits.length };
  });
}
