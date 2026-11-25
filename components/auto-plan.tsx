'use client';
import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { addDays, inWeek, monday, today, labelDate } from '@/lib/dates';
import { weekPlan } from '@/lib/week-plan';
import type { PlanVariation } from '@/lib/planner';
import { type UI, Dialog } from './common';

export function AutoPlanButton({ ui }: { ui: UI }) {
  if (ui.w < monday(today())) return null;
  return <button onClick={() => ui.open(<PlanPreview ui={ui} />)}>Planifier ma semaine</button>;
}
function PlanPreview({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const [variation, setVariation] = useState<PlanVariation>(() => ({
    seed: crypto.randomUUID(),
    avoid: [],
  }));
  const { rows } = useMemo(() => weekPlan(s, w, today(), true, true, variation), [s, w, variation]);
  return (
    <Dialog title="Planifier ma semaine" close={ui.close}>
      <p>
        Tu peux remplacer les plats à venir, y compris ceux choisis à la main. Les préparations
        commencées, les plats de batch cooking et les portions congelées gardent leur place.
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
      <div className="actions wrap">
        <button
          onClick={() =>
            setVariation({
              seed: crypto.randomUUID(),
              avoid: [...new Set(rows.map((r) => r.prep.recipeId))],
            })
          }
        >
          <RefreshCw size={16} /> Autre proposition
        </button>
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
                    variation,
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
      </div>
    </Dialog>
  );
}

export function ClearWeekButton({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const meals = s.meals.filter((m) => inWeek(m.day, w));
  const available =
    meals.some((m) => !m.consumed) ||
    s.preps.some(
      (p) =>
        inWeek(p.day, w) && !p.done && !p.ticks.length && !s.meals.some((m) => m.prepId === p.id),
    );
  return (
    <button
      disabled={!available}
      onClick={() =>
        ui.open(
          <Dialog title="Vider la semaine ?" close={ui.close}>
            <p>
              Retirer du planning les repas du {labelDate(w)} au {labelDate(addDays(w, 6))} ? Les
              repas consommés et l’historique de cuisine sont conservés.
            </p>
            <div className="actions">
              <button onClick={ui.close}>Annuler</button>
              <button
                className="primary"
                onClick={async () => {
                  if (
                    await ui.run(
                      { action: 'clearWeek', week: w, previewRevision: s.revision },
                      'Semaine vidée.',
                    )
                  )
                    ui.close();
                }}
              >
                Vider la semaine
              </button>
            </div>
          </Dialog>,
        )
      }
    >
      Vider la semaine
    </button>
  );
}
