import { householdAisle, isHouseholdAisle } from './aisles';
import index from './market-data/market-fr.json';
import { marketFamily } from './market-family';
import { fold, groceryMeasure, groceryName } from './grocery-names';
import { rounded } from './ingredients';
import { needs, type Need } from './shopping';
import type { Recipe, State } from './model';
import { breakfastKey } from './breakfast-model';
import { type BreakfastProduct } from './breakfast';

export const marketDate = index.toDate;
export const priceSource = 'https://huggingface.co/datasets/openfoodfacts/open-prices';
export const deliverySource =
  'https://www.leclercdrive.fr/region-nouvelle-aquitaine/la-rochelle/drive-perigny-la-rochelle.aspx';
export function shipping(shop: 'leclerc' | 'monoprix', cents: number) {
  if (shop === 'leclerc')
    return {
      label: 'E.Leclerc Périgny',
      minimum: 5000,
      fee: cents >= 5000 ? 790 : null,
      from: true,
      url: deliverySource,
    };
  return {
    label: 'Monoprix hors Île-de-France',
    minimum: 6000,
    fee: cents < 6000 ? null : cents < 12000 ? 800 : cents <= 15000 ? 400 : 0,
    from: false,
    url: 'https://courses.monoprix.fr/content/tarif-livraison-isf-app',
  };
}
type Quote = {
  kind: string;
  unit: string;
  rate: number;
  pack: number;
  n: number;
  latest: string;
  example: number;
  formats?: { size: number; cents: number }[];
};
const quotes: Record<string, Quote[]> = index.prices;
function valuation(
  name: string,
  byPiece: boolean,
  breakfast?: BreakfastProduct,
  household = false,
) {
  const normalized = fold(name);
  const family = marketFamily(name, household);
  if (!family) return null;
  const liquid = /^(lait|huile|vinaigre|sauce|creme liquide|rhum|avoine)/.test(normalized);
  for (const tag of family.tags) {
    const options = quotes[tag];
    if (!options) continue;
    if (family.household) {
      const quote = options.find((q) => q.kind === 'pack' && q.unit === 'ml' && q.formats?.length);
      if (quote) return { family, quote };
      continue;
    }
    const loose = options.find((q) => q.kind === 'loose');
    const each = byPiece ? options.find((q) => q.kind === 'each' && q.n >= 10) : undefined;
    const quote =
      (breakfast && breakfast.key !== 'apple'
        ? options.find((q) => q.kind === 'pack' && q.unit === breakfast.unit)
        : undefined) ||
      (breakfast?.key === 'apple' && loose) ||
      (each && (!loose || each.n > loose.n) ? each : undefined) ||
      loose ||
      options.find((q) => q.unit === (liquid ? 'ml' : 'g')) ||
      options.find((q) => q.kind === 'pack');
    if (!quote) continue;
    return { family, quote };
  }
  return null;
}
function measure(
  r: Pick<Need, 'name' | 'unit' | 'unknown'>,
  ref: NonNullable<ReturnType<typeof valuation>>,
  amount: number,
) {
  const { family, quote } = ref;
  const u = fold(r.unit),
    n = fold(r.name);
  // Recipe packets are small portions. Retail packages are rounded separately.
  // Bouillon expressed as prepared liquid converts at one 10 g cube per 500 ml.
  if (r.unknown || !r.unit) return null;
  if (family.household) {
    if (u === 'ml') return amount;
    if (/^(?:piece|flacon|bidon|bouteille)s?$/.test(u)) return amount * quote.formats![0].size;
    return null;
  }
  if (quote.kind === 'each') return u === 'piece' ? amount : null;
  if (n.includes('bouillon') && u === 'ml') return amount * 0.02;
  if (n === 'ail' && u === 'tete') return amount * 45;
  if (n === 'ail' && /^gousses?$/.test(u)) return amount * 5;
  if (u === 'g' || u === 'ml') return amount;
  if (u === 'piece') return family.piece ? family.piece * amount : null;
  if (u === 'cac' || u === 'cas')
    return (
      amount *
      (u === 'cac' ? 5 : 15) *
      (quote.unit === 'ml' ? 1 : /sel|sucre/.test(n) ? 1 : /beurre/.test(n) ? 0.95 : 0.65)
    );
  if (u === 'filet' && quote.unit === 'ml') return amount * 10;
  if (u === 'gousse' && n === 'vanille') return null;
  if (u === 'cm' && n.includes('gingembre')) return amount * 5;
  if (
    /^(sachet|paquet|boite|tube|pot|botte|barquette|lot hellofresh|bouquet|bocal|portion)/.test(u)
  )
    return family.portion ? amount * family.portion : null;
  if (/^tranche/.test(u) && family.piece) return amount * family.piece;
  if (u === 'pincee') return amount * 0.35;
  return null;
}
function bestFormat(formats: NonNullable<Quote['formats']>, basis: number) {
  return formats
    .map((f) => ({ ...f, count: Math.ceil(basis / f.size - 1e-9) }))
    .sort(
      (a, b) => a.count * a.cents - b.count * b.cents || a.count * a.size - b.count * b.size,
    )[0];
}

