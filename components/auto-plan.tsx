'use client';
import { useMemo } from 'react';
import { monday, today, labelDate } from '@/lib/dates';
import { weekPlan } from '@/lib/week-plan';
import { type UI, Dialog } from './common';

export function AutoPlanButton({ ui }: { ui: UI }) {
  if (ui.w < monday(today())) return null;
  return <button onClick={() => ui.open(<PlanPreview ui={ui} />)}>Planifier ma semaine</button>;
}
function PlanPreview({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const { rows } = useMemo(() => weekPlan(s, w, today(), true, true), [s, w]);
  return (
    <Dialog title="Planifier ma semaine" close={ui.close}>
      <p>
        Les plats proposés partagent des ingrédients. Les repas que tu as choisis ou déplacés
        gardent leur place.
      </p>
      {rows.map(({ meal, prep, added, why }) => {
        const old = s.preps.find((p) => p.id === prep.id);
        return (
          <div key={meal.id} className="plan-idea">
            <small>
              {labelDate(meal.day)}
              <br />
              {meal.slot === 'soir' ? 'Dîner' : 'Déjeuner'}
            </small>
            <div>
              <strong>{prep.snapshot.title}</strong>
              <small>
                {added
                  ? 'À ajouter'
                  : old?.recipeId !== prep.recipeId
                    ? 'Remplace ' + old?.snapshot.title
                    : 'Déjà prévu'}
              </small>
              {why && meal.slot === 'soir' && <small>{why}</small>}
            </div>
          </div>
        );
      })}
      {!rows.length && <p>Aucun changement à proposer pour cette semaine.</p>}
      {rows.length > 0 && (
        <button
          className="primary"
          onClick={async () => {
            if (
              await ui.run(
                {
                  action: 'fillWeek',
                  week: w,
                  optimize: true,
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
