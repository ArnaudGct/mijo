import { addDays, inWeek } from './dates';
import { breakfastMeasure, breakfastPlan } from './breakfast';
import { breakfastKey, foodsOn } from './breakfast-model';
import { fold, groceryName } from './grocery-names';
import { rounded } from './ingredients';
import type { Prep, PurchaseLot, State } from './model';

const key = (name: string, unit: string) => fold(groceryName(name)) + '|' + unit;
type Demand = { key: string; quantity: number };
function recipeNeeds(p: Prep, foods: ReturnType<typeof breakfastPlan>): Demand[] {
  if (!p.snapshot.base) return [];
  return p.snapshot.ingredients.flatMap((i) => {
    if (!i.quantity) return [];
    const food = foods.find((f) => f.key === breakfastKey(i.name));
    const [q, unit] = breakfastMeasure(
      food ?? { name: i.name, unit: i.unit },
      i.name,
      i.quantity,
      i.unit,
    );
    return [{ key: key(i.name, unit), quantity: (q * p.servings) / p.snapshot.base! }];
  });
}
const unused = (lot: PurchaseLot) =>
  rounded(Math.max(0, lot.quantity - Object.values(lot.used ?? {}).reduce((a, b) => a + b, 0)));
function byDate(a: PurchaseLot, b: PurchaseLot) {
  return (a.expires ?? '9999').localeCompare(b.expires ?? '9999') || a.id.localeCompare(b.id);
}
function lotIndex(lots: PurchaseLot[]) {
  const groups = new Map<string, number[]>();
  lots.forEach((l, i) => {
    const k = key(l.name, l.unit);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  });
  return groups;
}
function allocate(
  demands: Demand[],
  day: string,
  lots: PurchaseLot[],
  groups: Map<string, number[]>,
  left: number[],
  onUse?: (index: number, amount: number) => void,
) {
  for (const demand of demands) {
    let need = demand.quantity;
    for (const i of groups.get(demand.key) ?? []) {
      if (!left[i] || (lots[i].expires && lots[i].expires! < day)) continue;
      const q = Math.min(need, left[i]);
      left[i] = rounded(left[i] - q);
      onUse?.(i, q);
      need = rounded(need - q);
      if (need <= 0) break;
    }
  }
}

// Mark allocations only on cooking. Reopening the same preparation gives its lots back.
export function cookedLots(s: State, p: Prep, done: boolean, asOf: string) {
  if (done === p.done) return [];
  if (!done)
    return s.lots
      .filter((l) => l.used?.[p.id])
      .map((l) => {
        const used = { ...l.used };
        delete used[p.id];
        return { ...l, used };
      });
  const lots = s.lots.filter((l) => inWeek(p.day, l.week) && unused(l) > 0).sort(byDate);
  if (!lots.length) return [];
  const before = lots.map(unused),
    left = [...before];
  allocate(recipeNeeds(p, breakfastPlan(s, lots[0].week, asOf)), asOf, lots, lotIndex(lots), left);
  return lots.flatMap((l, i) =>
    before[i] > left[i]
      ? [{ ...l, used: { ...l.used, [p.id]: rounded(before[i] - left[i]) } }]
      : [],
  );
}

