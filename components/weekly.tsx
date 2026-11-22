'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { Plus, ArrowUp, ArrowDown, Timer, Check, GripVertical, X } from 'lucide-react';
import { monday, addDays, labelDate, inWeek, today } from '@/lib/dates';
import { duration, type State, type Prep } from '@/lib/model';
import { sessionTasks, storageAlert, commonMeasures } from '@/lib/planner';
import { rounded } from '@/lib/ingredients';
import {
  Dialog,
  Form,
  Field,
  WeekNav,
  PageTabs,
  usePageTab,
  Empty,
  Photo,
  str,
  num,
  quantity,
  type UI,
} from './common';
import { Breakfast } from './breakfast';
import { PlanForm } from './recipes';
const ANSES =
  'https://www.anses.fr/fr/actualite/eviter-toxi-infections-alimentaires-confinement-bonnes-pratiques';
function PrepForm({ ui, p }: { ui: UI; p: Prep }) {
  const slots = ui.s.meals.filter((m) => m.prepId === p.id);
  return (
    <Dialog title="Ajuster la préparation" close={ui.close}>
      <Form
        onSave={async (f) => {
          if (
            await ui.run({
              action: 'prep',
              id: p.id,
              servings: num(f, 'servings')!,
              day: str(f, 'day'),
              session: str(f, 'session') || null,
              recipeId: str(f, 'recipe'),
              useCurrent: f.has('useCurrent'),
            })
          )
            ui.close();
        }}
      >
        <Field label="Recette">
          <select name="recipe" defaultValue={p.recipeId}>
            {ui.s.recipes
              .filter((r) => !r.archived || r.id === p.recipeId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.data.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Portions préparées">
          <input
            name="servings"
            type="number"
            min="1"
            max="100"
            required
            defaultValue={p.servings}
          />
        </Field>
        <Field label="Date de préparation">
          <input name="day" type="date" required defaultValue={p.day} />
        </Field>
        <Field label="Session de batch cooking">
          <select name="session" defaultValue={p.session ?? ''}>
            <option value="">Planning des repas</option>
            {ui.s.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {labelDate(s.day)}
              </option>
            ))}
          </select>
        </Field>
        {ui.s.recipes.find((r) => r.id === p.recipeId)?.version !== p.version && (
          <label>
            <input name="useCurrent" type="checkbox" /> Utiliser la dernière version de la recette
            et recalculer les courses
          </label>
        )}
        <small>
          Une session fixe la date de préparation. {slots.reduce((n, m) => n + m.servings, 0)}{' '}
          portions affectées aux repas.
        </small>
      </Form>
      <button
        className="danger"
        onClick={async () => {
          if (
            confirm('Retirer cette préparation et tous ses repas ?') &&
            (await ui.run({ action: 'removePrep', id: p.id }))
          )
            ui.close();
        }}
      >
        Retirer la préparation et ses repas
      </button>
    </Dialog>
  );
}
function MealForm({
  ui,
  day,
  slot,
  meal,
}: {
  ui: UI;
  day: string;
  slot: 'soir' | 'midi';
  meal?: State['meals'][number];
}) {
  return (
    <Dialog close={ui.close} title={meal ? 'Modifier le repas' : 'Réserver un repas'}>
      <Form
        onSave={async (f) => {
          if (
            await ui.run({
              action: 'meal',
              data: {
                id: meal?.id ?? crypto.randomUUID(),
                day: str(f, 'day'),
                slot: str(f, 'slot') as typeof slot,
                prepId: str(f, 'prep') || null,
                servings: num(f, 'n')!,
                frozen: f.has('frozen'),
                consumed: f.has('consumed'),
              },
            })
          )
            ui.close();
        }}
      >
        <Field label="Préparation">
          <select name="prep" defaultValue={meal?.prepId ?? ''}>
            <option value="">Repas à l’extérieur</option>
            {ui.s.preps
              .filter(
                (p) =>
                  p.id === meal?.prepId ||
                  ui.s.meals.filter((m) => m.prepId === p.id).reduce((n, m) => n + m.servings, 0) <
                    p.servings,
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.snapshot.title} · {labelDate(p.day)}
                </option>
              ))}
          </select>
        </Field>
        <div className="columns">
          <Field label="Date">
            <input type="date" name="day" defaultValue={day} required />
          </Field>
          <Field label="Repas">
            <select name="slot" defaultValue={slot}>
              <option value="midi">Déjeuner</option>
              <option value="soir">Dîner</option>
            </select>
          </Field>
          <Field label="Portions">
            <input
              name="n"
              type="number"
              min="1"
              max="100"
              defaultValue={meal?.servings ?? 1}
              required
            />
          </Field>
        </div>
        <label>
          <input type="checkbox" name="frozen" defaultChecked={meal?.frozen} /> Congélation prévue
          dès la préparation
        </label>
        <label>
          <input type="checkbox" name="consumed" defaultChecked={meal?.consumed} /> Repas consommé
        </label>
      </Form>
      {meal && (
        <button
          onClick={async () => {
            if (await ui.run({ action: 'removeMeal', id: meal.id }, 'Repas retiré du planning.'))
              ui.close();
          }}
        >
          Libérer ce créneau
        </button>
      )}
    </Dialog>
  );
}
function BatchForm({ ui, group }: { ui: UI; group?: State['sessions'][number] }) {
  const [count, setCount] = useState(
    group ? ui.s.preps.filter((p) => p.session === group.id).length : 0,
  );
  return (
    <Dialog title={group ? 'Modifier la session' : 'Nouvelle session de cuisine'} close={ui.close}>
      <Form
        disabled={!count}
        onSave={async (f) => {
          const key = group?.id ?? crypto.randomUUID();
          if (
            await ui.run({
              action: 'batchPlan',
              id: key,
              day: str(f, 'day'),
              name: str(f, 'name'),
              preps: f.getAll('prep').map(String),
            })
          )
            ui.close();
        }}
      >
        <Field label="Nom de la session">
          <input name="name" defaultValue={group?.name ?? 'Cuisine de la semaine'} required />
        </Field>
        <Field label="Date">
          <input type="date" name="day" defaultValue={group?.day ?? ui.w} required />
        </Field>
        <h3>Préparations à regrouper</h3>
        {ui.s.preps
          .filter((p) => p.session === group?.id || (!p.session && !p.done && inWeek(p.day, ui.w)))
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                name="prep"
                onChange={(e) => setCount(count + (e.target.checked ? 1 : -1))}
                value={p.id}
                defaultChecked={!!group && p.session === group.id}
              />{' '}
              {p.snapshot.title} · {labelDate(p.day)}
            </label>
          ))}
      </Form>
    </Dialog>
  );
}
const weekTabs = [
  ['planning', 'Planning des repas'],
  ['batch-cooking', 'Batch cooking'],
  ['petit-dejeuner', 'Petit-déjeuner'],
] as const;
export function Planner({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const active = usePageTab(weekTabs);
  return (
    <>
      <header className="page-heading">
        <h1>Ma semaine</h1>
        <WeekNav ui={ui} />
      </header>
      <div className="toolbar wrap">
        <PageTabs options={weekTabs} active={active} />
        {active !== 'petit-dejeuner' && (
          <div className="actions">
            {w >= monday(today()) && s.meals.filter((m) => inWeek(m.day, w)).length < 14 && (
              <button
                onClick={() =>
                  ui.run(
                    { action: 'fillWeek', week: w },
                    'Les dîners disponibles ont été planifiés selon votre objectif.',
                  )
                }
              >
                Compléter la semaine
              </button>
            )}
            <button className="primary" onClick={() => ui.open(<PlanForm ui={ui} />)}>
              <Plus size={16} /> Planifier
            </button>
          </div>
        )}
      </div>
      {active === 'petit-dejeuner' ? (
        <Breakfast ui={ui} />
      ) : (
        <MealPlanning ui={ui} batch={active === 'batch-cooking'} />
      )}
    </>
  );
}
function MealPlanning({ ui, batch }: { ui: UI; batch: boolean }) {
  const [moving, setMoving] = useState('');
  const [over, setOver] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const finishMove = (id: string, day: string, slot: 'midi' | 'soir') => {
    setMoving('');
    setOver('');
    if (id) void ui.run({ action: 'moveMeal', id, day, slot }, 'Planning réorganisé');
  };
  const locate = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-mealslot]');

  const { s, w } = ui;
  const preps = s.preps.filter((p) => inWeek(p.day, w));
  return (
    <>
      {batch && (
        <section className="panel">
          <div className="split">
            <h2>Sessions de cuisine</h2>
            {preps.some((p) => !p.session && !p.done) && (
              <button onClick={() => ui.open(<BatchForm ui={ui} />)}>
                Regrouper des préparations
              </button>
            )}
          </div>
          {s.sessions
            .filter((g) => inWeek(g.day, w))
            .map((g) => (
              <div className="row" key={g.id}>
                <button onClick={() => ui.open(<BatchForm group={g} ui={ui} />)}>
                  {g.name} · {labelDate(g.day)}
                </button>
                <Link href={'/cuisiner?week=' + w + '&session=' + g.id}>Cuisiner →</Link>
              </div>
            ))}
          <p>
            {preps.length
              ? 'Regroupez les plats à cuisiner le même jour. Les déjeuners et dîners gardent leurs dates.'
              : 'Planifiez d’abord les plats de la semaine. Vous pourrez ensuite les préparer ensemble.'}
          </p>
        </section>
      )}
      {moving && (
        <div className="move-help" role="status">
          Choisir le créneau de destination. Deux repas occupés seront échangés.{' '}
          <button
            onClick={() => {
              setMoving('');
              setOver('');
            }}
          >
            Annuler
          </button>
        </div>
      )}
      <div className="calendar">
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(w, i);
          return (
            <section className="calday" key={day} id={'jour-' + day}>
              <header>
                <b>{labelDate(day, { weekday: 'long' })}</b>
                <span>{labelDate(day, { day: 'numeric', month: 'short' })}</span>
              </header>
              {(['midi', 'soir'] as const).map((slot) => {
                const m = s.meals.find((m) => m.day === day && m.slot === slot);
                const p = s.preps.find((p) => p.id === m?.prepId);
                return (
                  <div
                    key={slot}
                    data-mealslot={day + slot}
                    data-day={day}
                    data-slot={slot}
                    className={'slot' + (over === day + slot ? ' drop-over' : '')}
                    onDragOver={(e) => {
                      if (moving) {
                        e.preventDefault();
                        setOver(day + slot);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      finishMove(e.dataTransfer.getData('text/meal-id') || moving, day, slot);
                    }}
                  >
                    <small>{slot === 'midi' ? 'Déjeuner' : 'Dîner'}</small>
                    {moving && moving !== m?.id && !m?.consumed && (
                      <button className="drop-target" onClick={() => finishMove(moving, day, slot)}>
                        {m ? 'Échanger ici' : 'Déplacer ici'}
                      </button>
                    )}
                    {m ? (
                      <div
                        className="meal-card"
                        draggable={!m.consumed}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/meal-id', m.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setMoving(m.id);
                        }}
                        onDragEnd={() => {
                          setMoving('');
                          setOver('');
                        }}
                      >
                        {!m.consumed && (
                          <button
                            className="move-grip"
                            aria-label={'Déplacer ' + (p?.snapshot.title ?? 'le repas')}
                            title="Déplacer le repas"
                            onClick={() => setMoving(moving === m.id ? '' : m.id)}
                            onPointerDown={(e) => {
                              if (e.pointerType === 'mouse') return;
                              touch.current = { x: e.clientX, y: e.clientY };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              if (
                                !touch.current ||
                                Math.hypot(
                                  e.clientX - touch.current.x,
                                  e.clientY - touch.current.y,
                                ) < 8
                              )
                                return;
                              setMoving(m.id);
                              setOver(locate(e.clientX, e.clientY)?.dataset.mealslot ?? '');
                            }}
                            onPointerCancel={() => {
                              touch.current = null;
                              setMoving('');
                              setOver('');
                            }}
                            onPointerUp={(e) => {
                              const start = touch.current;
                              touch.current = null;
                              if (
                                !start ||
                                Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8
                              )
                                return;
                              const d = locate(e.clientX, e.clientY)?.dataset;
                              if (d?.day && (d.slot === 'midi' || d.slot === 'soir'))
                                finishMove(m.id, d.day, d.slot);
                              else {
                                setMoving('');
                                setOver('');
                              }
                              e.currentTarget.addEventListener(
                                'click',
                                (ev) => ev.stopPropagation(),
                                { once: true },
                              );
                            }}
                          >
                            <GripVertical size={16} />
                          </button>
                        )}
                        <button
                          className="scheduled"
                          onClick={() =>
                            ui.open(<MealForm ui={ui} day={day} slot={slot} meal={m} />)
                          }
                        >
                          {p?.snapshot.image && <Photo src={p.snapshot.image} />}
                          <span>
                            {p?.snapshot.title ?? 'Repas à l’extérieur'}
                            <small>
                              {m.servings} portion{m.servings > 1 ? 's' : ''}
                              {m.consumed
                                ? ' · consommée'
                                : m.frozen
                                  ? ' · congélation prévue'
                                  : ''}
                            </small>
                            {p && storageAlert(p, m) && (
                              <small className="warn">{storageAlert(p, m)}</small>
                            )}
                          </span>
                        </button>
                        {!m.consumed && (
                          <button
                            className="meal-remove"
                            aria-label={
                              'Retirer ' +
                              (p?.snapshot.title ?? 'le repas') +
                              ' du ' +
                              labelDate(day) +
                              ' ' +
                              slot
                            }
                            onClick={() =>
                              ui.run({ action: 'removeMeal', id: m.id }, 'Repas retiré du planning')
                            }
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="slot-actions">
                        <button onClick={() => ui.open(<PlanForm ui={ui} day={day} slot={slot} />)}>
                          + Recette
                        </button>
                        <button onClick={() => ui.open(<MealForm ui={ui} day={day} slot={slot} />)}>
                          Portion ou extérieur
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <div className="section-heading">
        <h2>Préparations de la semaine</h2>
      </div>
      {preps.map((p) => {
        const used = s.meals
          .filter((m) => m.prepId === p.id && m.consumed)
          .reduce((n, m) => n + m.servings, 0);
        return (
          <div key={p.id} className="row">
            <div>
              <strong>{p.snapshot.title}</strong>
              <small>
                {labelDate(p.day)} ·{' '}
                {p.done
                  ? p.servings - used + ' portions restantes'
                  : p.servings + ' portions à préparer'}
              </small>
            </div>
            <div className="actions">
              <Link className="button" href={'/cuisiner?week=' + w + '&session=' + p.id}>
                Cuisiner
              </Link>
              <button onClick={() => ui.open(<PrepForm ui={ui} p={p} />)}>Ajuster</button>
            </div>
          </div>
        );
      })}
      {!preps.length && (
        <Empty title="Aucune préparation planifiée">
          <Link href={'/recettes?week=' + w}>Choisir dans le carnet →</Link>
        </Empty>
      )}
      <button
        className="more"
        onClick={() =>
          ui.open(
            <Dialog title="Dupliquer cette semaine" close={ui.close}>
              <Form
                onSave={async (f) => {
                  const to = monday(str(f, 'day'));
                  if (await ui.run({ action: 'duplicateWeek', week: w, to })) {
                    ui.setW(to);
                    ui.close();
                  }
                }}
              >
                <Field label="Semaine de destination (vide)">
                  <input name="day" type="date" required defaultValue={addDays(w, 7)} />
                </Field>
              </Form>
            </Dialog>,
          )
        }
      >
        Dupliquer la semaine et sa liste
      </button>
    </>
  );
}
function TimerBox() {
  const [minutes, setMinutes] = useState(10),
    [end, setEnd] = useState(0),
    [now, setNow] = useState(0);
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [end]);
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return (
    <div className="timer">
      <Timer size={18} />
      {end ? (
        <>
          <strong role="status">
            {seconds
              ? Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s'
              : 'Minuteur terminé'}
          </strong>
          <button onClick={() => setEnd(0)}>Effacer</button>
        </>
      ) : (
        <>
          <input
            aria-label="Durée du minuteur en minutes"
            type="number"
            min="1"
            max="600"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
          <span>min</span>
          <button
            onClick={() => {
              if (minutes > 0 && minutes <= 600) {
                setEnd(Date.now() + minutes * 60000);
                setNow(Date.now());
              }
            }}
          >
            Démarrer
          </button>
        </>
      )}
    </div>
  );
}
export function Cooking({ ui, initialSession }: { ui: UI; initialSession: string }) {
  const [selected, setSelected] = useState(initialSession),
    [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!awake) return;
    let stopped = false,
      lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState === 'visible')
        try {
          const held = await navigator.wakeLock.request('screen');
          if (stopped) await held.release();
          else lock = held;
        } catch {
          setAwake(false);
        }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      void lock?.release();
      document.removeEventListener('visibilitychange', acquire);
    };
  }, [awake]);
  const preps = ui.s.preps
      .filter((p) => inWeek(p.day, ui.w))
      .sort((a, b) => a.day.localeCompare(b.day)),
    groups = ui.s.sessions.filter((g) => inWeek(g.day, ui.w));
  const key = [...preps, ...groups].some((x) => x.id === selected)
    ? selected
    : groups[0]?.id || preps.find((p) => !p.done)?.id || preps[0]?.id;
  const group = groups.find((g) => g.id === key),
    chosen = group ? preps.filter((p) => p.session === key) : preps.filter((p) => p.id === key);
  const tasks = group
    ? sessionTasks(ui.s, group.id)
    : chosen.flatMap((p) =>
        p.snapshot.steps.map((step, n) => ({ p, step, n, key: p.id + ':' + n })),
      );
  const shared = commonMeasures(chosen);
  async function move(i: number, j: number) {
    const order = tasks.map((t) => t.key);
    [order[i], order[j]] = [order[j], order[i]];
    if (group)
      await ui.run({ action: 'session', data: { ...group, order } }, 'Ordre des tâches enregistré');
  }
  return (
    <>
      <header className="page-heading">
        <h1>En cuisine</h1>
        <WeekNav ui={ui} />
      </header>
      {!preps.length && !groups.length ? (
        <Empty title="Aucune préparation cette semaine">
          <Link href={'/semaine?week=' + ui.w}>Planifier un repas →</Link>
        </Empty>
      ) : (
        <>
          {preps.length + groups.length > 1 && (
            <nav className="cook-rail" aria-label="Choisir une préparation">
              {[
                ...groups.map((g) => ({
                  id: g.id,
                  title: g.name,
                  meta: 'Session · ' + labelDate(g.day),
                  image: '',
                })),
                ...preps.map((p) => ({
                  id: p.id,
                  title: p.snapshot.title,
                  meta: labelDate(p.day),
                  image: p.snapshot.image,
                })),
              ].map((v) => (
                <button key={v.id} aria-pressed={key === v.id} onClick={() => setSelected(v.id)}>
                  {v.image && <Photo src={v.image} />}
                  <span>
                    <small>{v.meta}</small>
                    {v.title}
                  </span>
                </button>
              ))}
            </nav>
          )}
          <div className="panel cook-sheet">
            <div className="cook-title">
              {!group && chosen[0]?.snapshot.image && <Photo src={chosen[0].snapshot.image} />}
              <h2>{group?.name ?? chosen[0]?.snapshot.title}</h2>
            </div>
            {chosen.map((p) => (
              <div key={p.id}>
                <h3>
                  {group ? p.snapshot.title + ' · ' : 'Ingrédients pour '}
                  {p.servings} portions
                </h3>
                {!p.snapshot.base && (
                  <p className="notice">
                    Confirmez les portions de référence pour adapter les quantités.
                  </p>
                )}
                <dl className="cooking-ingredients">
                  {p.snapshot.ingredients.map((i, k) => (
                    <div key={k}>
                      <dt>{i.name}</dt>
                      <dd>
                        {i.unit === 'selon le goût'
                          ? 'Selon le goût'
                          : [
                              quantity(
                                p.snapshot.base && i.quantity
                                  ? rounded((i.quantity * p.servings) / p.snapshot.base)
                                  : null,
                              ),
                              i.unit,
                            ].join(' ')}
                      </dd>
                    </div>
                  ))}
                </dl>
                {p.snapshot.equipment.length > 0 && (
                  <details className="equipment">
                    <summary>Ustensiles</summary>
                    <p>{p.snapshot.equipment.join(', ')}</p>
                  </details>
                )}
              </div>
            ))}
            {group && (
              <>
                <h3>Pesées communes possibles</h3>
                {shared.length === 0 && (
                  <small>Aucune quantité commune vérifiable dans cette session.</small>
                )}
                {shared.map((v) => (
                  <div className="row" key={v.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={group.weighed?.includes(v.key) ?? false}
                        onChange={(e) => {
                          const saved = (group.weighed ?? []).filter((k) => k !== v.key);
                          if (e.target.checked) saved.push(v.key);
                          void ui.run({ action: 'session', data: { ...group, weighed: saved } });
                        }}
                      />{' '}
                      {v.name} · {quantity(v.total)} {v.unit}
                      <small>
                        {v.parts
                          .map((x) => x.title + ' · ' + quantity(x.q) + ' ' + v.unit)
                          .join(' / ')}
                      </small>
                    </label>
                  </div>
                ))}
                <small>
                  {shared.filter((v) => group.weighed?.includes(v.key)).length} pesées communes
                  terminées · gain de temps non chronométré.
                </small>
                <p>
                  Temps actif ·{' '}
                  {chosen.length && chosen.every((p) => p.snapshot.prep !== null)
                    ? chosen.reduce((n, p) => n + p.snapshot.prep!, 0) + ' min'
                    : 'Inconnu'}{' '}
                  · Durée séquentielle estimée ·{' '}
                  {chosen.length && chosen.every((p) => duration(p.snapshot) !== null)
                    ? chosen.reduce((n, p) => n + duration(p.snapshot)!, 0) + ' min'
                    : 'Inconnue'}
                </p>
              </>
            )}
          </div>
          {tasks.length > 0 ? (
            <>
              <div className="section-heading">
                <h2>
                  Étapes · {tasks.filter((t) => t.p.ticks.includes(t.n)).length}/{tasks.length}
                </h2>
                <label>
                  <input
                    type="checkbox"
                    checked={awake}
                    onChange={(e) => setAwake(e.target.checked)}
                  />{' '}
                  Garder l’écran allumé
                </label>
              </div>
              <TimerBox />
              {tasks.map((t, i) => (
                <div key={t.key} className={'task ' + (t.p.ticks.includes(t.n) ? 'done' : '')}>
                  <input
                    type="checkbox"
                    aria-label={'Terminer étape ' + (t.n + 1)}
                    checked={t.p.ticks.includes(t.n)}
                    onChange={(e) =>
                      ui.run({ action: 'tick', id: t.p.id, index: t.n, checked: e.target.checked })
                    }
                  />
                  <div>
                    <small>
                      {group ? t.p.snapshot.title + ' · ' : ''}Étape {t.n + 1}
                    </small>
                    <p>
                      {t.step.text.replace(
                        /^Veillez à bien respecter les quantités indiquées à gauche pour préparer votre recette\s*!\s*/i,
                        '',
                      ) || t.step.text}
                    </p>
                    {t.step.image && <Photo src={t.step.image} className="step-photo" />}
                  </div>
                  {group && (
                    <div>
                      <button
                        className="icon"
                        aria-label="Monter la tâche"
                        disabled={!i || tasks[i - 1].p.id === t.p.id}
                        onClick={() => move(i, i - 1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon"
                        aria-label="Descendre la tâche"
                        disabled={i === tasks.length - 1 || tasks[i + 1].p.id === t.p.id}
                        onClick={() => move(i, i + 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <Empty title="Aucune étape disponible">
              {group && !chosen.length
                ? 'Ajoutez une préparation à cette session dans Ma semaine.'
                : 'Cette ancienne préparation ne contient pas d’instructions.'}
            </Empty>
          )}
          <div className="panel">
            <h2>Conditionnement et conservation</h2>
            <p>
              Répartissez en petites boîtes fermées et réfrigérez dans les deux heures. Gardez la
              zone froide à 4 °C et consommez les plats maison dans les trois jours. Pour un repas
              plus tardif, prévoyez la congélation dès la préparation si le plat s’y prête.
            </p>
            <a className="text-link" href={ANSES} target="_blank" rel="noreferrer">
              Lire les recommandations de l’Anses ↗
            </a>
            {chosen.map((p) => (
              <div key={p.id}>
                <h3>{p.snapshot.title}</h3>
                {ui.s.meals
                  .filter((m) => m.prepId === p.id)
                  .map((m) => (
                    <div className="row" key={m.id}>
                      <span>
                        {labelDate(m.day)} · {m.slot} · {m.servings} portion(s)
                        {m.frozen ? ' · congélation prévue' : ''}
                        <small className="warn">{storageAlert(p, m)}</small>
                      </span>
                      <button
                        onClick={() =>
                          ui.open(<MealForm ui={ui} day={m.day} slot={m.slot} meal={m} />)
                        }
                      >
                        Ajuster
                      </button>
                    </div>
                  ))}
                <button
                  className="primary"
                  onClick={() =>
                    ui.run(
                      { action: 'finish', id: p.id, done: !p.done },
                      p.done ? 'Préparation rouverte' : 'Portions disponibles dans le planning',
                    )
                  }
                >
                  <Check size={16} />
                  {p.done ? 'Rouvrir la préparation' : 'Terminer la préparation'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