export type RecipeCost = {
  cents: number | null;
  portions: number | null;
  missing: number;
  priced: number;
};

export function recipeCost(recipe: Pick<Recipe, 'base' | 'ingredients'>): RecipeCost {
  let total = 0,
    valued = 0,
    missing = 0;
  const groups = new Map<string, Recipe['ingredients']>();
  for (const i of recipe.ingredients) {
    const name = groceryName(i.name);
    if (
      /^eau(?: du robinet)?$/.test(fold(name)) ||
      (i.quantity === null && /^(?:sel|poivre)(?: et (?:sel|poivre))?$/.test(fold(name)))
    )
      continue;
    const group = groups.get(name) ?? [];
    group.push(i);
    groups.set(name, group);
  }
  for (const [name, ingredients] of groups) {
    const parts = ingredients.map((i) => {
      const [amount, unit] = groceryMeasure(i.name, i.quantity ?? 0, i.unit);
      return { name, amount, unit, unknown: i.quantity === null };
    });
    const ref = valuation(
      name,
      ingredients[0].category === 'Fruits et légumes' && parts.every((p) => p.unit === 'pièce'),
    );
    let used = 0;
    for (const part of parts) {
      const quantity = ref ? measure(part, ref, part.amount) : null;
      if (quantity === null) missing++;
      else {
        used += quantity;
        valued++;
      }
    }
    if (!ref || !used) continue;
    const format = bestFormat(ref.quote.formats ?? [], used);
    total += used * (format ? format.cents / format.size : ref.quote.rate);
  }
  return {
    cents: valued ? Math.round(total) : null,
    portions: recipe.base,
    missing,
    priced: valued,
  };
}

