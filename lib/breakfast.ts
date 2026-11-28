import type { State } from './model';
import { breakfastKey, orderedFoods, type Routine } from './breakfast-model';
import { addDays, today } from './dates';
import { marketFamily } from './market-family';
import { groceryMeasure } from './grocery-names';
import { rounded, shoppingCategory } from './ingredients';

const dayCount = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 86400000);
export function breakfastMeasure(
  product: { name: string; unit: string },
  name: string,
  quantity: number,
  unit: string,
): [number, string] {
  const [q, u] = groceryMeasure(name, quantity, unit);
  const key = breakfastKey(product.name);
  if (key === 'milk' && u === 'filet') return [q * 10, 'ml'];
  if ((u === 'g' && product.unit === 'pièce') || (u === 'pièce' && product.unit === 'g')) {
    const weight = marketFamily(product.name)?.piece;
    if (weight) return [u === 'g' ? q / weight : q * weight, product.unit];
  }
  if (key === 'cinnamon' && (u === 'càc' || u === 'càs' || u === 'pincée'))
    return [q * (u === 'càc' ? 2.5 : u === 'càs' ? 7.5 : 0.35), 'g'];
  return [q, u];
}
function usage(routines: Routine[], food: string, start: string, end: string) {
  let total = 0,
    days = 0;
  for (let i = 0; i < routines.length; i++) {
    const r = routines[i];
    const a = r.from > start ? r.from : start;
    const next = routines[i + 1]?.from;
    const b = next && next < end ? next : end;
    const serving = r.foods[food]?.serving ?? 0;
    if (serving > 0) {
      const mornings = dayCount(a, b);
      days += mornings;
      total += mornings * serving;
    }
  }
  return { quantity: rounded(total), days };
}
export function breakfastPlan(
  s: State,
  week: string,
  asOf = today(),
  purchaseDay = week,
  end = addDays(week, 7),
) {
  const cfg = s.prefs.breakfast;
  if (!cfg?.routines.length) return [];
  const routines = [...cfg.routines].sort((a, b) => a.from.localeCompare(b.from));
  const next = addDays(asOf, 1);
  const afterMorning = cfg.readings.some((r) => r.day === asOf && r.afterBreakfast);
  const currentStart = afterMorning ? next : asOf;
  const start = [week, asOf < end ? currentStart : week, routines[0].from].sort().at(-1)!;
  // A grocery trip begins before the first dinner, even when the first bowl is tomorrow.
  const stockStart = asOf > purchaseDay && asOf < end ? asOf : purchaseDay;
  if (start > end || routines[0].from >= end) return [];
  // Include earlier products for shared recipe stock even after they leave the bowl.
  const foods: Routine['foods'] = {};
  for (const r of routines.filter((r) => r.from < end)) Object.assign(foods, r.foods);
  return orderedFoods(foods).map(([key, food]) => {
    const period = usage(routines, key, start, end);
    const reading = cfg.readings
      .filter((r) => r.food === key && r.day <= stockStart)
      .sort((a, b) => b.day.localeCompare(a.day))[0];
    const reserve = reading?.amount === null;
    let stock: number | null = reading?.amount ?? null;
    if (stock !== null && reading) {
      const firstBowl = reading.afterBreakfast ? addDays(reading.day, 1) : reading.day;
      let spending = usage(routines, key, firstBowl, start).quantity;
      for (const p of s.preps) {
        if (p.day < reading.day || p.day >= stockStart || !p.snapshot.base) continue;
        for (const i of p.snapshot.ingredients) {
          if (breakfastKey(i.name) !== key || !i.quantity) continue;
          const [q, u] = breakfastMeasure(food, i.name, i.quantity, i.unit);
          if (u === food.unit) spending += (q * p.servings) / p.snapshot.base;
        }
      }
      stock = rounded(Math.max(0, stock - spending));
    } else if (!reading) {
      const entries = s.stock.filter((i) => breakfastKey(i.name) === key);
      for (const i of entries) {
        const [q, u] = breakfastMeasure(food, i.name, i.quantity, i.unit);
        if (u === food.unit) stock = (stock ?? 0) + q;
      }
    }
    return {
      ...food,
      key,
      start,
      stockStart,
      days: dayCount(start, end),
      category: shoppingCategory(food.name),
      activeDays: period.days,
      quantity: period.quantity,
      stock,
      reserve,
      countedOn: reading?.day ?? null,
    };
  });
}
export type BreakfastProduct = ReturnType<typeof breakfastPlan>[number];
