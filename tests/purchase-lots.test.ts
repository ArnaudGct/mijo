import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../lib/dates';
import { snapshot, blankRecipe, type PurchaseLot } from '../lib/model';
import { needs } from '../lib/shopping';
import { planned, defaultMeals } from '../lib/planner';
import { parseLine } from '../lib/ingredients';
import { expiryPlan, cookedLots } from '../lib/expiry-plan';
import { readProductCode, suggestedLine } from '../lib/product-scan';

const week = '2026-11-23';
const uid = () => crypto.randomUUID();
function empty() {
  return snapshot.parse({
    revision: 0,
    prefs: {},
    recipes: [],
    meals: [],
    preps: [],
    sessions: [],
    stock: [],
    prices: [],
    items: [],
  });
}
function prep(name: string, raw: string, d: number) {
  return planned(
    {
      id: uid(),
      version: uid(),
      archived: false,
      original: '',
      sourceKey: null,
      data: { ...blankRecipe(), title: name, base: 2, ingredients: [parseLine(raw)] },
    },
    addDays(week, d),
    2,
  );
}
function pack(q: number, d: number): PurchaseLot {
  return {
    id: uid(),
    week,
    barcode: '3017620422003',
    product: 'Filets de poulet',
    name: 'Filet de poulet',
    quantity: q,
    unit: 'g',
    dateKind: 'DLC',
    expires: addDays(week, d),
  };
}
test('EAN et dates GS1 par lot, sans confondre numéro de lot et date', () => {
  const code = '03017620422003';
  assert.deepEqual(readProductCode(code.slice(1)), {
    barcode: code.slice(1),
    dateKind: null,
    expires: null,
  });
  for (const raw of [
    'https://id.gs1.org/01/' + code + '/10/A?17=261129',
    ']d201' + code + '10A\x1d17261129',
    '(01)' + code + '(17)261129',
  ]) {
    assert.deepEqual(readProductCode(raw), {
      barcode: code.slice(1),
      dateKind: 'DLC',
      expires: '2026-11-29',
    });
  }
  assert.equal(readProductCode('01' + code + '10ABC17261129')?.expires, null);
  assert.equal(readProductCode('01' + code + '17260231')?.expires, null);
  assert.equal(readProductCode('01' + code + '15261129')?.dateKind, 'DDM');
  assert.equal(readProductCode('3017620422001'), null);
  assert.equal(readProductCode('https://example.com/recipe'), null);
});
test('association explicite ou unique et achat partiel par unité', () => {
  const s = empty();
  s.preps = [prep('Poulet', 'Filets de poulet | 0,6 | kg', 3)];
  const first = pack(400, 1);
  s.lots.push(first);
  let row = needs(s, week, week).rows[0];
  assert.equal(suggestedLine([row], '', 'Filets de poulet fermier', [])?.key, row.key);
  assert.equal(
    suggestedLine([row, { ...row, unit: 'pièce' }], '', 'Filets de poulet fermier', []),
    undefined,
  );
  assert.equal(row.scanned, 400);
  assert.equal(row.checked, false);
  s.lots.push({ ...pack(3, 4), unit: 'pièce' }, pack(200, 5));
  row = needs(s, week, week).rows[0];
  assert.equal(row.scanned, 600);
  assert.equal(row.checked, true);
  s.lots.splice(0, 1);
  assert.equal(needs(s, week, week).rows[0].checked, false);
});
test('dates de chaque barquette, paire du dimanche, créneaux pris et stabilité au second passage', () => {
  const s = empty();
  const first = prep('Poulet A', 'Filet de poulet | 200 | g', 6);
  const second = prep('Poulet B', 'Filet de poulet | 200 | g', 4);
  const dry = prep('Riz', 'Riz | 100 | g', 0);
  const started = prep('Déjà commencé', 'Riz | 200 | g', 1);
  started.ticks = [0];
  s.preps = [first, second, dry, started];
  s.meals = s.preps.flatMap((p) => defaultMeals(p, true));
  s.lots = [pack(200, 0), pack(200, 6)];
  const plan = expiryPlan(s, week, week);
  assert.deepEqual(plan.report.reminders, []);
  const update = <T extends { id: string }>(rows: T[], changes: T[]) =>
    rows.map((r) => changes.find((c) => c.id === r.id) ?? r);
  s.preps = update(s.preps, plan.preps);
  s.meals = update(s.meals, plan.meals);
  assert.ok(
    [first.id, second.id].includes(
      s.meals.find((m) => m.day === week && m.slot === 'soir')!.prepId!,
    ),
  );
  assert.equal(s.preps.find((p) => p.id === started.id)?.day, addDays(week, 1));
  for (const p of s.preps) {
    assert.ok(
      s.meals.some((m) => m.prepId === p.id && m.slot === 'midi' && m.day === addDays(p.day, 1)),
    );
  }
  assert.equal(new Set(s.meals.map((m) => m.day + m.slot)).size, s.meals.length);
  assert.equal(expiryPlan(s, week, week).report.moves.length, 0);
  const used = cookedLots(
    s,
    s.preps.find((p) => p.day === week)!,
    true,
    week,
  );
  assert.equal(used.length, 1);
  assert.equal(used[0].id, s.lots[0].id);
  assert.equal(Object.values(used[0].used!)[0], 200);
  const cooked = { ...s.preps.find((p) => p.day === week)!, done: true };
  assert.deepEqual(cookedLots({ ...s, lots: used }, cooked, false, week)[0].used, {});
});
test('signale le reliquat si aucun créneau compatible avant la DLC', () => {
  const s = empty();
  const chicken = prep('Poulet', 'Filet de poulet | 300 | g', 6);
  s.preps = [chicken];
  s.meals = defaultMeals(chicken, true);
  const blockedLunch = { ...s.meals[1], id: uid(), prepId: null, day: addDays(week, 1) };
  s.meals.push(blockedLunch);
  s.lots = [pack(400, 0)];
  const result = expiryPlan(s, week, week);
  assert.equal(result.report.moves.length, 0);
  assert.equal(result.report.reminders[0].quantity, 400);
  assert.equal(
    result.meals.some((m) => m.id === blockedLunch.id),
    false,
  );
});
