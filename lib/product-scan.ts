import { date, type PurchaseLot } from './model';
import { fold, groceryName } from './grocery-names';

export type ScannedCode = Pick<PurchaseLot, 'barcode' | 'expires' | 'dateKind'>;
export type ProductInfo = { name: string; quantity: number | null; unit: string };
const gtin = /^(?:\d{8}|\d{12,14})$/;
function validCode(code: string) {
  if (!gtin.test(code)) return false;
  const sum = [...code].reverse().reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

// A variable-length GS1 field ends at FNC1. Digits inside a batch number are not dates.
function elementFields(raw: string) {
  const fields = new Map<string, string>();
  let text = raw.replace(/^\](?:d2|C1|Q3)/, '').replace(/^\x1d/, '');
  if (text.startsWith('(')) {
    for (const m of text.matchAll(/\((\d{2,4})\)([^()]*)/g)) fields.set(m[1], m[2]);
    return fields;
  }
  while (text) {
    const fixed = /^(01)(\d{14})|^(11|13|15|16|17)(\d{6})|^(3[12]0\d)(\d{6})/.exec(text);
    if (fixed) {
      fields.set(fixed[1] ?? fixed[3] ?? fixed[5], fixed[2] ?? fixed[4] ?? fixed[6]);
      text = text.slice(fixed[0].length).replace(/^\x1d/, '');
      continue;
    }
    const variable = /^(10|21|30|37)([^\x1d]*)\x1d?/.exec(text);
    if (!variable) break;
    text = text.slice(variable[0].length);
  }
  return fields;
}
export function readProductCode(value: string): ScannedCode | null {
  const raw = value.trim();
  let code = raw;
  let fields = new Map<string, string>();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const path = url.pathname.split('/');
      const start = path.indexOf('01');
      if (start < 0) return null;
      fields = new Map(url.searchParams);
      for (let i = start; i + 1 < path.length; i += 2) fields.set(path[i], path[i + 1]);
    } catch {
      return null;
    }
    code = fields.get('01') ?? '';
  } else if (!gtin.test(code)) {
    fields = elementFields(raw);
    code = fields.get('01') ?? '';
  }
  if (!validCode(code)) return null;
  const dateKind = fields.has('17') ? 'DLC' : fields.has('15') ? 'DDM' : null;
  const label = fields.get('17') ?? fields.get('15');
  let expires: string | null = null;
  if (label && /^\d{6}$/.test(label)) {
    const candidate = '20' + label.slice(0, 2) + '-' + label.slice(2, 4) + '-' + label.slice(4);
    if (date.safeParse(candidate).success) expires = candidate;
  }
  return {
    barcode: code.length === 14 && code[0] === '0' ? code.slice(1) : code,
    dateKind,
    expires,
  };
}

export function suggestedLine<T extends { name: string; unit: string }>(
  rows: T[],
  code: string,
  product: string,
  lots: PurchaseLot[],
) {
  const previous = lots.filter(
    (l) => l.barcode && code && l.barcode.padStart(14, '0') === code.padStart(14, '0'),
  );
  const matches = rows.filter((r) =>
    previous.some(
      (l) => fold(groceryName(l.name)) === fold(r.name) && l.unit === (r.unit || 'pièce'),
    ),
  );
  if (matches.length === 1) return matches[0];
  const name = fold(groceryName(product));
  const exact = rows.filter((r) => fold(r.name) === name);
  if (exact.length === 1) return exact[0];
  // Pack labels often extend the ingredient name with a brand or quality mark.
  // Match only a unique leading ingredient; the shopper sees and can change it.
  const words = (label: string) =>
    fold(label)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
      .join(' ');
  const label = words(product);
  const candidates = rows.filter((r) => label.startsWith(words(r.name) + ' '));
  return candidates.length === 1 ? candidates[0] : undefined;
}
