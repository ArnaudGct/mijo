import { addDays, inWeek, today } from '@/lib/dates';
import { marketBasket } from '@/lib/market';
import type { State } from '@/lib/model';
import { eligibleDish, type PlanVariation } from '@/lib/planner';
import { weekPlan } from '@/lib/week-plan';

function preview(state: State, week: string, variation: PlanVariation) {
  const day = today();
  const plan = weekPlan(state, week, day, true, variation);
  const changes = new Map(plan.rows.map((r) => [r.meal.id, r]));
  const preps = new Map(plan.projected.preps.map((p) => [p.id, p]));
  const rows = plan.projected.meals
    .filter(
      (m) =>
        m.prepId &&
        m.day >= day &&
        (inWeek(m.day, week) || (m.day === addDays(week, 7) && changes.has(m.id))),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot))
    .map((m) => {
      const p = preps.get(m.prepId!)!;
      const change = changes.get(m.id);
      const previous = state.preps.find((old) => old.id === p.id);
      return {
        id: m.id,
        recipeId: p.recipeId,
        day: m.day,
        slot: m.slot,
        title: p.snapshot.title,
        status: change?.added
          ? 'À ajouter'
          : previous && previous.recipeId !== p.recipeId
            ? 'Remplace ' + previous.snapshot.title
            : 'Déjà prévu',
        why: change?.why ?? '',
        outsideSelection: !state.recipes.some(
          (r) => r.id === p.recipeId && eligibleDish(r, state, variation),
        ),
      };
    });
  const cart =
    variation.strategy === 'economy' ? marketBasket(plan.projected, week, undefined, week) : null;
  return {
    rows,
    changed: plan.rows.length > 0,
    cost: cart ? { cents: cart.cash, partial: !!(cart.missing || cart.incomplete.length) } : null,
  };
}

export type PlanPreviewResult = ReturnType<typeof preview>;

self.onmessage = (
  event: MessageEvent<{ state: State; week: string; variation: PlanVariation }>,
) => {
  const { state, week, variation } = event.data;
  self.postMessage(preview(state, week, variation));
};
