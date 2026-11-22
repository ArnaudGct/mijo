import index from './market-data/market-fr.json';
import rules from './market-data/market-families.json';
import { fold } from './grocery-names';
import { needs, type Need } from './shopping';
import type { State } from './model';

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
};
const quotes: Record<string, Quote[]> = index.prices;
const families = rules.map((rule) => ({ ...rule, re: new RegExp(rule.pattern) }));
function valuation(name: string) {
  const normalized = fold(name);
  const family = families.find((f) => f.re.test(normalized));
  if (!family) return null;
  const liquid = /^(lait|huile|vinaigre|sauce|creme liquide|rhum|avoine)/.test(normalized);
  for (const tag of family.tags) {
    const options = quotes[tag];
    if (!options) continue;
    const quote =
      options.find((q) => q.kind === 'loose') ||
      options.find((q) => q.unit === (liquid ? 'ml' : 'g')) ||
      options[0];
    return { family, quote };
  }
  return null;
}
function measure(r: Need, ref: NonNullable<ReturnType<typeof valuation>>) {
  const { family, quote } = ref;
  const u = fold(r.unit),
    n = fold(r.name);
  // Recipe packets are small portions. Retail packages are rounded separately.
  // Bouillon expressed as prepared liquid converts at one 10 g cube per 500 ml.
  if (r.unknown || !r.unit) return null;
  if (n.includes('bouillon') && u === 'ml') return r.buy * 0.02;
  if (n === 'ail' && u === 'tete') return r.buy * 45;
  if (n === 'ail' && u === 'gousse') return r.buy * 5;
  if (u === 'g' || u === 'ml') return r.buy;
  if (u === 'piece') return family.piece ? family.piece * r.buy : null;
  if (u === 'cac' || u === 'cas')
    return (
      r.buy *
      (u === 'cac' ? 5 : 15) *
      (quote.unit === 'ml' ? 1 : /sel|sucre/.test(n) ? 1 : /beurre/.test(n) ? 0.95 : 0.65)
    );
  if (u === 'filet' && quote.unit === 'ml') return r.buy * 10;
  if (u === 'gousse' && n === 'vanille') return null;
  if (u === 'cm' && n.includes('gingembre')) return r.buy * 5;
  if (
    /^(sachet|paquet|boite|tube|pot|botte|barquette|lot hellofresh|bouquet|bocal|portion)/.test(u)
  )
    return r.buy * family.portion;
  if (/^tranche/.test(u) && family.piece) return r.buy * family.piece;
  if (u === 'pincee') return r.buy * 0.35;
  return null;
}
export function marketBasket(s: State, w: string) {
  const { rows, incomplete } = needs(s, w);
  const groups = new Map<string, Need[]>();
  for (const r of rows) {
    const key = fold(r.name);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const lines = [...groups.values()]
    .map((parts) => {
      const first = parts[0],
        ref = valuation(first.name);
      const buy = parts.filter((p) => p.buy > 0 || p.unknown);
      const pantry = buy.length > 0 && buy.every((p) => p.unit === 'selon le goût');
      const amounts = ref ? buy.map((r) => measure(r, ref)) : [];
      const required = amounts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
      const pack =
        ref?.quote.pack ||
        (fold(first.name) === 'ail' ? 45 : 0) ||
        (ref?.quote.kind === 'loose' && buy.some((p) => p.unit === 'pièce') ? ref.family.piece : 0);
      const packs = pack ? Math.ceil(required / pack - 1e-9) : 0;
      const cents =
        !buy.length || pantry
          ? 0
          : !ref || amounts.some((q) => q === null)
            ? null
            : Math.max(1, Math.round((pack ? packs * pack : required) * ref.quote.rate));
      return {
        name: first.name,
        category: first.category,
        key: fold(first.name),
        parts,
        buy,
        pantry,
        cents,
        checked: buy.length > 0 && buy.every((p) => p.checked),
        packs,
        pack,
        ref: ref?.quote,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    lines,
    incomplete,
    cash: lines.reduce((sum, r) => sum + (r.cents ?? 0), 0),
    missing: lines.filter((r) => r.cents === null).length,
    count: lines.filter((r) => r.buy.length > 0).length,
  };
}
