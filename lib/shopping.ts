import type { Ingredient, State, Offer } from './model';
import { clean, normalize, rounded } from './ingredients';
import { inWeek, addDays, today } from './dates';
export type Need = {
  key: string;
  name: string;
  unit: string;
  quantity: number;
  unknown: boolean;
  category: Ingredient['category'];
  recipes: string[];
  stock: number;
  buy: number;
  checked: boolean;
  bag: string;
  manual: boolean;
};
export function needs(s: State, week: string) {
  s = s.past?.[week] ? { ...s, ...s.past[week] } : s;
  const rows = new Map<string, Need>();
  const incomplete: string[] = [];
  function include(i: Ingredient, factor: number | null, title: string, manualKey?: string) {
    const [q, unit] = normalize(i.quantity ?? 0, i.unit);
    const key = manualKey ?? clean(i.name) + '|' + unit;
    const row = rows.get(key) ?? {
      key,
      name: i.name,
      unit,
      quantity: 0,
      unknown: false,
      category: i.category,
      recipes: [],
      stock: 0,
      buy: 0,
      checked: false,
      bag: ['Produits frais', 'Viandes et poissons', 'Surgelés'].includes(i.category)
        ? 'Frais'
        : 'Épicerie',
      manual: !!manualKey,
    };
    if (i.quantity === null || factor === null || !unit) row.unknown = true;
    else row.quantity += q * factor;
    if (title && !row.recipes.includes(title)) row.recipes.push(title);
    rows.set(key, row);
  }
  for (const p of s.preps.filter((p) => inWeek(p.day, week))) {
    const r = p.snapshot;
    if (!r.base || !r.ingredients.length) incomplete.push(r.title);
    for (const i of r.ingredients) include(i, r.base ? p.servings / r.base : null, r.title);
  }
  for (const i of s.items.filter((i) => i.week === week && i.manual))
    include({ ...i, raw: '' }, 1, '', i.key);
  for (const row of rows.values()) {
    const saved = s.items.find((i) => i.week === week && i.key === row.key);
    row.stock = row.manual
      ? 0
      : s.stock
          .filter((i) => clean(i.name) === clean(row.name))
          .reduce((n, i) => {
            const [q, u] = normalize(i.quantity, i.unit);
            return n + (u === row.unit ? q : 0);
          }, 0);
    row.quantity = rounded(row.quantity);
    row.buy = rounded(Math.max(0, row.quantity - row.stock));
    row.checked = saved?.checked ?? false;
    row.bag = saved?.bag ?? row.bag;
  }
  return { rows: [...rows.values()], incomplete: [...new Set(incomplete)] };
}
export interface PriceProvider {
  label: string;
  observations: (s: State) => Offer[];
}
export const recordedPrices: PriceProvider = {
  label: 'Relevés enregistrés',
  observations: (s) => s.prices,
};
export function basket(s: State, w: string, shop: string, provider = recordedPrices) {
  s = s.past?.[w] ? { ...s, ...s.past[w] } : s;
  const { rows, incomplete } = needs(s, w);
  const config = s.prefs.shops.find((x) => x.name === shop);
  let cash = 0,
    used = 0,
    known = 0,
    estimated = false,
    consumedKnown = 0;
  const cutoff = addDays(w, 6) < today() ? addDays(w, 6) : today();
  const prices = provider.observations(s).filter((p) => p.day <= cutoff && p.shop === shop);
  const all = rows.map((row) => {
    const latest = new Map<string, { p: Offer; size: number }>();
    for (const p of prices) {
      if (clean(p.name) !== clean(row.name)) continue;
      const options = [
        normalize(p.quantity, p.unit),
        ...(p.equivalent ? [normalize(p.equivalent.quantity, p.equivalent.unit)] : []),
      ];
      const match = options.find(([, unit]) => unit === row.unit);
      if (!match) continue;
      const k = JSON.stringify([p.product, p.quantity, p.unit, p.barcode]);
      if (!latest.has(k) || latest.get(k)!.p.day <= p.day) latest.set(k, { p, size: match[0] });
    }
    const offers = [...latest.values()]
      .map(({ p, size }) => {
        const count = Math.ceil(rounded(row.buy / size));
        return { p, count, cost: p.cents === null ? null : count * p.cents, size };
      })
      .sort(
        (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || b.p.day.localeCompare(a.p.day),
      );
    const best = row.unknown ? undefined : offers[0];
    if (best && best.cost !== null && best.p.cents !== null) {
      if (row.buy > 0) {
        known++;
        cash += best.cost;
      }
      consumedKnown++;
      used += (row.quantity / best.size) * best.p.cents;
      estimated ||= best.p.estimated;
    }
    const weight = best
      ? (best.p.weight ??
        (normalize(best.p.quantity, best.p.unit)[1] === 'g'
          ? normalize(best.p.quantity, best.p.unit)[0]
          : null))
      : null;
    return {
      ...row,
      best,
      weight: weight !== null ? rounded(weight * best!.count) : null,
      stale: best ? best.p.day < addDays(today(), -30) : false,
    };
  });
  const lines = all.filter((r) => r.buy > 0 || r.unknown);
  const complete = known === lines.length && !incomplete.length;
  const delivery = config?.freeAt != null && cash >= config.freeAt ? 0 : (config?.delivery ?? null);
  const planned = s.preps.filter((p) => inWeek(p.day, w)),
    servings = planned.reduce((n, p) => n + p.servings, 0);
  const comparable =
    complete && planned.length === s.prefs.helloMeals && servings === s.prefs.helloPortions;
  return {
    lines,
    cash,
    used: Math.round(used),
    consumedComplete: consumedKnown === rows.length && !incomplete.length,
    known,
    complete,
    incomplete,
    delivery,
    delivered: complete && delivery !== null ? cash + delivery : null,
    comparable,
    servings,
    estimated,
  };
}
