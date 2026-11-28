import type { Ingredient, State, Offer } from './model';
import { groceryName, fold, groceryMeasure } from './grocery-names';
import { breakfastKey } from './breakfast-model';
import { breakfastPlan, breakfastMeasure } from './breakfast';
import { clean, normalize, rounded } from './ingredients';
import { shoppingPreps, shoppingStart } from './shopping-period';
import { addDays, today } from './dates';
export type Need = {
  key: string;
  name: string;
  sourceName: string;
  unit: string;
  quantity: number;
  unknown: boolean;
  category: string;
  recipes: string[];
  stock: number;
  buy: number;
  scanned: number;
  checked: boolean;
  inPantry: boolean;
  bag: string;
  manual: boolean;
};
export function needs(
  s: State,
  week: string,
  asOf = today(),
  start = shoppingStart(s, week),
  morningStart = addDays(start, 1),
) {
  s = s.past?.[week] ? { ...s, ...s.past[week] } : s;
  const rows = new Map<string, Need>();
  const weekItems = s.items.filter((i) => i.week === week);
  const edits = new Map(
    weekItems.filter((i) => i.listEdit).map((i) => [fold(i.name), i.listEdit!]),
  );
  const incomplete: string[] = [];
  const breakfast = breakfastPlan(s, morningStart, asOf, start);
  const byFood = new Map(breakfast.map((p) => [p.key, p]));
  const cookedBefore = new Map<string, number>();
  function include(
    i: Pick<Ingredient, 'name' | 'quantity' | 'unit'> & { category: string },
    factor: number | null,
    title: string,
    manualKey?: string,
    day?: string,
  ) {
    const food = breakfastKey(i.name),
      product = byFood.get(food);
    const [q, unit] = product
      ? breakfastMeasure(product, i.name, i.quantity ?? 0, i.unit)
      : groceryMeasure(i.name, i.quantity ?? 0, i.unit);
    const name = groceryName(i.name);
    if (!manualKey && edits.get(fold(name))?.hideGenerated) return;
    const key = clean(name) + '|' + unit;
    if (
      product?.countedOn &&
      day &&
      day < product.stockStart &&
      unit === product.unit &&
      factor !== null &&
      i.quantity !== null
    )
      cookedBefore.set(key, (cookedBefore.get(key) ?? 0) + q * factor);
    const row = rows.get(key) ?? {
      key,
      name,
      sourceName: name,
      unit,
      quantity: 0,
      unknown: false,
      category: i.category,
      recipes: [],
      stock: 0,
      buy: 0,
      scanned: 0,
      checked: false,
      inPantry: false,
      bag: ['Produits frais', 'Viandes et poissons', 'Surgelés'].includes(i.category)
        ? 'Frais'
        : 'Épicerie',
      manual: !!manualKey,
    };
    if (manualKey) row.category = i.category;
    else row.manual = false;
    if (i.quantity === null || factor === null || !unit) row.unknown = true;
    else row.quantity += q * factor;
    if (title && !row.recipes.includes(title)) row.recipes.push(title);
    rows.set(key, row);
  }
  for (const p of shoppingPreps(s, start)) {
    const r = p.snapshot;
    if (!r.base || !r.ingredients.length) incomplete.push(r.title);
    for (const i of r.ingredients)
      include(i, r.base ? p.servings / r.base : null, r.title, undefined, p.day);
  }
  for (const i of weekItems.filter((i) => i.manual)) include(i, 1, '', i.key);
  for (const product of breakfast) {
    if (product.quantity > 0)
      include(
        {
          name: product.name,
          quantity: product.quantity,
          unit: product.unit,
          category: product.category,
        },
        1,
        'Petit-déjeuner',
      );
  }
  for (const row of rows.values()) {
    const stored = weekItems.filter(
      (i) =>
        !i.listEdit &&
        fold(groceryName(i.name)) === fold(row.name) &&
        groceryMeasure(i.name, 0, i.unit)[1] === row.unit,
    );
    const saved = stored.find((i) => i.key === row.key && !i.manual);
    row.stock = s.stock
      .filter((i) => fold(groceryName(i.name)) === fold(row.name))
      .reduce((n, i) => {
        const [q, u] = groceryMeasure(i.name, i.quantity, i.unit);
        return n + (u === row.unit ? q : 0);
      }, 0);
    row.inPantry = s.items.some(
      (i) => i.week === week && i.inPantry && fold(groceryName(i.name)) === fold(row.name),
    );
    const food = breakfastKey(row.name),
      product = byFood.get(food);
    if (product && row.unit === product.unit) {
      row.stock = product.stock ?? 0;
      row.inPantry ||= product.reserve;
    }
    row.quantity = rounded(row.quantity);
    row.buy = row.inPantry
      ? 0
      : rounded(Math.max(0, row.quantity - row.stock - (cookedBefore.get(row.key) ?? 0)));
    row.checked = saved?.checked ?? (stored.length > 0 && stored.every((i) => i.checked));
    row.scanned = rounded(
      s.lots
        .filter(
          (lot) =>
            lot.week === week &&
            fold(groceryName(lot.name)) === fold(row.name) &&
            lot.unit === (row.unit || 'pièce'),
        )
        .reduce((sum, lot) => sum + lot.quantity, 0),
    );
    if (
      !row.unknown &&
      row.buy > 0 &&
      row.scanned >= row.buy &&
      saved?.scanBaseline !== row.scanned
    )
      row.checked = true;
    row.bag = saved?.bag ?? row.bag;
    const edit = edits.get(fold(row.sourceName));
    row.name = edit?.displayName ?? row.name;
    row.category = edit?.aisle ?? row.category;
  }
  return { rows: [...rows.values()], breakfast, incomplete: [...new Set(incomplete)] };
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
  const end = addDays(shoppingStart(s, w), 7);
  const cutoff = end < today() ? end : today();
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
  const planned = shoppingPreps(s, shoppingStart(s, w)),
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
