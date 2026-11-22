'use client';
import { useMemo } from 'react';
import { monday, today, labelDate, inWeek } from '@/lib/dates';
import { suggest, optimizedRecipes } from '@/lib/planner';
import { type UI, Dialog } from './common';

export function AutoPlanButton({ ui }: { ui: UI }) {
  if (ui.w < monday(today())) return null;
  return <button onClick={() => ui.open(<PlanPreview ui={ui} />)}>Planifier ma semaine</button>;
}
function PlanPreview({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const { changes, added } = useMemo(() => {
    const changes = optimizedRecipes(s, w, today());
    const revised = new Map(changes.map((x) => [x.prep.id, x.recipe]));
    const preps = s.preps.map((p) => {
      const r = revised.get(p.id);
      return r ? { ...p, recipeId: r.id, snapshot: r.data } : p;
    });
    return { changes, added: suggest({ ...s, preps }, w, today()) };
  }, [s, w]);
  const canFillLunch =
    s.prefs.leftovers && s.meals.filter((m) => inWeek(m.day, w) && m.slot === 'midi').length < 7;
  return (
    <Dialog title="Planifier ma semaine" close={ui.close}>
      <p>
        Les plats proposés partagent des ingrédients. Les repas que tu as choisis ou déplacés
        gardent leur place.
      </p>
      {changes.map(({ prep, recipe, why }) => (
        <div key={prep.id} className="plan-idea">
          <small>{labelDate(prep.day)}</small>
          <div>
            <strong>{recipe.data.title}</strong>
            <small>À la place de {prep.snapshot.title}</small>
            <small>{why}</small>
          </div>
        </div>
      ))}
      {added.map((idea) => (
        <div key={idea.day} className="plan-idea">
          <small>{labelDate(idea.day)} · Dîner</small>
          <div>
            <strong>{s.recipes.find((r) => r.id === idea.id)?.data.title}</strong>
            <small>{idea.why}</small>
          </div>
        </div>
      ))}
      {!changes.length && !added.length && (
        <p>
          {canFillLunch
            ? 'Les dîners sont en place. Les portions disponibles peuvent compléter les déjeuners.'
            : 'Aucun changement à proposer pour cette semaine.'}
        </p>
      )}
      {(changes.length > 0 || added.length > 0 || canFillLunch) && (
        <button
          className="primary"
          onClick={async () => {
            if (
              await ui.run(
                {
                  action: 'fillWeek',
                  week: w,
                  optimize: changes.length > 0,
                  previewRevision: s.revision,
                },
                'Planning mis à jour.',
              )
            )
              ui.close();
          }}
        >
          Appliquer au planning
        </button>
      )}
    </Dialog>
  );
}
