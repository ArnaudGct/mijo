import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, blankRecipe, type State } from '../lib/model';
import { suggestedBowl } from '../lib/breakfast-model';
import { breakfastPlan } from '../lib/breakfast';
import { needs } from '../lib/shopping';
import { marketBasket } from '../lib/market';
import { parseLine } from '../lib/ingredients';
const week = '2026-11-23';
function setup(): State {
  return snapshot.parse({
    revision: 0,
    recipes: [],
    preps: [],
    meals: [],
    sessions: [],
    prices: [],
    items: [],
    stock: [],
    prefs: {
      breakfast: {
        routines: [{ from: week, foods: structuredClone(suggestedBowl) }],
        readings: [],
      },
    },
  });
}
function addMilk(s: State, day: string, amount: number, unit: string) {
  const recipe = {
    ...blankRecipe(),
    title: 'Soupe',
    base: 2,
    ingredients: [parseLine('Lait | ' + amount + ' | ' + unit)],
  };
  s.preps.push({
    id: crypto.randomUUID(),
    recipeId: crypto.randomUUID(),
    version: crypto.randomUUID(),
    snapshot: recipe,
    day,
    servings: 2,
    session: null,
    done: false,
    ticks: [],
  });
}
test('sept bols : prix au format familial, quantités des repas regroupées et stock réel prioritaire', () => {
  const s = setup();
  addMilk(s, week, 1, 'filet');
  s.prefs.breakfast!.readings = [
    { day: week, food: 'milk', amount: 1000 },
    { day: week, food: 'cinnamon', amount: null },
  ];
  const c = marketBasket(s, week, week);
  const milk = c.lines.filter((l) => l.name === 'Lait');
  assert.equal(milk.length, 1);
  assert.equal(milk[0].buy[0].buy, 760);
  assert.equal(milk[0].packs, 1);
  assert.equal(c.lines.filter((l) => l.breakfast).length, 5);
  assert.equal(c.lines.find((l) => l.name === 'Skyr nature')!.pack, 850);
  assert.equal(c.lines.find((l) => l.name === 'Flocons d’avoine')!.packs, 2);
  assert.equal(c.lines.find((l) => l.name === 'Cannelle moulue')!.cents, 0);
  assert.equal(c.missing, 0);
  assert.equal(breakfastPlan(s, week, week).find((p) => p.key === 'apple')?.stock, null);
});
test('autonomie dans le temps : ni double déduction ni ravitaillement fictif', () => {
  const s = setup();
  const cfg = s.prefs.breakfast!;
  cfg.readings = [
    { day: week, food: 'milk', amount: 6000 },
    { day: week, food: 'skyr', amount: 2550 },
  ];
  addMilk(s, '2026-11-24', 500, 'ml');
  const next = breakfastPlan(s, '2026-11-30', week);
  assert.equal(next.find((p) => p.key === 'milk')!.stock, 3750);
  assert.equal(next.find((p) => p.key === 'skyr')!.stock, 2060);
  cfg.readings.push({ day: '2026-11-25', food: 'milk', amount: 750 });
  const row = needs(s, week, '2026-11-25').rows.find((l) => l.name === 'Lait')!;
  assert.equal(row.buy, 500);
  assert.equal(breakfastPlan(s, '2026-12-07', week).find((p) => p.key === 'milk')!.stock, 0);
});
test('modifications datées des portions et limites de semaines', () => {
  const s = setup();
  const cfg = s.prefs.breakfast!;
  cfg.routines.push({
    from: '2026-11-26',
    foods: { ...suggestedBowl, oats: { serving: 100, size: 500 } },
  });
  assert.equal(breakfastPlan(s, week, week).find((p) => p.key === 'oats')?.quantity, 520);
  assert.deepEqual(breakfastPlan(s, '2026-11-16', '2026-11-16'), []);
  assert.equal(breakfastPlan(s, week, '2026-11-29')[0].days, 1);
  cfg.readings.push({ day: '2026-11-29', afterBreakfast: true, food: 'milk', amount: 1000 });
  addMilk(s, '2026-11-29', 1500, 'ml');
  assert.equal(breakfastPlan(s, week, '2026-11-29')[0].days, 0);
  assert.equal(needs(s, week, '2026-11-29').rows.find((r) => r.name === 'Lait')!.buy, 500);
  assert.equal(
    breakfastPlan(s, '2026-11-30', '2026-11-29').find((p) => p.key === 'milk')!.stock,
    0,
  );
});