export type CheckoutReport = {
  moves: { title: string; from: string; to: string }[];
  reminders: {
    product: string;
    quantity: number;
    unit: string;
    date: string;
    kind: PurchaseLot['dateKind'];
  }[];
};
export function expiryPlan(s: State, week: string, asOf: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => d >= asOf);
  const lots = s.lots.filter((l) => l.week === week && l.expires && unused(l) > 0).sort(byDate);
  const report: CheckoutReport = { moves: [], reminders: [] };
  const preps: Prep[] = [],
    meals: State['meals'] = [];
  if (!lots.length || !days.length) return { preps, meals, report };
  const groups = lotIndex(lots);
  const foods = breakfastPlan(s, week, asOf);
  const fixed = days.map((): Demand[] => []);
  const movable: { p: Prep; meals: State['meals']; demand: Demand[]; original: number }[] = [];
  for (const p of s.preps) {
    const original = days.indexOf(p.day);
    if (original < 0 || p.done) continue;
    const demand = recipeNeeds(p, foods).filter((d) => groups.has(d.key));
    const linked = s.meals.filter((m) => m.prepId === p.id);
    const dinner = linked.some((m) => m.slot === 'soir' && m.day === p.day);
    const pair = linked.every(
      (m) =>
        !m.consumed &&
        !m.frozen &&
        (m.slot === 'soir' ? m.day === p.day : m.day === addDays(p.day, 1)),
    );
    if (dinner && pair && !p.session && !p.ticks.length)
      movable.push({ p, meals: linked, demand, original });
    else fixed[original].push(...demand);
  }
  // A breakfast uses its own portion even if the same ingredient also appears at dinner.
  days.forEach((d, i) => {
    const routine = foodsOn(s.prefs.breakfast?.routines ?? [], d);
    for (const food of foods) {
      const serving = routine?.[food.key]?.serving;
      if (serving && d >= food.start)
        fixed[i].push({ key: key(food.name, food.unit), quantity: serving });
    }
  });
  const mobileIds = new Set(movable.flatMap((m) => m.meals.map((r) => r.id)));
  const occupied = new Set(s.meals.filter((m) => !mobileIds.has(m.id)).map((m) => m.day + m.slot));
  const allowed = movable.map((m) =>
    days.map(
      (d) =>
        !occupied.has(d + 'soir') &&
        (m.meals.length === 1 || !occupied.has(addDays(d, 1) + 'midi')),
    ),
  );
  const initial = lots.map(unused);
  const dates = [...new Set(lots.map((l) => l.expires!))];
  const ranks = lots.map((l) => dates.indexOf(l.expires!));
  let bestScore: number[] | null = null;
  let bestSlots: number[] = [],
    bestLeft = initial;
  // At most seven dinners. Compare arrangements by portions used before their dates,
  // then by how early the nearest-dated lots are cooked, then by timetable disruption.
  const slots = days.map(() => -1);
  function evaluate() {
    const left = [...initial],
      early = dates.map(() => 0);
    let movement = 0;
    for (const [d, day] of days.entries()) {
      const meal = movable[slots[d]];
      const spend = (i: number, amount: number) => {
        early[ranks[i]] += ((days.length - d) * amount) / lots[i].quantity;
      };
      allocate(fixed[d], day, lots, groups, left, spend);
      if (meal) {
        allocate(meal.demand, day, lots, groups, left, spend);
        movement += Math.abs(meal.original - d);
      }
    }
    const used = left.reduce((sum, q, i) => sum + (initial[i] - q) / lots[i].quantity, 0);
    const score = [rounded(used), ...early.map(rounded), -movement];
    const first = bestScore ? score.findIndex((v, i) => v !== bestScore![i]) : -1;
    if (bestScore && (first < 0 || score[first] < bestScore[first])) return;
    bestScore = score;
    bestSlots = [...slots];
    bestLeft = left;
  }
  function arrange(i: number) {
    if (i === movable.length) {
      evaluate();
      return;
    }
    for (let d = 0; d < days.length; d++) {
      if (slots[d] !== -1 || !allowed[i][d]) continue;
      slots[d] = i;
      arrange(i + 1);
      slots[d] = -1;
    }
  }
  arrange(0);
  bestSlots.forEach((idx, d) => {
    const m = movable[idx];
    if (!m || m.original === d) return;
    preps.push({ ...m.p, day: days[d] });
    meals.push(
      ...m.meals.map((r) => ({ ...r, day: r.slot === 'soir' ? days[d] : addDays(days[d], 1) })),
    );
    report.moves.push({ title: m.p.snapshot.title, from: m.p.day, to: days[d] });
  });
  lots.forEach((l, i) => {
    if (bestLeft[i] > 0 && l.expires! <= days.at(-1)!)
      report.reminders.push({
        product: l.product,
        quantity: bestLeft[i],
        unit: l.unit,
        date: l.expires!,
        kind: l.dateKind,
      });
  });
  return { preps, meals, report };
}
