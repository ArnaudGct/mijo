'use client';
import Link from 'next/link';
import { useState, useRef, useEffect, type DragEvent, type PointerEvent } from 'react';
import { Plus, GripVertical, X } from 'lucide-react';
import { monday, addDays, labelDate, inWeek, today } from '@/lib/dates';
import { type State, type Prep } from '@/lib/model';
import { storageAlert } from '@/lib/planner';
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
  type UI,
} from './common';
import { Breakfast } from './breakfast';
import { PlanForm } from './recipes';
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
export function MealForm({
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
type MealSlot = State['meals'][number]['slot'];
function destination(hit: EventTarget | null, originalSlot: MealSlot) {
  if (!(hit instanceof Element)) return null;
  const cell = hit.closest<HTMLElement>('[data-mealslot]');
  if (cell) return cell;
  // Dropping on the day label keeps the original mealtime.
  const day = hit.closest('.calday > header')?.parentElement;
  return day?.querySelector<HTMLElement>('[data-slot="' + originalSlot + '"]') ?? null;
}
function acceptsMeal(element: HTMLElement | null, id: string): element is HTMLElement {
  return !!element && !!id && element.dataset.mealId !== id && element.dataset.consumed !== 'true';
}

function MealPlanning({ ui, batch }: { ui: UI; batch: boolean }) {
  const [picked, setPicked] = useState('');
  const [over, setOver] = useState('');
  const [touchDragging, setTouchDragging] = useState(false);
  const nativeMeal = useRef<{ id: string; slot: MealSlot } | null>(null);
  const touch = useRef<{
    id: string;
    slot: MealSlot;
    pointer: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);
  const calendar = useRef<HTMLDivElement>(null);

  function clearDrag() {
    nativeMeal.current = null;
    touch.current = null;
    setTouchDragging(false);
    setOver('');
    setPicked('');
  }
  function finishMove(id: string, element: HTMLElement | null) {
    clearDrag();
    if (!acceptsMeal(element, id)) return;
    const { day, slot, mealId } = element.dataset;
    if (day && (slot === 'midi' || slot === 'soir'))
      void ui.run(
        { action: 'moveMeal', id, day, slot },
        mealId ? 'Repas échangés.' : 'Repas déplacé.',
      );
  }
  function acceptDrag(e: DragEvent<HTMLDivElement>) {
    // The browser cancels mouse pointer events when a native drag starts.
    // Use its synchronous source, independently of touch and keyboard selection.
    const source = nativeMeal.current;
    if (!source) return;
    const target = destination(e.target, source.slot);
    if (acceptsMeal(target, source.id)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(target.dataset.mealslot ?? '');
    } else {
      setOver('');
    }
  }
  function touchMove(e: PointerEvent<HTMLButtonElement>) {
    const g = touch.current;
    if (!g || e.pointerId !== g.pointer) return;
    g.x = e.clientX;
    g.y = e.clientY;
    if (!g.moved) {
      if (Math.hypot(g.x - g.startX, g.y - g.startY) < 6) return;
      g.moved = true;
      setPicked('');
      setTouchDragging(true);
    }
    const target = destination(document.elementFromPoint(g.x, g.y), g.slot);
    setOver(acceptsMeal(target, g.id) ? (target.dataset.mealslot ?? '') : '');
  }
  useEffect(() => {
    if (!touchDragging) return;
    let frame = 0;
    function scroll() {
      const g = touch.current,
        grid = calendar.current;
      if (!g || !grid) return;
      const bounds = grid.getBoundingClientRect(),
        edge = 96;
      const up = Math.max(0, edge - g.y),
        down = Math.max(0, g.y - (window.innerHeight - edge));
      const speed =
        down && bounds.bottom > window.innerHeight ? down : up && bounds.top < 0 ? -up : 0;
      if (speed) {
        window.scrollBy({
          top: Math.sign(speed) * Math.min(15, Math.ceil(Math.abs(speed) / 5)),
          behavior: 'instant',
        });
        const target = destination(document.elementFromPoint(g.x, g.y), g.slot);
        setOver(acceptsMeal(target, g.id) ? (target.dataset.mealslot ?? '') : '');
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [touchDragging]);

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
      {picked && (
        <div className="move-help" role="status">
          Choisis le créneau où déposer le repas. <button onClick={clearDrag}>Annuler</button>
        </div>
      )}
      <div
        className="calendar"
        ref={calendar}
        onKeyDown={(e) => {
          if (e.key === 'Escape') clearDrag();
        }}
        onPointerDownCapture={() => {
          ignoreClick.current = false;
        }}
        onClickCapture={(e) => {
          if (ignoreClick.current && e.detail !== 0) {
            e.preventDefault();
            e.stopPropagation();
            ignoreClick.current = false;
          }
        }}
        onDragEnter={acceptDrag}
        onDragOver={acceptDrag}
        onDrop={(e) => {
          const source = nativeMeal.current;
          if (!source) return;
          e.preventDefault();
          finishMove(source.id, destination(e.target, source.slot));
        }}
        onDragLeave={(e) => {
          if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))
            setOver('');
        }}
      >
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
                    data-meal-id={m?.id}
                    data-consumed={m?.consumed || undefined}
                    data-drop-label={m ? 'Échanger ici' : 'Déplacer ici'}
                  >
                    <small>{slot === 'midi' ? 'Déjeuner' : 'Dîner'}</small>
                    {picked && picked !== m?.id && !m?.consumed && (
                      <button
                        className="drop-target"
                        aria-label={
                          (m ? 'Échanger avec ' : 'Déplacer vers ') +
                          labelDate(day) +
                          (slot === 'midi' ? ' déjeuner' : ' dîner')
                        }
                        onClick={(e) => finishMove(picked, e.currentTarget.parentElement)}
                      >
                        <span>{m ? 'Échanger ici' : 'Déplacer ici'}</span>
                      </button>
                    )}
                    {m ? (
                      <div
                        className="meal-card"
                        draggable={!m.consumed}
                        onDragStart={(e) => {
                          if (m.consumed || touch.current) {
                            e.preventDefault();
                            return;
                          }
                          nativeMeal.current = { id: m.id, slot };
                          e.dataTransfer.setData('text/plain', m.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setPicked('');
                        }}
                        onDragEnd={clearDrag}
                      >
                        {!m.consumed && (
                          <button
                            className="move-grip"
                            aria-label={'Déplacer ' + (p?.snapshot.title ?? 'le repas')}
                            title="Déplacer le repas"
                            aria-pressed={picked === m.id}
                            onClick={() => setPicked(picked === m.id ? '' : m.id)}
                            onPointerDown={(e) => {
                              if (e.pointerType === 'mouse' || !e.isPrimary || e.button !== 0)
                                return;
                              touch.current = {
                                id: m.id,
                                slot,
                                pointer: e.pointerId,
                                startX: e.clientX,
                                startY: e.clientY,
                                x: e.clientX,
                                y: e.clientY,
                                moved: false,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={touchMove}
                            onPointerCancel={(e) => {
                              if (touch.current?.pointer === e.pointerId) clearDrag();
                            }}
                            onLostPointerCapture={(e) => {
                              if (touch.current?.pointer === e.pointerId) clearDrag();
                            }}
                            onPointerUp={(e) => {
                              const g = touch.current;
                              if (!g || g.pointer !== e.pointerId) return;
                              touch.current = null;
                              if (!g.moved) return;
                              ignoreClick.current = true;
                              finishMove(
                                g.id,
                                destination(
                                  document.elementFromPoint(e.clientX, e.clientY),
                                  g.slot,
                                ),
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
