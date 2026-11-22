import type { State } from './model';
import { breakfastFoods, breakfastKeys, type FoodKey, type Routine } from './breakfast-model';
import { addDays, today } from './dates';
import { fold, groceryMeasure, groceryName } from './grocery-names';
import { rounded } from './ingredients';

const dayCount = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 86400000);
const names = new Map(breakfastKeys.map((k) => [fold(breakfastFoods[k].name), k]));
export const breakfastKey = (name: string) => names.get(fold(groceryName(name)));
export function breakfastMeasure(
  key: FoodKey,
  name: string,
  quantity: number,
  unit: string,
): [number, string] {
  const [q, u] = groceryMeasure(name, quantity, unit);
  if (key === 'milk' && u === 'filet') return [q * 10, 'ml'];
  if (key === 'apple' && u === 'g') return [q / 155, 'pièce'];
  if (key === 'cinnamon' && (u === 'càc' || u === 'càs' || u === 'pincée'))
    return [q * (u === 'càc' ? 2.5 : u === 'càs' ? 7.5 : 0.35), 'g'];
  return [q, u];
}
function usage(routines: Routine[], food: FoodKey, start: string, end: string) {
  let total = 0;
  for (let i = 0; i < routines.length; i++) {
    const r = routines[i];
    const a = r.from > start ? r.from : start;
    const next = routines[i + 1]?.from;
    const b = next && next < end ? next : end;
    total += dayCount(a, b) * r.foods[food].serving;
  }
  return rounded(total);
}
export function breakfastPlan(s: State, week: string, asOf = today()) {
  const cfg = s.prefs.breakfast;
  if (!cfg?.routines.length) return [];
  const routines = [...cfg.routines].sort((a, b) => a.from.localeCompare(b.from));
  const end = addDays(week, 7);
  const next = addDays(asOf, 1);
  const afterMorning = cfg.readings.some((r) => r.day === asOf && r.afterBreakfast);
  const currentStart = afterMorning ? next : asOf;
  const start = [week, asOf < end ? currentStart : week, routines[0].from].sort().at(-1)!;
  const stockStart = [week, asOf < end ? asOf : week].sort()[1];
  if (start > end || routines[0].from >= end) return [];
  const active = routines.filter((r) => r.from <= start).at(-1)!;
  return breakfastKeys.map((key) => {
    const food = breakfastFoods[key];
    const reading = cfg.readings
      .filter((r) => r.food === key && r.day <= stockStart)
      .sort((a, b) => b.day.localeCompare(a.day))[0];
    const reserve = reading?.amount === null;
    let stock: number | null = reading?.amount ?? null;
    if (stock !== null && reading) {
      const firstBowl = reading.afterBreakfast ? addDays(reading.day, 1) : reading.day;
      let spending = usage(routines, key, firstBowl, start);
      for (const p of s.preps) {
        if (p.day < reading.day || p.day >= stockStart || !p.snapshot.base) continue;
        for (const i of p.snapshot.ingredients) {
          if (breakfastKey(i.name) !== key || !i.quantity) continue;
          const [q, u] = breakfastMeasure(key, i.name, i.quantity, i.unit);
          if (u === food.unit) spending += (q * p.servings) / p.snapshot.base;
        }
      }
      stock = rounded(Math.max(0, stock - spending));
    } else if (!reading) {
      const entries = s.stock.filter((i) => breakfastKey(i.name) === key);
      for (const i of entries) {
        const [q, u] = breakfastMeasure(key, i.name, i.quantity, i.unit);
        if (u === food.unit) stock = (stock ?? 0) + q;
      }
    }
    return {
      ...food,
      key,
      start,
      stockStart,
      days: dayCount(start, end),
      ...active.foods[key],
      quantity: usage(routines, key, start, end),
      stock,
      reserve,
      countedOn: reading?.day ?? null,
    };
  });
}
export type BreakfastProduct = ReturnType<typeof breakfastPlan>[number];
