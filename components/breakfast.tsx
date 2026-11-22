'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList, SlidersHorizontal } from 'lucide-react';
import {
  breakfastFoods,
  breakfastKeys,
  suggestedBowl,
  type Reading,
  type Routine,
} from '@/lib/breakfast-model';
import { marketBasket } from '@/lib/market';
import { today, labelDate, money } from '@/lib/dates';
import { Form, Field, Dialog, type UI } from './common';

const number = (q: number) => q.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const amount = (q: number, unit: string) =>
  unit === 'ml' && q >= 1000
    ? number(q / 1000) + ' L'
    : number(q) + ' ' + (unit === 'pièce' ? (q > 1 ? 'pommes' : 'pomme') : unit);
const packCount = (n: number, label: string) => number(n) + ' ' + label + (n > 1 ? 's' : '');
function formatSize(size: number, unit: string, container: string) {
  return unit === 'pièce' && size === 1 ? 'la pomme' : container + ' de ' + amount(size, unit);
}
function RoutineForm({ ui, routine, from }: { ui: UI; routine: Routine['foods']; from: string }) {
  return (
    <Dialog title="Ajuster mon bol" close={ui.close}>
      <Form
        onSave={async (f) => {
          const foods = structuredClone(routine);
          for (const k of breakfastKeys)
            foods[k] = {
              serving: Number(f.get(k + '-portion')),
              size: Number(f.get(k + '-format')),
            };
          if (
            await ui.run(
              { action: 'breakfastRoutine', routine: { from: String(f.get('from')), foods } },
              'Quantités et formats enregistrés.',
            )
          )
            ui.close();
        }}
      >
        <Field label="À partir du">
          <input type="date" required name="from" defaultValue={from} />
        </Field>
        {breakfastKeys.map((k) => (
          <fieldset className="bowl-field" key={k}>
            <legend>{breakfastFoods[k].name}</legend>
            <div className="columns">
              <Field label={'Par matin (' + breakfastFoods[k].unit + ')'}>
                <input
                  name={k + '-portion'}
                  type="number"
                  min="0"
                  max="5000"
                  step="any"
                  required
                  defaultValue={routine[k].serving}
                />
              </Field>
              <Field
                label={'Par ' + breakfastFoods[k].container + ' (' + breakfastFoods[k].unit + ')'}
              >
                <input
                  name={k + '-format'}
                  type="number"
                  min="0.01"
                  max="20000"
                  step="any"
                  required
                  defaultValue={routine[k].size}
                />
              </Field>
            </div>
          </fieldset>
        ))}
      </Form>
    </Dialog>
  );
}
function StockForm({ ui }: { ui: UI }) {
  const [day, setDay] = useState(today());
  const editions = ui.s.prefs.breakfast?.routines ?? [];
  const first = [...editions].sort((a, b) => a.from.localeCompare(b.from))[0];
  const routine =
    editions.filter((r) => r.from <= day).sort((a, b) => b.from.localeCompare(a.from))[0]?.foods ??
    first?.foods ??
    suggestedBowl;
  const [error, setError] = useState('');
  return (
    <Dialog title="Relever mon stock" close={ui.close}>
      <Form
        button="Enregistrer le relevé"
        onSave={async (f) => {
          const readings: Reading[] = [];
          for (const k of breakfastKeys) {
            const packs = String(f.get(k + '-count') ?? ''),
              loose = String(f.get(k + '-loose') ?? '');
            if (packs === '' && loose === '') continue;
            readings.push({
              day,
              afterBreakfast: f.has('after'),
              food: k,
              amount: Math.round((Number(packs) * routine[k].size + Number(loose)) * 10000) / 10000,
            });
          }
          if (!readings.length) {
            setError('Indique au moins une quantité.');
            return;
          }
          if (await ui.run({ action: 'breakfastStock', readings }, 'Stock mis à jour.')) ui.close();
        }}
      >
        <Field label="Date du relevé">
          <input
            type="date"
            required
            value={day}
            max={today()}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <label>
          <input type="checkbox" name="after" /> J’ai déjà pris le petit-déjeuner de cette date
        </label>
        <p>
          Un zéro indique un produit épuisé. Laisse les autres lignes vides pour conserver leur
          relevé.
        </p>
        {breakfastKeys.map((k) => {
          const food = breakfastFoods[k],
            size = routine[k].size;
          return (
            <fieldset className="bowl-field" key={k}>
              <legend>{food.name}</legend>
              <div className="columns">
                <Field
                  label={
                    k === 'apple' && size === 1
                      ? 'Nombre de pommes'
                      : 'Nombre de ' + food.container + 's de ' + amount(size, food.unit)
                  }
                >
                  <input
                    aria-label={'Nombre de formats · ' + food.name}
                    name={k + '-count'}
                    type="number"
                    step="any"
                    min="0"
                    max="10000"
                    placeholder="—"
                  />
                </Field>
                {k !== 'apple' && (
                  <Field label={'Reste en plus (' + food.unit + ')'}>
                    <input
                      aria-label={'Reste en plus · ' + food.name}
                      name={k + '-loose'}
                      type="number"
                      step="any"
                      min="0"
                      max="1000000"
                      placeholder="—"
                    />
                  </Field>
                )}
              </div>
            </fieldset>
          );
        })}
        {error && <p role="alert">{error}</p>}
      </Form>
    </Dialog>
  );
}
export function Breakfast({ ui }: { ui: UI }) {
  const cart = marketBasket(ui.s, ui.w);
  const forecast = cart.breakfast;
  const first = forecast[0],
    cfg = ui.s.prefs.breakfast;
  const day = ui.w > today() ? ui.w : today();
  const latest = cfg?.routines
    .filter((r) => r.from <= day)
    .sort((a, b) => b.from.localeCompare(a.from))[0];
  const edit = () =>
    ui.open(<RoutineForm ui={ui} from={day} routine={latest?.foods ?? suggestedBowl} />);
  if (!first || !first.days)
    return (
      <section className="panel">
        <h2>Mon petit-déjeuner</h2>
        <p>
          {cfg?.routines.length
            ? 'Aucun petit-déjeuner restant sur cette semaine.'
            : 'Flocons d’avoine, lait, pomme, skyr et cannelle.'}
        </p>
        <div className="actions">
          <button onClick={edit}>Régler mon bol</button>
          {cfg?.routines.length ? (
            <button onClick={() => ui.open(<StockForm ui={ui} />)}>Relever mon stock</button>
          ) : null}
        </div>
      </section>
    );
  const involved = cart.lines.filter((l) => l.breakfast);
  const bowl = involved.reduce((n, l) => n + (l.breakfast?.bowl ?? 0), 0);
  const subtotal = involved.reduce((n, l) => n + (l.cents ?? 0), 0);
  return (
    <section className="breakfast-sheet">
      <div className="section-heading">
        <div>
          <h2>Mon petit-déjeuner</h2>
          <small>
            {first.days} matin{first.days > 1 ? 's' : ''} à partir du{' '}
            {labelDate(first.start, { day: 'numeric', month: 'long' })}
          </small>
        </div>
        <div className="actions">
          <button onClick={edit}>
            <SlidersHorizontal size={15} /> Ajuster mon bol
          </button>
          <button className="primary" onClick={() => ui.open(<StockForm ui={ui} />)}>
            <ClipboardList size={16} /> Relever mon stock
          </button>
        </div>
      </div>
      <div className="breakfast-cost">
        <div>
          <small>Un bol estimé</small>
          <strong>{money(Math.round(bowl))}</strong>
        </div>
        <div>
          <small>
            {involved.some((l) => l.cents === null)
              ? 'Sous-total chiffré'
              : 'À acheter pour ces produits'}
          </small>
          <strong>{money(subtotal)}</strong>
        </div>
      </div>
      <p className="breakfast-note">
        Ces achats tiennent compte de tes autres repas.{' '}
        <Link className="text-link" href={'/courses?week=' + ui.w}>
          Voir ma liste de courses
        </Link>
      </p>
      <div className="breakfast-table">
        {forecast.map((p) => {
          const line = involved.find((l) => l.breakfast?.product.key === p.key),
            info = line?.breakfast;
          const containers = line?.packs ?? 0;
          const covered = p.reserve || line?.available;
          return (
            <article key={p.key}>
              <div>
                <h3>{p.name}</h3>
                <small>
                  {amount(p.serving, p.unit)} par matin · {amount(p.quantity, p.unit)} sur la
                  période
                </small>
              </div>
              <div>
                <small>Stock au {labelDate(p.start, { day: 'numeric', month: 'short' })}</small>
                <b>
                  {covered
                    ? 'Au placard'
                    : p.stock === null
                      ? 'À renseigner'
                      : amount(p.stock, p.unit)}
                </b>
                {!covered && p.stock !== null && p.serving > 0 && (
                  <small>
                    {Math.floor(p.stock / p.serving)}{' '}
                    {Math.floor(p.stock / p.serving) > 1 ? 'bols' : 'bol'} de ce produit
                  </small>
                )}
              </div>
              <div>
                <small>À racheter</small>
                <b>
                  {covered || !line?.buy.length
                    ? 'Aucun achat'
                    : containers
                      ? packCount(containers, p.container)
                      : 'À préciser'}
                </b>
                {line?.buy.length && !containers ? <small>Quantité à préciser</small> : null}
                {info?.packPrice != null && (
                  <small>
                    {info.observed ? '' : '≈ '}
                    {money(info.packPrice)} / {formatSize(p.size, p.unit, p.container)}
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <small className="breakfast-note">
        Le stock estimé diminue avec les petits-déjeuners et les recettes prévus depuis ton dernier
        relevé. Une quantité non renseignée est comptée intégralement dans les achats. Les prix des
        formats sans relevé exact sont estimés au prorata.
      </small>
    </section>
  );
}
