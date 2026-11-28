'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { addDays, inWeek, monday, today, labelDate, money } from '@/lib/dates';
import type { PlanPreviewResult } from './plan-preview.worker';
import { mealsToClear } from '@/lib/week-plan';
import { shoppingStart } from '@/lib/shopping-period';
import { planningSource } from '@/lib/recipe-sources';
import { eligibleDish, type PlanVariation } from '@/lib/planner';
import { type UI, Dialog, Field } from './common';

export function AutoPlanButton({ ui }: { ui: UI }) {
  if (ui.w < monday(today())) return null;
  return (
    <button className="weekly-auto" onClick={() => ui.open(<PlanPreview ui={ui} />)}>
      <CalendarDays size={17} />
      Planifier ma semaine
    </button>
  );
}
export function PlanPreview({
  ui,
  initialStart = shoppingStart(ui.s, ui.w),
}: {
  ui: UI;
  initialStart?: string;
}) {
  const { s } = ui;
  const [w, setStart] = useState(initialStart);
  const sources = [
    ...new Set(s.recipes.filter((r) => !r.archived).map((r) => planningSource(r.data))),
  ].sort((a, b) => a.localeCompare(b, 'fr'));

  const [variation, setVariation] = useState<PlanVariation>(() => ({
    seed: crypto.randomUUID(),
    avoid: [],
  }));
  const [response, setResponse] = useState<{
    variation: PlanVariation;
    week: string;
    result?: PlanPreviewResult;
  } | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL('./plan-preview.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<PlanPreviewResult>) =>
      setResponse({ variation, week: w, result: event.data });
    worker.onerror = () => setResponse({ variation, week: w });
    worker.postMessage({ state: s, week: w, variation });
    return () => worker.terminate();
  }, [s, w, variation]);
  const current = response?.variation === variation && response.week === w ? response : null;
  const result = current?.result;
  const rows = result?.rows ?? [];
  const cart = result?.cost;
  const remaining = rows.filter((r) => r.outsideSelection).length;
  return (
    <Dialog title="Planifier ma semaine" close={ui.close}>
      <Field label="Premier dîner">
        <input
          type="date"
          value={w}
          min={monday(today())}
          onChange={(e) => {
            if (e.target.value) {
              setStart(e.target.value);
              setVariation({ ...variation, avoid: [] });
            }
          }}
        />
      </Field>
      <p className="muted">
        Du dîner du {labelDate(w)} au déjeuner du {labelDate(addDays(w, 7))}.
      </p>
      <div className="columns plan-criteria">
        <Field label="Alimentation">
          <select
            value={variation.diet ?? 'preferences'}
            onChange={(e) =>
              setVariation({
                ...variation,
                avoid: [],
                diet: e.target.value as PlanVariation['diet'],
              })
            }
          >
            <option value="preferences">Préférences du carnet</option>
            <option value="mixed">Mixte · tous les plats</option>
            <option value="flexitarian">Flexitarien · majorité végétarienne</option>
            <option value="vegetarian">100 % végétarien</option>
          </select>
        </Field>
        <Field label="Priorité">
          <select
            value={variation.strategy ?? 'balanced'}
            onChange={(e) =>
              setVariation({
                ...variation,
                avoid: [],
                strategy: e.target.value as PlanVariation['strategy'],
              })
            }
          >
            <option value="balanced">Équilibrée · par défaut</option>
            <option value="economy">Économique</option>
            <option value="shared">Ingrédients en commun</option>
            <option value="random">Aléatoire</option>
          </select>
        </Field>
      </div>
      <fieldset className="planning-sources">
        <legend>Sources des recettes</legend>
        <div className="checks">
          <label>
            <input
              type="checkbox"
              checked={!variation.sources?.length}
              onChange={() => setVariation({ ...variation, avoid: [], sources: [] })}
            />{' '}
            Toutes les sources
          </label>
          {sources.map((source) => (
            <label key={source}>
              <input
                type="checkbox"
                checked={!!variation.sources?.includes(source)}
                onChange={(e) =>
                  setVariation({
                    ...variation,
                    avoid: [],
                    sources: e.target.checked
                      ? [...(variation.sources ?? []), source]
                      : variation.sources?.filter((v) => v !== source),
                  })
                }
              />{' '}
              {source}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="planning-favorites">
        <input
          type="checkbox"
          checked={!!variation.favoritesOnly}
          onChange={(e) =>
            setVariation({ ...variation, avoid: [], favoritesOnly: e.target.checked })
          }
        />{' '}
        Mes favoris uniquement
      </label>
      {cart && (
        <p className="notice">
          Panier estimé de la semaine · <strong>{money(cart.cents)}</strong>
          {cart.partial && ' · estimation partielle'}
        </p>
      )}
      {remaining > 0 && (
        <p className="notice">
          {remaining} repas déjà au planning sont conservés même s’ils ne correspondent pas aux
          critères.
        </p>
      )}
      {!s.recipes.some((r) => eligibleDish(r, s, variation)) && (
        <p role="status">Aucun plat complet ne correspond à ces critères dans ton carnet.</p>
      )}
      <p>
        Tu peux remplacer les plats à venir, y compris ceux choisis à la main. Les préparations déjà
        commencées, les repas dont les courses sont faites, les plats de batch cooking et les
        portions congelées gardent leur place.
      </p>
      {!current && <p role="status">Calcul de la proposition…</p>}
      {current && !result && (
        <p role="alert">Le calcul a été interrompu. Relancez une proposition.</p>
      )}
      {rows.map((r) => (
        <div key={r.id} className="plan-idea">
          <small>
            {labelDate(r.day)}
            <br />
            {r.slot === 'soir' ? 'Dîner' : 'Déjeuner'}
          </small>
          <div>
            <strong>{r.title}</strong>
            <small>{r.status}</small>
            {r.why && r.slot === 'soir' && <small>{r.why}</small>}
          </div>
        </div>
      ))}
      {result && !result.changed && <p>Aucun changement à proposer pour cette semaine.</p>}
      <div className="actions wrap">
        <button
          onClick={() =>
            setVariation({
              ...variation,
              seed: crypto.randomUUID(),
              avoid: [...new Set(rows.map((r) => r.recipeId))],
            })
          }
        >
          <RefreshCw size={16} /> Autre proposition
        </button>
        {result?.changed && (
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
  const meals = mealsToClear(s, w);
  const available =
    meals.length > 0 ||
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
              restes du dimanche soir seront retirés avec leur dîner. Les restes de la semaine
              précédente, les repas consommés et les portions congelées sont conservés.
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
