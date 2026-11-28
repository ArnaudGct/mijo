import { addDays, inWeek } from './dates';
import {
  eligibleDish,
  optimizedRecipes,
  permitsMeal,
  planned,
  suggest,
  uid,
  type PlanVariation,
} from './planner';
import { isPlanningDish } from './discovery-course';
import type { Prep, State } from './model';

export function weekPlan(
  state: State,
  week: string,
  from: string,
  optimize: boolean,
  variation?: PlanVariation,
) {
  const s = { ...state, preps: [...state.preps], meals: [...state.meals] };
  const writes = new Map<string, Prep>();
  const meals: State['meals'] = [];
  const reasons = new Map<string, string>();
  const put = (p: Prep) => {
    const index = s.preps.findIndex((x) => x.id === p.id);
    if (index < 0) s.preps.push(p);
    else s.preps[index] = p;
    writes.set(p.id, p);
  };
  function book(p: Prep, day: string, slot: 'midi' | 'soir') {
    const meal = {
      id: uid(),
      prepId: p.id,
      day,
      slot,
      servings: 1,
      frozen: false,
      consumed: false,
    };
    s.meals.push(meal);
    meals.push(meal);
  }
  function at(day: string, slot: 'midi' | 'soir') {
    return s.meals.find((m) => m.day === day && m.slot === slot);
  }
  function allocated(p: Prep) {
    return s.meals.filter((m) => m.prepId === p.id).reduce((n, m) => n + m.servings, 0);
  }
  for (const { prep, recipe, why } of optimize ? optimizedRecipes(s, week, from, variation) : []) {
    put({ ...prep, recipeId: recipe.id, version: recipe.version, snapshot: recipe.data });
    reasons.set(prep.id, why);
  }
  for (const idea of suggest(s, week, from, variation)) {
    const r = s.recipes.find((r) => r.id === idea.id)!;
    const p = { ...planned(r, idea.day, s.prefs.portions), automatic: true };
    put(p);
    book(p, idea.day, 'soir');
    reasons.set(p.id, idea.why);
  }
  if (s.prefs.portions > 1) {
    // Include the Sunday/Monday boundary in both directions. Reserve each portion once.
    for (let i = 0; i <= 7; i++) {
      const day = addDays(week, i);
      if (day < from || at(day, 'midi')) continue;
      const dinner = at(addDays(day, -1), 'soir');
      const p = s.preps.find((p) => p.id === dinner?.prepId);
      if (
        !p ||
        !isPlanningDish(p.snapshot.title, p.snapshot.tags) ||
        (p.day >= week && !permitsMeal(p.snapshot, variation)) ||
        p.batchPerMeal ||
        p.day < addDays(day, -2) ||
        p.day > day
      )
        continue;
      if (p.day >= week && (variation?.sources?.length || variation?.favoritesOnly)) {
        const recipe = s.recipes.find((r) => r.id === p.recipeId);
        if (!recipe || !eligibleDish(recipe, s, variation)) continue;
      }
      const taken = allocated(p);
      if (taken >= p.servings) {
        if (
          p.done ||
          p.ticks.length ||
          p.day < week ||
          p.day < from ||
          taken >= s.prefs.portions ||
          s.meals.some((m) => m.prepId === p.id && m.consumed)
        )
          continue;
        put({ ...p, servings: taken + 1 });
      }
      book(p, day, 'midi');
    }
  }
  const affected = new Set([...writes.keys(), ...meals.map((m) => m.prepId)]);
  const rows = s.meals
    .filter((m) => m.prepId && affected.has(m.prepId))
    .filter((m) => m.day >= from && (inWeek(m.day, week) || m.day === addDays(week, 7)))
    .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot))
    .map((m) => ({
      meal: m,
      prep: s.preps.find((p) => p.id === m.prepId)!,
      added: meals.includes(m),
      why: reasons.get(m.prepId!),
    }));
  return { preps: [...writes.values()], meals, rows, projected: s };
}

export function mealsToClear(s: State, week: string) {
  const lastDinner = addDays(week, 6);
  const nextLunch = addDays(week, 7);
  const prepDays = new Map(s.preps.map((p) => [p.id, p.day]));
  const pairs = new Set(
    s.meals
      .filter((m) => m.day === lastDinner && m.slot === 'soir' && !m.consumed && !m.frozen)
      .map((m) => m.prepId)
      .filter(Boolean),
  );
  return s.meals.filter((m) => {
    if (m.consumed || m.frozen) return false;
    if (m.day === week && m.slot === 'midi' && m.prepId && (prepDays.get(m.prepId) ?? week) < week)
      return false;
    if (inWeek(m.day, week)) return true;
    return m.day === nextLunch && m.slot === 'midi' && !!m.prepId && pairs.has(m.prepId);
  });
}
