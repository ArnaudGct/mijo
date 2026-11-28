import { accountId } from './account-scope';
import { db, readState, put } from './db';
import { needs } from './shopping';
import { shoppingKey } from './model';
import { z } from 'zod';
import { UserError } from './commands';
export const change = z.object({
  week: shoppingKey,
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
      const list = s.prefs.shoppingList;
      const legacy = e.week.length === 10 && list?.legacyFrom && e.week >= list.legacyFrom;
      const key = legacy ? list!.id : e.week;
      if (list && key !== list.id)
        throw new UserError('Cette liste est clôturée. Votre copie hors ligne est conservée.', 409);
      const r = needs(s, key).rows.find((x) => x.key === e.key);
      if (!r || r.inPantry || r.buy !== e.quantity || r.unknown !== e.unknown)
        throw new UserError(
          'La liste a changé. Conservez vos coches et comparez avec la liste en ligne.',
          409,
        );
      if (r.checked === e.checked) continue;
      const saved = s.items.find((i) => i.key === e.key && i.week === key && !i.manual);
      const row = {
        id: saved?.id ?? crypto.randomUUID(),
        week: key,
        key: r.key,
        name: r.sourceName,
        quantity: saved?.quantity ?? null,
        unit: r.unit,
        category: r.category,
        manual: false,
        checked: e.checked,
        checkedAmount: e.checked && !r.unknown ? r.buy : undefined,
        scanBaseline: r.scanned,
        bag: saved?.bag ?? null,
      };
      await put(tx, 'items', row);
      s.items = s.items.filter((i) => i.id !== row.id).concat(row);
    }
    if (edits.length)
      await tx`update preferences set revision=revision+1 where account_id=${accountId()} and id=1`;
    return { synced: edits.length };
  });
}
