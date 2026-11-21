import { duration, type State, type Prep, type RecipeRow } from './model';
import { clean, normalize, rounded } from './ingredients';
import { addDays, inWeek } from './dates';
import { basket } from './shopping';
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
export function suggest(s: State, w: string) {
  const chosen: { id: string; day: string; why: string }[] = [];
  const draft = structuredClone(s);
  const active = s.recipes.filter(
    (r) =>
      !r.archived &&
      r.data.base &&
      r.data.ingredients.length &&
      (!s.prefs.diet || clean(r.data.diet).includes(clean(s.prefs.diet))),
  );
  for (let i = 0; i < 7; i++) {
    if (draft.preps.filter((p) => inWeek(p.day, w)).length >= s.prefs.target) break;
    const day = addDays(w, i);
    if (
      draft.meals.some(
        (m) =>
          (m.day === day && m.slot === 'soir') ||
          (s.prefs.leftovers &&
            s.prefs.portions > 1 &&
            m.day === addDays(day, 1) &&
            m.slot === 'midi'),
      )
    )
      continue;
    const used = draft.preps.filter((p) => inWeek(p.day, w));
    const common = new Set(used.flatMap((p) => p.snapshot.ingredients.map((i) => clean(i.name))));
    const options = active
      .filter((r) => !used.some((p) => p.recipeId === r.id))
      .map((r) => {
        const d = duration(r.data);
        const shared = r.data.ingredients.filter((i) => common.has(clean(i.name))).length;
        const prep = planned(r, day, s.prefs.portions),
          bag = basket(
            { ...draft, preps: [...draft.preps, prep] },
            w,
            s.prefs.shops[0]?.name ?? '',
          );
        const heavy = [
          ['Frais', s.prefs.bagFresh],
          ['Épicerie', s.prefs.bagDry],
        ].some(
          ([bagName, cap]) =>
            typeof cap === 'number' &&
            bag.lines.filter((l) => l.bag === bagName).reduce((n, l) => n + (l.weight ?? 0), 0) >
              cap,
        );
        const score =
          (r.data.favorite ? 6 : 0) +
          r.data.rating +
          Math.min(shared, 4) +
          (used.some((p) => p.snapshot.diet === r.data.diet) ? 0 : 2) -
          (s.prefs.maxTime && d && d > s.prefs.maxTime ? 8 : 0) -
          (s.prefs.budget !== null && bag.cash > s.prefs.budget ? 10 : 0) -
          (heavy ? 10 : 0);
        return {
          r,
          score,
          why:
            [
              r.data.favorite ? 'favori' : '',
              shared ? shared + ' ingrédient(s) commun(s)' : '',
              d ? d + ' min' : '',
              heavy ? 'capacité dépassée' : '',
              !bag.complete ? 'prix incomplets' : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'Variété de la semaine',
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.r.data.title.localeCompare(b.r.data.title) ||
          a.r.id.localeCompare(b.r.id),
      );
    if (options[0]) {
      const { r, why } = options[0],
        p = planned(r, day, s.prefs.portions);
      draft.preps.push(p);
      draft.meals.push(...defaultMeals(p, s.prefs.leftovers));
      chosen.push({ id: r.id, day, why });
    }
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
