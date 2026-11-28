import { accountId } from './account-scope';
import type { PreferencesRow, EntityRow } from '../db/schema';
import postgres from 'postgres';
import { monday, today } from './dates';
import { initialShoppingList } from './shopping-period';
import { needs } from './shopping';
import { groceryName, groceryMeasure } from './grocery-names';
import { basis, settings, type State, type Recipe } from './model';
const globalDb = globalThis as unknown as { tableSql?: ReturnType<typeof postgres> };
export function db() {
  if (!process.env.DATABASE_URL) throw Error('Base non configurée');
  return (globalDb.tableSql ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    connect_timeout: 7,
    onnotice: () => {},
  }));
}
export type Tx = postgres.TransactionSql;
export const tables = [
  'recipes',
  'sessions',
  'preps',
  'meals',
  'stock',
  'prices',
  'items',
  'lots',
] as const;
export type Table = (typeof tables)[number];
export async function readState(tx: Tx, lock = false): Promise<State> {
  const [config] = await tx.unsafe<PreferencesRow[]>(
    'select revision,data from preferences where account_id=$1 and id=1' +
      (lock ? ' for update' : ''),
    [accountId()],
  );
  const past = Object.fromEntries(
    (
      await tx`select week::text as week,data from week_history where account_id=${accountId()}`
    ).map((r) => [r.week, basis.parse(r.data)]),
  );
  const state = { past, revision: config.revision, prefs: settings.parse(config.data) } as State;
  for (const t of tables)
    Object.assign(state, {
      [t]: (
        await tx<
          EntityRow<typeof t>[]
        >`select data from ${tx(t)} where account_id=${accountId()} order by id`
      ).map((r) => r.data),
    });
  return state;
}
export async function state() {
  const current = await db().begin('isolation level repeatable read read only', (tx) =>
    readState(tx),
  );
  if (current.prefs.shoppingList) return current;
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    if (s.prefs.shoppingList) return s;
    const day = today();
    const list = initialShoppingList(s, day);
    const from = monday(list.from.day);
    const items = new Map<string, State['items'][number]>();
    // Keep legacy rows available for previous lists and backups. Copy active and future
    // entries into the new list, plus any outstanding manual items from the current trip.
    for (const week of new Set(
      s.items.map((i) => i.week).filter((w) => w >= monday(day) && w.length === 10),
    )) {
      const rows = needs(s, week, day).rows;
      for (const item of s.items.filter((i) => i.week === week)) {
        const [, unit] = groceryMeasure(item.name, 0, item.unit);
        const need = rows.find((r) => r.sourceName === groceryName(item.name) && r.unit === unit);
        if (week < from && (!item.manual || need?.checked || item.checked)) continue;
        const id = crypto.randomUUID();
        const key = item.manual ? 'manuel:' + id : item.key;
        const previous = items.get(key);
        const acquired = item.checked ? (item.checkedAmount ?? need?.buy ?? 0) : 0;
        items.set(key, {
          ...item,
          id,
          week: list.id,
          key,
          checked: !!(previous?.checked || item.checked),
          checkedAmount: (previous?.checkedAmount ?? 0) + acquired,
        });
      }
    }
    for (const row of items.values()) await put(tx, 'items', row);
    for (const lot of s.lots.filter((l) => l.week.length === 10 && l.week >= from))
      await put(tx, 'lots', { ...lot, listId: list.id });
    await tx`update preferences set data=${tx.json({ ...s.prefs, shoppingList: list })} where account_id=${accountId()} and id=1`;
    return readState(tx);
  });
}
export async function put(tx: Tx, t: Table, row: State[Table][number]) {
  await tx`insert into ${tx(t)} (account_id,id,data) values(${accountId()},${row.id},${tx.json(JSON.parse(JSON.stringify(row)))}) on conflict(account_id,id) do update set data=excluded.data`;
}
export async function saveVersion(tx: Tx, id: string, recipeId: string, data: Recipe) {
  await tx`insert into recipe_versions(account_id,id,recipe_id,data) values(${accountId()},${id},${recipeId},${tx.json(data)}) on conflict(account_id,id) do nothing`;
}
