import type { PreferencesRow, EntityRow } from '../db/schema';
import postgres from 'postgres';
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
    'select revision,data from preferences where id=1' + (lock ? ' for update' : ''),
  );
  const past = Object.fromEntries(
    (await tx`select week::text as week,data from week_history`).map((r) => [
      r.week,
      basis.parse(r.data),
    ]),
  );
  const state = { past, revision: config.revision, prefs: settings.parse(config.data) } as State;
  for (const t of tables)
    Object.assign(state, {
      [t]: (await tx<EntityRow<typeof t>[]>`select data from ${tx(t)} order by id`).map(
        (r) => r.data,
      ),
    });
  return state;
}
export async function state() {
  return db().begin('isolation level repeatable read read only', (tx) => readState(tx));
}
export async function put(tx: Tx, t: Table, row: State[Table][number]) {
  await tx`insert into ${tx(t)} (id,data) values(${row.id},${tx.json(JSON.parse(JSON.stringify(row)))}) on conflict(id) do update set data=excluded.data`;
}
export async function saveVersion(tx: Tx, id: string, recipeId: string, data: Recipe) {
  await tx`insert into recipe_versions(id,recipe_id,data) values(${id},${recipeId},${tx.json(data)}) on conflict(id) do nothing`;
}
