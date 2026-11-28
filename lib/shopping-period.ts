import { addDays, inWeek, monday } from './dates';
import type { State } from './model';

// The Monday key keeps purchases, manual items and offline checks attached to their list.
// A change of shopping day applies from that list forward.
export function shoppingStart(s: State, week: string) {
  const schedule = s.prefs.shoppingDays ?? {};
  const since = Object.keys(schedule)
    .filter((date) => date <= week)
    .sort()
    .at(-1);
  return since ? addDays(week, schedule[since]) : week;
}

export function currentShoppingWeek(s: State, day: string) {
  const week = monday(day);
  return shoppingStart(s, week) > day ? addDays(week, -7) : week;
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