export function marketBasket(s: State, w: string, asOf?: string) {
  const { rows, incomplete, breakfast } = needs(s, w, asOf);
  const groups = new Map<string, Need[]>();
  for (const r of rows) {
    const key = fold(r.sourceName);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const lines = [...groups.values()]
    .map((parts) => {
      const first = parts[0];
      const product = breakfast.find((p) => p.key === breakfastKey(first.name) && p.quantity > 0);
      const ref = valuation(
        first.name,
        first.category === 'Fruits et légumes' && parts.every((p) => p.unit === 'pièce'),
        product,
        first.manual && (isHouseholdAisle(first.category) || !!householdAisle(first.name)),
      );
      const available = parts.every((p) => p.inPantry);
      const pantry = parts.every((p) => p.unit === 'selon le goût');
      const buy = parts.filter((p) => !p.inPantry && !pantry && (p.buy > 0 || p.unknown));
      function measured(rows: Need[], field: 'buy' | 'quantity') {
        let sum = 0;
        for (const row of rows) {
          const value = ref ? measure(row, ref, row[field]) : null;
          if (value === null) return null;
          sum += value;
        }
        return sum;
      }
      const required = measured(buy, 'buy');
      const used = pantry ? 0 : measured(parts, 'quantity');
      // Choose the least expensive checkout among common observed formats. Compare
      // total shelf prices first, then minimise surplus for equal totals.
      // A household format is shared by the stock count, refill and weekly checkout.
      // For a size without a matching observation, scale the family's median unit price.
      const oneUnit =
        product && ref ? measure({ ...first, unit: product.unit, unknown: false }, ref, 1) : null;
      const preferredSize = product && oneUnit ? product.size * oneUnit : null;
      const observed = ref?.quote.formats?.find((f) => f.size === preferredSize);
      const packOptions =
        preferredSize && ref
          ? [
              observed ?? {
                size: preferredSize,
                cents: Math.max(1, Math.round(preferredSize * ref.quote.rate)),
              },
            ]
          : ref?.family.household
            ? ref.quote.formats!.slice(0, 1)
            : (ref?.quote.formats ?? []);
      const basis = required || used || 0;
      const format = bestFormat(packOptions, basis);
      const pack =
        format?.size ||
        (ref?.quote.kind === 'each' ? 1 : 0) ||
        (fold(first.name) === 'ail' ? 45 : 0) ||
        (ref?.quote.kind === 'loose' && parts.some((p) => p.unit === 'pièce')
          ? ref.family.piece
          : 0);
      const rate = format ? format.cents / format.size : ref?.quote.rate;
      const requiredInBowlUnits =
        product && buy.every((r) => !r.unknown && r.unit === product.unit)
          ? buy.reduce((sum, r) => sum + r.buy, 0)
          : null;
      const packs =
        pack && required
          ? Math.ceil(required / pack - 1e-9)
          : product && requiredInBowlUnits
            ? Math.ceil(requiredInBowlUnits / product.size - 1e-9)
            : 0;
      const cents = !buy.length
        ? 0
        : required === null || rate === undefined
          ? null
          : Math.round((pack ? packs * pack : required) * rate);
      const usedCents =
        used === 0 ? 0 : used === null || rate === undefined ? null : Math.round(used * rate);
      return {
        name: first.name,
        category: first.category,
        key: fold(first.sourceName),
        parts,
        buy,
        pantry,
        cents,
        usedCents,
        available,
        checked: buy.length > 0 && buy.every((p) => p.checked),
        packs,
        pack,
        ref: ref?.quote,
        breakfast: product && {
          product,
          packPrice: format?.cents ?? null,
          observed: !!observed,
          value:
            oneUnit && rate !== undefined ? Math.round(product.quantity * oneUnit * rate) : null,
          bowl:
            oneUnit && rate !== undefined
              ? (product.quantity / product.days) * oneUnit * rate
              : null,
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    lines,
    breakfast,
    incomplete,
    cash: lines.reduce((sum, r) => sum + (r.cents ?? 0), 0),
    used: lines.reduce((sum, r) => sum + (r.usedCents ?? 0), 0),
    unvalued: lines.filter((r) => r.usedCents === null).length,
    missing: lines.filter((r) => r.cents === null).length,
    count: lines.filter((r) => r.buy.length > 0).length,
  };
}

const formatQuantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });
export function remainingShoppingText(lines: ReturnType<typeof marketBasket>['lines']) {
  return lines
    .flatMap((line) => {
      const amounts: string[] = [];
      let unknown = false;
      for (const part of line.buy) {
        if (part.checked || part.inPantry) continue;
        const remaining = rounded(part.buy - part.scanned);
        if (remaining > 0)
          amounts.push([formatQuantity.format(remaining), part.unit].filter(Boolean).join(' '));
        unknown ||= part.unknown;
      }
      if (unknown) amounts.push('quantité à préciser');
      return amounts.length ? [line.name + ' · ' + amounts.join(' + ')] : [];
    })
    .join('\n');
}
