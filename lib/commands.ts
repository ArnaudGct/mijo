import { z } from 'zod';
import { db, readState, put, saveVersion, type Tx, type Table } from './db';
import {
  recipe,
  settings,
  session,
  inventory,
  offer,
  item,
  meal,
  date,
  id,
  portions,
  type State,
  type Recipe,
} from './model';
import { planned, defaultMeals, uid } from './planner';
import { addDays, inWeek, monday, today } from './dates';
import { sourceUrl } from './source-url';
import { clean } from './ingredients';
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function requireThat(v: unknown, msg: string): asserts v {
  if (!v) throw new UserError(msg);
}
export async function insertRecipe(
  tx: Tx,
  data: Recipe,
  sourceKey: string | null,
  original = '',
  rid = uid(),
  archived = false,
) {
  const version = uid();
  const row = { id: rid, version, data, sourceKey, original, archived };
  await put(tx, 'recipes', row);
  await saveVersion(tx, version, rid, data);
  return row;
}
export const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('recipe'),
    id: id.optional(),
    data: recipe,
    sourceKey: z.string().max(3000).nullable().optional(),
    original: z.string().max(500000).optional(),
  }),
  z.object({ action: z.literal('archive'), id, archived: z.boolean() }),
  z.object({ action: z.literal('deleteRecipe'), id, confirm: z.literal(true) }),
  z.object({
    action: z.literal('batchPlan'),
    id,
    day: date,
    name: z.string().min(1).max(300),
    preps: z.array(id).min(1).max(100),
  }),
  z.object({
    action: z.literal('plan'),
    id,
    day: date,
    servings: portions,
    confirmedBase: portions.optional(),
    slot: z.enum(['soir', 'midi']).default('soir'),
    leftovers: z.boolean(),
  }),
  z.object({
    action: z.literal('prep'),
    id,
    servings: portions,
    session: id.nullable(),
    day: date,
    recipeId: id.optional(),
    useCurrent: z.boolean().optional(),
  }),
  z.object({ action: z.literal('removePrep'), id }),
  z.object({ action: z.literal('meal'), data: meal }),
  z.object({ action: z.literal('removeMeal'), id }),
  z.object({ action: z.literal('duplicateWeek'), week: date, to: date }),
  z.object({ action: z.literal('session'), data: session }),
  z.object({ action: z.literal('stock'), data: inventory }),
  z.object({ action: z.literal('price'), data: offer }),
  z.object({ action: z.literal('item'), data: item }),
  z.object({
    action: z.literal('remove'),
    table: z.enum(['stock', 'items', 'prices', 'sessions']),
    id,
  }),
  z.object({
    action: z.literal('tick'),
    id,
    index: z.number().int().nonnegative(),
    checked: z.boolean(),
  }),
  z.object({ action: z.literal('finish'), id, done: z.boolean() }),
  z.object({ action: z.literal('prefs'), data: settings }),
]);
export type Command = z.input<typeof input>;
export async function execute(tx: Tx, s: State, c: z.output<typeof input>) {
  const findPrep = (id: string) => {
    const p = s.preps.find((x) => x.id === id);
    requireThat(p, 'Préparation introuvable.');
    return p;
  };
  const findRecipe = (id: string) => {
    const r = s.recipes.find((x) => x.id === id);
    requireThat(r, 'Recette introuvable.');
    return r;
  };
  const del = async (t: Table, id: string) => {
    await tx`delete from ${tx(t)} where id=${id}`;
  };
  const free = (m: State['meals'][number]) =>
    requireThat(
      !s.meals.some((x) => x.id !== m.id && x.day === m.day && x.slot === m.slot),
      'Ce créneau est déjà occupé.',
    );
  switch (c.action) {
    case 'recipe': {
      const r = c.id ? findRecipe(c.id) : undefined;
      if (!r && c.data.url && !c.sourceKey?.startsWith('copy:'))
        requireThat(
          c.data.base && c.data.ingredients.length && c.data.steps.length,
          'La source doit fournir les portions, les ingrédients et les étapes.',
        );
      const key =
        r?.sourceKey ?? c.sourceKey ?? (c.data.url ? 'url:' + sourceUrl(c.data.url) : null);
      if (!r && key)
        requireThat(
          !s.recipes.some(
            (x) =>
              x.sourceKey === key ||
              (!key.startsWith('copy:') &&
                c.data.url &&
                sourceUrl(x.data.url) === sourceUrl(c.data.url)),
          ),
          'Cette source figure déjà dans la bibliothèque.',
        );
      return (
        await insertRecipe(tx, c.data, key, r?.original ?? c.original ?? '', r?.id, r?.archived)
      ).id;
    }
    case 'archive':
      await put(tx, 'recipes', { ...findRecipe(c.id), archived: c.archived });
      break;
    case 'deleteRecipe':
      requireThat(findRecipe(c.id).archived, 'Archivez la recette avant sa suppression.');
      requireThat(
        !s.preps.some((p) => p.recipeId === c.id),
        'Cette recette figure dans le planning ou son historique. Gardez-la dans les archives.',
      );
      await del('recipes', c.id);
      break;
    case 'plan': {
      let r = findRecipe(c.id);
      if (c.confirmedBase && r.data.base === null)
        r = await insertRecipe(
          tx,
          { ...r.data, base: c.confirmedBase },
          r.sourceKey,
          r.original,
          r.id,
          r.archived,
        );
      requireThat(!r.archived, 'Recette archivée.');
      requireThat(
        r.data.ingredients.length && r.data.steps.length,
        'Cette recette a besoin de ses ingrédients et de ses étapes avant la planification.',
      );
      const p = planned(r, c.day, c.servings);
      const meals = defaultMeals(p, c.leftovers, c.slot);
      meals.forEach(free);
      await put(tx, 'preps', p);
      for (const m of meals) await put(tx, 'meals', m);
      break;
    }
    case 'meal': {
      const m = c.data;
      free(m);
      if (m.prepId) {
        const p = findPrep(m.prepId);
        requireThat(m.day >= p.day, 'Le repas précède la préparation.');
        requireThat(
          s.meals
            .filter((x) => x.prepId === p.id && x.id !== m.id)
            .reduce((n, x) => n + x.servings, 0) +
            m.servings <=
            p.servings,
          'Portions insuffisantes dans cette préparation.',
        );
        requireThat(!m.consumed || p.done, 'Terminez d’abord la préparation.');
      }
      await put(tx, 'meals', m);
      break;
    }
    case 'removeMeal':
      await del('meals', c.id);
      break;
    case 'prep': {
      const p = findPrep(c.id),
        ss = c.session ? s.sessions.find((x) => x.id === c.session) : null;
      requireThat(!c.session || ss, 'Session introuvable.');
      const day = ss?.day ?? c.day;
      const meals = s.meals.filter((m) => m.prepId === p.id);
      requireThat(
        meals.every((m) => m.day >= day),
        'Déplacez les repas qui précèdent cette date.',
      );
      requireThat(
        meals.reduce((n, m) => n + m.servings, 0) <= c.servings,
        'Réduisez les portions déjà affectées aux repas.',
      );
      const r =
        c.recipeId &&
        (c.recipeId !== p.recipeId ||
          (c.useCurrent && findRecipe(c.recipeId).version !== p.version))
          ? findRecipe(c.recipeId)
          : null;
      requireThat(!r || !p.done, 'Cette préparation est déjà terminée.');
      await put(tx, 'preps', {
        ...p,
        ...(r ? { recipeId: r.id, version: r.version, snapshot: r.data, ticks: [] } : {}),
        session: c.session,
        day,
        servings: c.servings,
      });
      break;
    }
    case 'removePrep':
      for (const m of s.meals.filter((m) => m.prepId === c.id)) await del('meals', m.id);
      await del('preps', c.id);
      break;
    case 'batchPlan': {
      const selected = c.preps.map(findPrep);
      requireThat(
        selected.every((p) => !p.session || p.session === c.id),
        'Une préparation appartient déjà à une autre session.',
      );
      requireThat(
        selected.every((p) => !s.meals.some((m) => m.prepId === p.id && m.day < c.day)),
        'La session doit précéder les repas.',
      );
      const old = s.sessions.find((g) => g.id === c.id);
      await put(tx, 'sessions', {
        id: c.id,
        day: c.day,
        name: c.name,
        order: old?.order.filter((k) => c.preps.includes(k.split(':')[0])) ?? [],
        weighed: old?.weighed ?? [],
      });
      for (const p of selected) await put(tx, 'preps', { ...p, session: c.id, day: c.day });
      for (const p of s.preps.filter((p) => p.session === c.id && !c.preps.includes(p.id)))
        await put(tx, 'preps', { ...p, session: null });
      break;
    }
    case 'session': {
      const ranked = new Map<string, number>();
      for (const key of c.data.order) {
        const [pid, idx] = key.split(':');
        const p = s.preps.find((x) => x.id === pid && x.session === c.data.id);
        const n = Number(idx);
        requireThat(
          p &&
            Number.isInteger(n) &&
            n === (ranked.get(pid) ?? -1) + 1 &&
            n < p.snapshot.steps.length,
          'Conservez l’ordre des étapes de chaque recette.',
        );
        ranked.set(pid, n);
      }
      const linked = s.preps.filter((p) => p.session === c.data.id);
      requireThat(
        !linked.some((p) => s.meals.some((m) => m.prepId === p.id && m.day < c.data.day)),
        'La session suivrait un repas déjà prévu.',
      );
      await put(tx, 'sessions', c.data);
      for (const p of linked) await put(tx, 'preps', { ...p, day: c.data.day });
      break;
    }
    case 'duplicateWeek': {
      requireThat(
        monday(c.week) === c.week && monday(c.to) === c.to && c.week !== c.to,
        'Choisissez deux semaines différentes.',
      );
      requireThat(
        !s.preps.some((p) => inWeek(p.day, c.to)) &&
          !s.items.some((i) => i.week === c.to) &&
          !s.sessions.some((x) => inWeek(x.day, c.to)) &&
          !s.meals.some((m) => inWeek(m.day, c.to)),
        'La semaine de destination doit être vide.',
      );
      const shift = (d: string) => addDays(d, (Date.parse(c.to) - Date.parse(c.week)) / 86400000);
      const refs = new Map<string, string>(),
        groups = new Map<string, string>();
      for (const ss of s.sessions.filter((x) => inWeek(x.day, c.week))) {
        const key = uid();
        groups.set(ss.id, key);
        await put(tx, 'sessions', { ...ss, id: key, day: shift(ss.day), order: [] });
      }
      for (const p of s.preps.filter((p) => inWeek(p.day, c.week))) {
        const key = uid();
        refs.set(p.id, key);
        await put(tx, 'preps', {
          ...p,
          id: key,
          day: shift(p.day),
          session: groups.get(p.session ?? '') ?? null,
          done: false,
          ticks: [],
        });
      }
      for (const m of s.meals.filter((m) =>
        m.prepId ? refs.has(m.prepId) : inWeek(m.day, c.week),
      )) {
        const next = {
          ...m,
          id: uid(),
          prepId: refs.get(m.prepId ?? '') ?? null,
          day: shift(m.day),
          consumed: false,
        };
        free(next);
        await put(tx, 'meals', next);
      }
      for (const i of s.items.filter((i) => i.week === c.week)) {
        await put(tx, 'items', { ...i, id: uid(), week: c.to, checked: false });
      }
      break;
    }
    case 'stock':
      await put(tx, 'stock', c.data);
      break;
    case 'price':
      await put(tx, 'prices', c.data);
      break;
    case 'item': {
      const existing = s.items.find((x) => x.week === c.data.week && x.key === c.data.key);
      await put(tx, 'items', { ...c.data, id: existing?.id ?? c.data.id });
      break;
    }
    case 'remove':
      requireThat(
        c.table !== 'sessions' || !s.preps.some((p) => p.session === c.id),
        'Retirez les préparations de la session avant de la supprimer.',
      );
      await del(c.table, c.id);
      break;
    case 'tick': {
      const p = findPrep(c.id);
      requireThat(c.index < p.snapshot.steps.length, 'Étape inconnue.');
      const ticks = p.ticks.filter((n) => n !== c.index);
      if (c.checked) ticks.push(c.index);
      await put(tx, 'preps', { ...p, ticks });
      break;
    }
    case 'finish': {
      const p = findPrep(c.id);
      requireThat(
        c.done || !s.meals.some((m) => m.prepId === p.id && m.consumed),
        'Des portions ont déjà été consommées.',
      );
      await put(tx, 'preps', {
        ...p,
        done: c.done,
        ticks: c.done ? p.snapshot.steps.map((_, n) => n) : p.ticks,
      });
      break;
    }
    case 'prefs':
      requireThat(
        new Set(c.data.shops.map((x) => clean(x.name))).size === c.data.shops.length,
        'Deux magasins portent le même nom.',
      );
      await tx`update preferences set data=${tx.json(c.data)} where id=1`;
      break;
  }
}
export async function mutate(revision: number, cmd: unknown) {
  const c = input.parse(cmd);
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    if (s.revision !== revision)
      throw new UserError(
        'Le planning a changé sur un autre appareil. Actualisez avant de réessayer.',
        409,
      );
    if (['prefs', 'stock', 'price', 'remove'].includes(c.action)) {
      const weeks = new Set([...s.preps.map((p) => monday(p.day)), ...s.items.map((i) => i.week)]);
      for (const w of weeks) {
        if (w < monday(today()) && !s.past[w])
          await tx`insert into week_history values(${w},${tx.json({ stock: s.stock, prices: s.prices, prefs: s.prefs })}) on conflict do nothing`;
      }
    }
    const id = await execute(tx, s, c);
    await tx`update preferences set revision=revision+1 where id=1`;
    return { id, revision: revision + 1 };
  });
}
