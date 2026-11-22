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
import { planned, defaultMeals, uid, suggest, optimizedRecipes } from './planner';
import { addDays, inWeek, monday, today } from './dates';
import { sourceUrl } from './source-url';
import { clean } from './ingredients';
import { morningRoutine, pantryReading } from './breakfast-model';
import { shoppingAisles } from './aisles';
import { fold, groceryName } from './grocery-names';
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
    replaceMeal: id.optional(),
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
  z.object({ action: z.literal('moveMeal'), id, day: date, slot: z.enum(['midi', 'soir']) }),
  z.object({
    action: z.literal('fillWeek'),
    week: date,
    optimize: z.boolean().optional(),
    previewRevision: z.number().int().optional(),
  }),
  z.object({ action: z.literal('duplicateWeek'), week: date, to: date }),
  z.object({ action: z.literal('session'), data: session }),
  z.object({
    action: z.literal('pantryWeek'),
    week: date,
    name: z.string().trim().min(1).max(300),
    available: z.boolean(),
  }),
  z.object({ action: z.literal('breakfastRoutine'), routine: morningRoutine }),
  z.object({
    action: z.literal('breakfastStock'),
    readings: z.array(pantryReading).min(1).max(120),
  }),
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
      if (c.replaceMeal) {
        const old = s.meals.find((m) => m.id === c.replaceMeal);
        requireThat(
          old?.day === c.day && old.slot === c.slot && !old.consumed,
          'Le créneau à remplacer a changé.',
        );
        await execute(tx, s, { action: 'removeMeal', id: old.id });
        s.meals = s.meals.filter((m) => m.id !== old.id);
      }
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
      for (const prepId of new Set([m.prepId, s.meals.find((x) => x.id === m.id)?.prepId])) {
        if (prepId && findPrep(prepId).automatic)
          await put(tx, 'preps', { ...findPrep(prepId), automatic: false });
      }
      await put(tx, 'meals', m);
      break;
    }
    case 'fillWeek':
      if (c.previewRevision !== undefined)
        requireThat(
          c.previewRevision === s.revision,
          'Le planning a changé. Rouvrez la proposition.',
        );
      if (c.optimize) {
        for (const { prep, recipe } of optimizedRecipes(s, c.week, today())) {
          Object.assign(prep, {
            recipeId: recipe.id,
            version: recipe.version,
            snapshot: recipe.data,
          });
          await put(tx, 'preps', prep);
        }
      }
      await fillWeek(tx, s, c.week, true);
      break;
    case 'moveMeal': {
      const source = s.meals.find((m) => m.id === c.id);
      requireThat(source && !source.consumed, 'Ce repas ne peut plus être déplacé.');
      const target = s.meals.find((m) => m.day === c.day && m.slot === c.slot);
      if (source.id === target?.id) break;
      requireThat(!target?.consumed, 'Le repas de destination a déjà été consommé.');
      const moved = [{ ...source, day: c.day, slot: c.slot }];
      if (target) moved.push({ ...target, day: source.day, slot: source.slot });
      const remaining = s.meals.filter((m) => !moved.some((x) => x.id === m.id)).concat(moved);
      for (const prepId of new Set(moved.map((m) => m.prepId))) {
        if (!prepId) continue;
        const p = findPrep(prepId);
        const first = remaining
          .filter((m) => m.prepId === prepId)
          .map((m) => m.day)
          .sort()[0];
        if (p.done || p.ticks.length || p.session)
          requireThat(first >= p.day, 'Ce repas précéderait sa préparation.');
        const adjustDay =
          !p.done &&
          !p.ticks.length &&
          !p.session &&
          (first < p.day ||
            moved.some(
              (m) => m.prepId === prepId && s.meals.find((old) => old.id === m.id)?.day === p.day,
            ));
        if (adjustDay || p.automatic)
          await put(tx, 'preps', { ...p, automatic: false, day: adjustDay ? first : p.day });
      }
      await del('meals', source.id);
      if (target) await put(tx, 'meals', moved[1]);
      await put(tx, 'meals', moved[0]);
      break;
    }
    case 'removeMeal': {
      const m = s.meals.find((m) => m.id === c.id);
      requireThat(m && !m.consumed, 'Ce repas ne peut plus être retiré.');
      await del('meals', c.id);
      if (!m.prepId) break;
      const p = findPrep(m.prepId);
      if (p.done || p.ticks.length || p.session) break;
      if (s.meals.some((x) => x.id !== m.id && x.prepId === p.id))
        await put(tx, 'preps', {
          ...p,
          automatic: false,
          servings: Math.max(1, p.servings - m.servings),
        });
      else await del('preps', p.id);
      break;
    }
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
        ...(r
          ? { automatic: false, recipeId: r.id, version: r.version, snapshot: r.data, ticks: [] }
          : {}),
        automatic: false,
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
      for (const i of s.items.filter((i) => i.week === c.week && !i.inPantry)) {
        await put(tx, 'items', { ...i, id: uid(), week: c.to, checked: false });
      }
      break;
    }
    case 'pantryWeek': {
      const name = groceryName(c.name),
        key = 'placard:' + fold(name);
      const stored = s.items.find((i) => i.week === c.week && i.key === key);
      if (c.available && !stored)
        await put(tx, 'items', {
          id: uid(),
          week: c.week,
          key,
          name,
          inPantry: true,
          manual: false,
          checked: false,
          category: 'Autres',
          quantity: null,
          unit: '',
          bag: null,
        });
      if (!c.available && stored) await del('items', stored.id);
      break;
    }
    case 'breakfastRoutine':
    case 'breakfastStock': {
      const cfg = s.prefs.breakfast ?? { routines: [], readings: [] };
      if (c.action === 'breakfastRoutine') {
        for (const [key, food] of Object.entries(c.routine.foods)) {
          const previous = cfg.routines.find((r) => r.foods[key])?.foods[key];
          requireThat(
            !previous || previous.unit === food.unit,
            'Le stock de ' + food.name + ' est mesuré en ' + previous?.unit + '.',
          );
        }
        cfg.routines = cfg.routines.filter((r) => r.from !== c.routine.from).concat(c.routine);
      } else {
        requireThat(cfg.routines.length, 'Activez d’abord le petit-déjeuner.');
        requireThat(
          c.readings.every((r) => r.day <= today()),
          'La date du relevé doit être passée ou actuelle.',
        );
        requireThat(
          c.readings.every((r) =>
            cfg.routines.some((routine) => Object.hasOwn(routine.foods, r.food)),
          ),
          'Ingrédient absent des petits-déjeuners.',
        );
        for (const r of c.readings)
          cfg.readings = cfg.readings
            .filter((old) => old.day !== r.day || old.food !== r.food)
            .concat(r);
      }
      await tx`update preferences set data=${tx.json({ ...s.prefs, breakfast: cfg })} where id=1`;
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
      const known = shoppingAisles(s.prefs.customAisles).find(
        (name) => fold(name) === fold(c.data.category),
      );
      const category = known ?? c.data.category;
      if (c.data.manual && !known) {
        await tx`update preferences set data=${tx.json({ ...s.prefs, customAisles: [...s.prefs.customAisles, category] })} where id=1`;
      }
      await put(tx, 'items', { ...c.data, category, id: existing?.id ?? c.data.id });
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
      await tx`update preferences set data=${tx.json({ ...c.data, customAisles: s.prefs.customAisles, breakfast: s.prefs.breakfast, generatedWeeks: s.prefs.generatedWeeks })} where id=1`;
      break;
  }
}
async function fillWeek(tx: Tx, s: State, week: string, refill = false) {
  requireThat(
    monday(week) === week && week >= monday(today()),
    'Choisissez une semaine présente ou future.',
  );
  const ideas = suggest(s, week, today());
  for (const idea of ideas) {
    const r = s.recipes.find((r) => r.id === idea.id)!;
    const p = { ...planned(r, idea.day, s.prefs.portions), automatic: true };
    const meals = defaultMeals(p, s.prefs.leftovers).filter(
      (m) =>
        !s.meals.some((t) => t.day === m.day && t.slot === m.slot) &&
        // A week already opened belongs to the user, including its empty slots.
        (inWeek(m.day, week) || !s.prefs.generatedWeeks.includes(monday(m.day))),
    );
    await put(tx, 'preps', p);
    s.preps.push(p);
    for (const m of meals) {
      await put(tx, 'meals', m);
      s.meals.push(m);
    }
  }
  // A week opened before the preceding Sunday was planned has no leftover for Monday.
  // Seed this single lunch independently, using a spare serving whenever possible.
  if (
    s.prefs.leftovers &&
    s.prefs.target >= 7 &&
    week >= today() &&
    !s.meals.some((m) => m.day === week && m.slot === 'midi')
  ) {
    let lunch = s.preps.find(
      (p) =>
        p.day <= week &&
        p.day >= addDays(week, -2) &&
        s.meals.filter((m) => m.prepId === p.id).reduce((n, m) => n + m.servings, 0) < p.servings,
    );
    if (!lunch) {
      const extra = suggest(
        { ...s, meals: s.meals.filter((m) => m.day !== week || m.slot !== 'soir') },
        week,
        week,
      )[0];
      const r = extra && s.recipes.find((r) => r.id === extra.id);
      if (r) {
        lunch = { ...planned(r, week, 1), automatic: true };
        await put(tx, 'preps', lunch);
      }
    }
    if (lunch) {
      const m = {
        id: uid(),
        prepId: lunch.id,
        day: week,
        slot: 'midi' as const,
        servings: 1,
        consumed: false,
        frozen: false,
      };
      await put(tx, 'meals', m);
      s.meals.push(m);
    }
  }
  if (refill && s.prefs.leftovers && s.prefs.portions > 1) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(week, i);
      if (day < today() || s.meals.some((m) => m.day === day && m.slot === 'midi')) continue;
      const dinner = s.meals.find((m) => m.day === addDays(day, -1) && m.slot === 'soir');
      const p = s.preps.find((p) => p.id === dinner?.prepId);
      if (!p || p.day < addDays(day, -2)) continue;
      const allocated = s.meals
        .filter((m) => m.prepId === p.id)
        .reduce((n, m) => n + m.servings, 0);
      if (allocated >= p.servings) {
        if (!p.automatic || p.done || p.ticks.length || p.servings >= 100) continue;
        p.servings += 1;
        await put(tx, 'preps', p);
      }
      const m = {
        id: uid(),
        day,
        slot: 'midi' as const,
        prepId: p.id,
        servings: 1,
        frozen: false,
        consumed: false,
      };
      await put(tx, 'meals', m);
      s.meals.push(m);
    }
  }
  if (!s.prefs.generatedWeeks.includes(week)) {
    s.prefs.generatedWeeks.push(week);
    await tx`update preferences set data=${tx.json(s.prefs)} where id=1`;
  }
}
export async function ensureWeek(week: string) {
  return db().begin(async (tx) => {
    const s = await readState(tx, true);
    if (
      week < monday(today()) ||
      s.prefs.generatedWeeks.includes(week) ||
      !s.recipes.some(
        (r) => !r.archived && r.data.base && r.data.steps.length && r.data.ingredients.length,
      )
    )
      return { changed: false };
    await fillWeek(tx, s, week);
    await tx`update preferences set revision=revision+1 where id=1`;
    return { changed: true };
  });
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
    const mealCount = s.meals.length;
    const id = await execute(tx, s, c);
    await tx`update preferences set revision=revision+1 where id=1`;
    return {
      id,
      revision: revision + 1,
      addedMeals: c.action === 'fillWeek' && !c.optimize ? s.meals.length - mealCount : undefined,
    };
  });
}
