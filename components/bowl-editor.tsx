'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  bowlUnits,
  breakfastKey,
  orderedFoods,
  suggestedBowl,
  type BowlFood,
  type Routine,
} from '@/lib/breakfast-model';
import { groceryName } from '@/lib/grocery-names';
import { Dialog, Field, Form, type UI } from './common';

export function BowlEditor({
  ui,
  routine,
  from,
}: {
  ui: UI;
  routine: Routine['foods'];
  from: string;
}) {
  const [foods, setFoods] = useState(routine);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [newUnit, setNewUnit] = useState<BowlFood['unit']>('pièce');
  const [error, setError] = useState('');
  const library = { ...suggestedBowl };
  for (const r of [...(ui.s.prefs.breakfast?.routines ?? [])].sort((a, b) =>
    a.from.localeCompare(b.from),
  ))
    Object.assign(library, r.foods);
  const suggestions = [
    ...new Set([
      ...Object.values(library).map((f) => f.name),
      'Banane',
      ...ui.s.recipes.flatMap((r) =>
        r.archived ? [] : r.data.ingredients.map((i) => groceryName(i.name)),
      ),
    ]),
  ];
  function openPicker(key: string) {
    setEditing(key);
    setName('');
    setNewUnit('pièce');
    setError('');
  }
  function remove(key: string) {
    setFoods((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  const newKey = breakfastKey(name);
  const known = library[newKey];
  function apply() {
    if (!name.trim()) {
      setError('Indique le nom de l’ingrédient.');
      return;
    }
    if (foods[newKey] && newKey !== editing) {
      setError('Cet ingrédient est déjà dans ton petit-déjeuner.');
      return;
    }
    const unit = known?.unit ?? newUnit;
    const next = { ...foods };
    if (editing) delete next[editing];
    next[newKey] = foods[newKey] ??
      known ?? {
        name: groceryName(name),
        unit,
        serving: unit === 'pièce' ? 1 : unit === 'ml' ? 100 : 30,
        size: unit === 'pièce' ? 1 : unit === 'ml' ? 1000 : 250,
        container: unit === 'pièce' ? 'pièce' : unit === 'ml' ? 'bouteille' : 'paquet',
      };
    setFoods(next);
    setEditing(null);
  }
  const picker = editing !== null && (
    <div className="ingredient-picker">
      <Field label={editing ? 'Remplacer par' : 'Nouvel ingrédient'}>
        <input
          value={name}
          maxLength={100}
          list="choix-ingredients-matin"
          placeholder="Nom de l’ingrédient"
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      <datalist id="choix-ingredients-matin">
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Field label="Mesurer en">
        <select
          value={known?.unit ?? newUnit}
          disabled={!!known}
          onChange={(e) => setNewUnit(e.target.value as BowlFood['unit'])}
        >
          {bowlUnits.map((u) => (
            <option key={u} value={u}>
              {u === 'g' ? 'Grammes' : u === 'ml' ? 'Millilitres' : 'Pièces'}
            </option>
          ))}
        </select>
      </Field>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="button" onClick={apply}>
          {editing ? 'Confirmer le remplacement' : 'Ajouter au bol'}
        </button>
        <button type="button" onClick={() => setEditing(null)}>
          Annuler
        </button>
      </div>
    </div>
  );
  return (
    <Dialog title="Personnaliser mon bol" close={ui.close}>
      <Form
        disabled={editing !== null || !Object.keys(foods).length}
        onSave={async (data) => {
          const updated = { ...foods };
          for (const [key, f] of Object.entries(foods)) {
            updated[key] = {
              ...f,
              serving: Number(data.get(key + '-portion')),
              size: Number(data.get(key + '-format')),
              container: String(data.get(key + '-container')).trim(),
            };
          }
          if (
            await ui.run(
              {
                action: 'breakfastRoutine',
                routine: { from: String(data.get('from')), foods: updated },
              },
              'Petit-déjeuner enregistré.',
            )
          )
            ui.close();
        }}
      >
        <Field label="À partir du">
          <input name="from" type="date" required defaultValue={from} />
        </Field>
        {editing === '' ? (
          picker
        ) : (
          <button type="button" onClick={() => openPicker('')}>
            <Plus size={15} /> Ajouter un ingrédient
          </button>
        )}
        {orderedFoods(foods).map(([key, f]) => (
          <fieldset className="bowl-field" aria-label={f.name} key={key}>
            <div className="bowl-item-actions">
              <strong>{f.name}</strong>
              <button
                type="button"
                aria-label={'Remplacer ' + f.name}
                onClick={() => openPicker(key)}
              >
                Remplacer
              </button>
              <button
                type="button"
                className="icon"
                aria-label={'Retirer ' + f.name}
                onClick={() => {
                  remove(key);
                  if (editing === key) setEditing(null);
                }}
              >
                <X size={15} />
              </button>
            </div>
            {editing === key && picker}
            <Field label={'Par matin (' + f.unit + ')'}>
              <input
                name={key + '-portion'}
                type="number"
                min="0"
                max="5000"
                step="any"
                required
                defaultValue={f.serving}
              />
            </Field>
            <details className="bowl-pack">
              <summary>
                Format d’achat · {f.size} {f.unit}
              </summary>
              <div className="columns">
                <Field label="Emballage">
                  <input
                    name={key + '-container'}
                    required
                    maxLength={40}
                    defaultValue={f.container}
                  />
                </Field>
                <Field label={'Contenu (' + f.unit + ')'}>
                  <input
                    name={key + '-format'}
                    type="number"
                    min="0.01"
                    max="20000"
                    step="any"
                    required
                    defaultValue={f.size}
                  />
                </Field>
              </div>
            </details>
          </fieldset>
        ))}
      </Form>
    </Dialog>
  );
}
