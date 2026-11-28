import { addDays, inWeek, labelDate, monday } from './dates';
import type { MealMoment, ShoppingList, State } from './model';

// Legacy shopping dates are also used by calendar-based planning and old backups.
export function shoppingStart(s: State, week: string) {
  const schedule = s.prefs.shoppingDays ?? {};
  const since = Object.keys(schedule)
    .filter((date) => date <= week)
    .sort()
    .at(-1);
  return since ? addDays(week, schedule[since]) : week;
}

export function shoppingPreps(s: State, start: string) {
  const lunches = new Set<string>(),
    dinners = new Set<string>();
  for (const m of s.meals) {
    if (m.prepId) (m.slot === 'midi' ? lunches : dinners).add(m.prepId + '/' + m.day);
  }
  return s.preps.filter((p) => {
    const key = p.id + '/' + p.day;
    const purchaseDay = lunches.has(key) && !dinners.has(key) ? addDays(p.day, -1) : p.day;
    return inWeek(purchaseDay, start);
  });
}

export function shoppingOpen(s: State, week: string, day: string) {
  return addDays(shoppingStart(s, week), 7) >= day;
}

export function nextMeal(moment: MealMoment): MealMoment {
  return moment.slot === 'midi'
    ? { day: moment.day, slot: 'soir' }
    : { day: addDays(moment.day, 1), slot: 'midi' };
}
export function momentLabel(moment: MealMoment) {
  return labelDate(moment.day) + ' ' + moment.slot;
}
function compare(a: MealMoment, b: MealMoment) {
  return a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot);
}

export function initialShoppingList(s: State, day: string): ShoppingList {
  // Keep the upcoming trip explicitly chosen in the previous version.
  const nextWeek = addDays(monday(day), 7);
  const key = s.prefs.shoppingDays?.[nextWeek] !== undefined ? nextWeek : monday(day);
  const start = shoppingStart(s, key);
  const from: MealMoment =
    start >= day && s.prefs.shoppingDays && Object.keys(s.prefs.shoppingDays).some((w) => w <= key)
      ? { day: start, slot: 'soir' }
      : { day, slot: 'midi' };
  return { id: crypto.randomUUID(), from, legacyFrom: monday(from.day) };
}

export function groupedMeals(s: State, list: ShoppingList) {
  const byPrep = new Map<string, State['meals']>();
  for (const meal of s.meals) {
    if (!meal.prepId) continue;
    const entries = byPrep.get(meal.prepId);
    if (entries) entries.push(meal);
    else byPrep.set(meal.prepId, [meal]);
  }
  let end: MealMoment | null = null;
  const preps: State['preps'] = [];
  for (const p of s.preps) {
    if (p.purchasedFor) continue;
    const meals = byPrep.get(p.id) ?? [];
    const cooking: MealMoment = {
      day: p.day,
      slot: meals.some((m) => m.day === p.day && m.slot === 'midi') ? 'midi' : 'soir',
    };
    if (compare(cooking, list.from) < 0) continue;
    preps.push(p);
    for (const moment of [cooking, ...meals])
      if (!end || compare(moment, end) > 0) end = { day: moment.day, slot: moment.slot };
  }
  return { preps, end };
}
