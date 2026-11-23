import { addDays, inWeek, monday } from './dates';
import { optimizedRecipes, planned, suggest, uid } from './planner';
import type { Prep, State } from './model';

export function weekPlan(
  state: State,
  week: string,
  from: string,
  refill: boolean,
  optimize: boolean,
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
  for (const { prep, recipe, why } of optimize ? optimizedRecipes(s, week, from) : []) {
    put({ ...prep, recipeId: recipe.id, version: recipe.version, snapshot: recipe.data });
    reasons.set(prep.id, why);
  }
  for (const idea of suggest(s, week, from)) {
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
      if (
        day < from ||
        at(day, 'midi') ||
        (i === 7 && !refill && s.prefs.generatedWeeks.includes(monday(day)))
      )
        continue;
      const dinner = at(addDays(day, -1), 'soir');
      const p = s.preps.find((p) => p.id === dinner?.prepId);
      if (!p || p.day < addDays(day, -2) || p.day > day) continue;
      const taken = allocated(p);
      if (taken >= p.servings) {
        if (
          p.done ||
          p.ticks.length ||
          p.day < from ||
          taken >= s.prefs.portions ||
          s.meals.some((m) => m.prepId === p.id && m.consumed)
        )
          continue;
        put({ ...p, servings: taken + 1 });
      }
      book(p, day, 'midi');
    }
    if (s.prefs.target >= 7) {
      // A full week can begin without a Sunday dinner, or follow a meal eaten out.
      // Use a genuine spare portion first, otherwise plan a single lunch.
      for (let i = 0; i < 7; i++) {
        const day = addDays(week, i);
        if (day < from || at(day, 'midi')) continue;
        let p = s.preps
          .filter((p) => p.day <= day && p.day >= addDays(day, -2) && allocated(p) < p.servings)
          .sort((a, b) => a.day.localeCompare(b.day) || a.recipeId.localeCompare(b.recipeId))[0];
        if (!p) {
          const idea = suggest(
            {
              ...s,
              prefs: { ...s.prefs, target: 7 },
              meals: s.meals.filter((m) => !(m.slot === 'soir' && m.day === day)),
            },
            week,
            day,
          )[0];
          const r = idea && s.recipes.find((r) => r.id === idea.id);
          if (!r) continue;
          p = { ...planned(r, day, 1), automatic: true };
          put(p);
          reasons.set(p.id, idea.why);
        }
        book(p, day, 'midi');
      }
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
  return { preps: [...writes.values()], meals, rows };
}
