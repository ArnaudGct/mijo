import { duration, type State, type Prep, type RecipeRow } from './model';
import { clean, normalize, rounded } from './ingredients';
import { marketBasket } from './market';
import { addDays, inWeek } from './dates';

export const uid = () => crypto.randomUUID();
export function planned(r: RecipeRow, day: string, servings: number): Prep {
  return {
    id: uid(),
    recipeId: r.id,
    version: r.version,
    snapshot: r.data,
    day,
    servings,
    session: null,
    done: false,
    ticks: [],
  };
}
export function defaultMeals(
  p: Prep,
  leftovers: boolean,
  slot: 'soir' | 'midi' = 'soir',
): State['meals'] {
  const base = { prepId: p.id, servings: 1, frozen: false, consumed: false };
  const meals: State['meals'] = [{ ...base, id: uid(), day: p.day, slot }];
  if (leftovers && p.servings > 1 && slot === 'soir')
    meals.push({ ...base, id: uid(), day: addDays(p.day, 1), slot: 'midi' });
  return meals;
}
// Stable within a week, different across weeks even for an entirely new carnet.
function variety(seed: string) {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
export function suggest(s: State, w: string, from = w) {
  const chosen: { id: string; day: string; why: string }[] = [];
  const active = s.recipes.filter(
    (r) =>
      !r.archived &&
      r.data.base &&
      r.data.steps.length &&
      r.data.ingredients.length &&
      (!s.prefs.diet || clean(r.data.diet).includes(clean(s.prefs.diet))),
  );
  const used = s.preps.filter((p) => inWeek(p.day, w));
  const previous = s.preps.filter((p) => p.day < w);
  const dinners = s.meals.filter((m) => inWeek(m.day, w) && m.slot === 'soir').length;
  for (let i = 0; i < 7 && dinners + chosen.length < s.prefs.target; i++) {
    const day = addDays(w, i);
    if (day < from || s.meals.some((m) => m.day === day && m.slot === 'soir')) continue;
    const options = active
      .filter((r) => !used.some((p) => p.recipeId === r.id))
      .map((r) => {
        const history = previous.filter((p) => p.recipeId === r.id);
        const recent = history.some((p) => p.day >= addDays(w, -21));
        const preference = Math.min(4, history.filter((p) => p.done || !p.automatic).length);
        const similar = used.filter(
          (p) => r.data.cuisine && p.snapshot.cuisine === r.data.cuisine,
        ).length;
        const time = duration(r.data);
        const estimate =
          s.prefs.budget === null
            ? null
            : marketBasket({ ...s, preps: [...used, planned(r, day, s.prefs.portions)] }, w);
        const overBudget =
          estimate && s.prefs.budget !== null
            ? Math.max(0, (estimate.cash - s.prefs.budget) / 300)
            : 0;
        const score =
          variety(day + r.id) * 8 +
          (r.data.favorite ? 5 : 0) +
          r.data.rating +
          preference -
          (recent ? 22 : 0) -
          similar * 2 -
          overBudget -
          (s.prefs.maxTime && time && time > s.prefs.maxTime ? 12 : 0);
        return { r, score };
      })
      .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
    if (!options.length) continue;
    const { r } = options[0];
    used.push(planned(r, day, s.prefs.portions));
    chosen.push({
      id: r.id,
      day,
      why: r.data.favorite ? 'Dans vos favoris' : 'Variété de la semaine',
    });
  }
  return chosen;
}
export function storageAlert(p: Prep, m: State['meals'][number]) {
  return m.day < p.day
    ? 'Consommation avant préparation'
    : !m.frozen && m.day >= addDays(p.day, 3)
      ? 'À avancer ou à congeler dès la préparation'
      : '';
}
export function commonMeasures(preps: Prep[]) {
  const groups = new Map<
    string,
    { name: string; total: number; unit: string; parts: { id: string; title: string; q: number }[] }
  >();
  for (const p of preps) {
    for (const i of p.snapshot.ingredients) {
      if (!i.quantity || !i.unit || !p.snapshot.base) continue;
      const [q, u] = normalize((i.quantity * p.servings) / p.snapshot.base, i.unit);
      const name = clean(i.name);
      const key = name + '|' + u;
      const v = groups.get(key) ?? { name: i.name, total: 0, unit: u, parts: [] };
      v.total += q;
      const part = v.parts.find((x) => x.id === p.id);
      if (part) part.q = rounded(part.q + q);
      else v.parts.push({ id: p.id, title: p.snapshot.title, q: rounded(q) });
      groups.set(key, v);
    }
  }
  return [...groups.entries()]
    .filter(([, v]) => v.parts.length > 1)
    .map(([key, v]) => ({
      ...v,
      key:
        key +
        '|' +
        v.parts
          .map((x) => x.id + '/' + x.q)
          .sort()
          .join(','),
    }));
}
export function sessionTasks(s: State, sessionId: string) {
  const group = s.sessions.find((v) => v.id === sessionId);
  const preps = s.preps.filter((v) => v.session === sessionId);
  const common = commonMeasures(preps);
  const shared = (p: Prep) => common.filter((v) => v.parts.some((x) => x.id === p.id)).length;
  preps.sort(
    (a, b) =>
      (duration(b.snapshot) ?? 0) - (duration(a.snapshot) ?? 0) ||
      shared(b) - shared(a) ||
      a.snapshot.title.localeCompare(b.snapshot.title) ||
      a.id.localeCompare(b.id),
  );
  const tasks = preps.flatMap((p) =>
    p.snapshot.steps.map((step, n) => ({ key: p.id + ':' + n, p, n, step })),
  );
  if (!group?.order.length) return tasks;
  const order = new Map(group.order.map((k, i) => [k, i]));
  return tasks.sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity));
}
