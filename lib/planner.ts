import { duration, type State, type Prep, type RecipeRow } from './model';
import { fold, groceryName } from './grocery-names';
import { sourceUrl } from './source-url';
import { clean, normalize, rounded, shoppingCategory } from './ingredients';
import { marketBasket, recipeCost } from './market';
import { isPlanningDish } from './discovery-course';
import { planningSource } from './recipe-sources';
import { recipeDiet } from './recipe-diet';
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
export function batchMeals(day: string, slot: 'midi' | 'soir', servings: number, perMeal: number) {
  return Array.from({ length: Math.ceil(servings / perMeal) }, (_, i) => ({
    day: addDays(day, i),
    slot,
    servings: Math.min(perMeal, servings - i * perMeal),
  }));
}
// Stable within a week, different across weeks even for an entirely new carnet.
function variety(seed: string) {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
type Recipe = RecipeRow['data'];
type Occasion = { day: string; servings: number; recipeId?: string };
export const planStrategies = ['balanced', 'economy', 'shared', 'random'] as const;
export const planDiets = ['preferences', 'mixed', 'flexitarian', 'vegetarian'] as const;
export type PlanVariation = {
  seed: string;
  avoid: string[];
  sources?: string[];
  favoritesOnly?: boolean;
  strategy?: (typeof planStrategies)[number];
  diet?: (typeof planDiets)[number];
};
export function permitsMeal(recipe: Recipe, variation?: PlanVariation) {
  return variation?.diet !== 'vegetarian' || recipeDiet(recipe) === 'Végétarien';
}
export function eligibleDish(r: RecipeRow, s: State, variation?: PlanVariation) {
  const data = r.data;
  return (
    !r.archived &&
    !!data.base &&
    !!data.ingredients.length &&
    !!data.steps.length &&
    isPlanningDish(data.title, data.tags) &&
    permitsMeal(data, variation) &&
    (!variation?.favoritesOnly || data.favorite) &&
    (!variation?.sources?.length || variation.sources.includes(planningSource(data))) &&
    ((variation?.diet && variation.diet !== 'preferences') ||
      !s.prefs.diet ||
      clean(data.diet).includes(clean(s.prefs.diet)))
  );
}
function groceries(recipe: Recipe) {
  const result = new Map<string, { name: string; weight: number }>();
  for (const i of recipe.ingredients) {
    const name = groceryName(i.name),
      key = fold(name);
    if (i.unit === 'selon le goût' || /^(sel|poivre|eau|huile|vinaigre|sucre|bouillon)\b/.test(key))
      continue;
    const fresh = ['Fruits et légumes', 'Produits frais', 'Viandes et poissons'].includes(
      shoppingCategory(name),
    );
    const aromatic = /^(ail|gingembre|piment|echalote)\b/.test(key);
    result.set(key, { name, weight: aromatic ? 0.6 : fresh ? 3 : 1 });
  }
  return result;
}
function dishFamily(r: Recipe) {
  return (
    fold(r.title).match(
      /\b(bibimbap|risotto|pizza|burger|tacos?|curry|dahl|dhal|quiche|gratin|soupe|veloute|salade|lasagnes?|ravioli|wraps?|bowl|ramen|gnocchi|spaghetti|penne|orzo|tartines?|galettes?|wok|tagliatelles?|tortillas?|paella|chili)s?\b/,
    )?.[1] ?? ''
  );
}
function protein(r: Recipe) {
  const names = fold(
    r.ingredients
      .filter((i) => !/^bouillon|^sauce |^epices/.test(fold(i.name)))
      .map((i) => i.name)
      .join(' '),
  );
  return [
    /\b(poulet|dinde|volaille)\b/,
    /\b(porc|jambon|lardons?|bacon|chorizo)\b/,
    /\b(boeuf|bavette|steaks?|veau)\b/,
    /\b(saumon|thon|poisson|truite|cabillaud|lieu|crevettes?|merlu)\b/,
    /\b(tofu|tempeh)\b/,
  ].findIndex((re) => re.test(names));
}
function recommend(
  s: State,
  w: string,
  slots: Occasion[],
  fixed: Prep[],
  variation?: PlanVariation,
) {
  if (!slots.length) return [];
  const used = [...fixed];
  const strategy = variation?.strategy ?? 'balanced';
  const proteins = new Map<number, number>();
  const previous = s.preps.filter((p) => p.day < w);
  const options = s.recipes
    .filter((r) => eligibleDish(r, s, variation))
    .map((r) => ({
      r,
      foods: groceries(r.data),
      vegetarian: variation?.diet === 'flexitarian' && recipeDiet(r.data) === 'Végétarien',
      cost: strategy === 'economy' ? recipeCost(r.data) : null,
      family: dishFamily(r.data),
      main: protein(r.data),
      url: sourceUrl(r.data.url),
    }));
  const frequency = new Map<string, number>();
  for (const { foods } of options)
    for (const key of foods.keys()) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  const results: { id: string; day: string; why: string }[] = [];
  const counts = new Map<string, number>();
  function include(r: Recipe) {
    const main = protein(r);
    proteins.set(main, (proteins.get(main) ?? 0) + 1);
    for (const key of groceries(r).keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const prep of used) include(prep.snapshot);
  const inStock = new Set(
    s.stock.filter((i) => i.quantity > 0).map((i) => fold(groceryName(i.name))),
  );
  const previousMenu = new Set(slots.map((slot) => slot.recipeId));
  const previousPreview = new Set(variation?.avoid);
  for (const { day, servings, recipeId } of slots) {
    const unused = options.filter(
      ({ r, url }) =>
        !used.some(
          (p) =>
            p.recipeId === r.id ||
            fold(p.snapshot.title) === fold(r.data.title) ||
            (url && sourceUrl(p.snapshot.url) === url),
        ),
    );
    // A small carnet can already contain repeated meals. Offer an alternative
    // to an existing slot even when every eligible recipe has been used.
    let available =
      unused.length ||
      !variation ||
      (!recipeId &&
        variation.diet !== 'vegetarian' &&
        !variation.sources?.length &&
        !variation.favoritesOnly)
        ? unused
        : options;
    if (variation?.diet === 'flexitarian') {
      // Aim for two vegetarian preparations out of three, including fixed meals.
      const veg = used.filter((p) => recipeDiet(p.snapshot) === 'Végétarien').length;
      const preferVeg = veg < Math.round(((used.length + 1) * 2) / 3);
      const preferred = available.filter((o) => o.vegetarian === preferVeg);
      if (preferred.length) available = preferred;
    }
    const candidates = available
      .map(({ r, foods, family, main, cost }) => {
        const history = previous.filter((p) => p.recipeId === r.id);
        let overlap = 0,
          support = 0,
          novelty = 0;
        const shared: { name: string; weight: number }[] = [];
        for (const [key, { name, weight }] of foods) {
          const n = counts.get(key) ?? 0;
          if (n) {
            overlap += weight / (1 + 0.6 * (n - 1));
            shared.push({ name, weight });
          } else {
            novelty += weight;
            support += (frequency.get(key) ?? 0) > 1 ? weight : 0;
          }
          if (inStock.has(key)) overlap += weight * 0.35;
        }
        const time = duration(r.data);
        const score =
          Math.min(14, overlap * 2) +
          (10 * overlap) / Math.max(1, overlap + novelty) -
          Math.min(12, novelty) * 0.35 +
          (!counts.size ? (5 * support) / Math.max(1, novelty) : 0) +
          variety((variation?.seed ?? '') + day + r.id) * (variation ? 8 : 2) +
          (r.data.favorite ? 4 : 0) +
          r.data.rating +
          Math.min(3, history.filter((p) => p.done || !p.automatic).length) -
          (history.some((p) => p.day >= addDays(w, -21)) ? 14 : 0) -
          used.filter((p) => family && dishFamily(p.snapshot) === family).length * 17 -
          (main < 0 ? 0 : Math.max(0, (proteins.get(main) ?? 0) - 1) * 5) -
          used.filter((p) => r.data.cuisine && p.snapshot.cuisine === r.data.cuisine).length * 2 -
          (s.prefs.maxTime && time && time > s.prefs.maxTime ? 12 : 0);
        const repeat = variation
          ? Number(recipeId === r.id) * 4 +
            Number(previousPreview.has(r.id)) * 2 +
            Number(previousMenu.has(r.id))
          : 0;
        const priority =
          strategy === 'shared'
            ? counts.size
              ? overlap
              : support / Math.max(1, novelty)
            : strategy === 'random'
              ? variety(variation!.seed + day + r.id)
              : 0;
        const perPortion =
          cost?.cents != null && cost.portions ? cost.cents / cost.portions : Infinity;
        return {
          r,
          score,
          shared,
          repeat,
          priority,
          perPortion,
          avoid: Number(previousPreview.has(r.id)),
        };
      })
      .sort(
        (a, b) =>
          a.avoid - b.avoid ||
          b.priority - a.priority ||
          a.repeat - b.repeat ||
          b.score - a.score ||
          a.r.id.localeCompare(b.r.id),
      );
    if (!candidates.length) break;
    // Compare retail packs for promising recipes; stock and the existing basket are already accounted for.
    const basket = marketBasket({ ...s, preps: used }, w, undefined, w);
    const finalists = (
      s.prefs.budget === null && strategy !== 'economy' ? candidates.slice(0, 8) : candidates
    )
      .map((c) => {
        const after = marketBasket(
          { ...s, preps: [...used, planned(c.r, day, servings)] },
          w,
          undefined,
          w,
        );
        const extra = Math.max(0, after.cash - basket.cash) / 100;
        const unknown = Math.max(0, after.missing - basket.missing);
        const over = s.prefs.budget === null ? 0 : Math.max(0, after.cash - s.prefs.budget) / 300;
        return {
          ...c,
          unknown,
          extra,
          rank: c.score - Math.min(8, extra * 0.6) - unknown * 2 - over,
        };
      })
      .sort((a, b) => {
        if (strategy === 'economy')
          return (
            a.unknown - b.unknown ||
            a.avoid - b.avoid ||
            a.extra - b.extra ||
            a.perPortion - b.perPortion ||
            a.repeat - b.repeat ||
            b.rank - a.rank ||
            a.r.id.localeCompare(b.r.id)
          );
        return (
          (strategy !== 'balanced' ? a.avoid - b.avoid || b.priority - a.priority : 0) ||
          a.repeat - b.repeat ||
          b.rank - a.rank ||
          a.r.id.localeCompare(b.r.id)
        );
      });
    const { r, shared } = finalists[0];
    results.push({
      id: r.id,
      day,
      why:
        strategy === 'economy'
          ? finalists[0].unknown
            ? 'Prix partiellement renseignés'
            : 'Priorité au coût du panier'
          : strategy === 'random'
            ? 'Tirage aléatoire'
            : shared.length
              ? 'En commun : ' +
                shared
                  .sort((a, b) => b.weight - a.weight)
                  .slice(0, 3)
                  .map((x) => x.name)
                  .join(', ')
              : r.data.favorite
                ? 'Dans vos favoris'
                : 'Variété de la semaine',
    });
    used.push(planned(r, day, servings));
    include(r.data);
  }
  return results;
}
export function weekPreparations(s: State, w: string) {
  const first = new Map<string, State['meals'][number]>();
  for (const m of s.meals
    .filter((m) => m.prepId && inWeek(m.day, w))
    .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot))) {
    if (m.prepId && !first.has(m.prepId)) first.set(m.prepId, m);
  }
  return s.preps
    .filter((p) => inWeek(p.day, w) || first.has(p.id))
    .map((p) => ({ p, first: first.get(p.id) }))
    .sort(
      (a, b) =>
        (a.first?.day ?? a.p.day).localeCompare(b.first?.day ?? b.p.day) ||
        (a.first?.slot ?? 'z').localeCompare(b.first?.slot ?? 'z') ||
        a.p.snapshot.title.localeCompare(b.p.snapshot.title, 'fr'),
    );
}
export function suggest(s: State, w: string, from = w, variation?: PlanVariation) {
  const weekMeals = s.meals.filter((m) => inWeek(m.day, w) && m.slot === 'soir');
  const slots = Array.from({ length: 7 }, (_, i) => ({
    day: addDays(w, i),
    servings: s.prefs.portions,
  }))
    .filter(({ day }) => day >= from && !weekMeals.some((m) => m.day === day))
    .slice(0, Math.max(0, s.prefs.target - weekMeals.length));
  return recommend(
    s,
    w,
    slots,
    weekPreparations(s, w).map((x) => x.p),
    variation,
  );
}
export function optimizedRecipes(s: State, w: string, from: string, variation?: PlanVariation) {
  const week = weekPreparations(s, w).map((x) => x.p);
  const editable = week.filter((p) => {
    const meals = s.meals.filter((m) => m.prepId === p.id);
    return (
      (variation || p.automatic) &&
      !p.batchPerMeal &&
      inWeek(p.day, w) &&
      p.day >= from &&
      !p.done &&
      !p.session &&
      !p.ticks.length &&
      meals.length &&
      !meals.some((m) => m.day === w && m.slot === 'midi') &&
      meals.every(
        (m) =>
          !m.consumed &&
          !m.frozen &&
          m.day >= from &&
          (inWeek(m.day, w) ||
            (variation && p.day === addDays(w, 6) && m.slot === 'midi' && m.day === addDays(w, 7))),
      )
    );
  });
  const ideas = recommend(
    s,
    w,
    editable,
    week.filter((p) => !editable.includes(p)),
    variation,
  );
  if (ideas.length !== editable.length) return [];
  return ideas.flatMap((idea, i) =>
    idea.id === editable[i].recipeId
      ? []
      : [{ prep: editable[i], recipe: s.recipes.find((r) => r.id === idea.id)!, why: idea.why }],
  );
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
