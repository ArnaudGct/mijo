'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  List,
  Timer,
  Utensils,
} from 'lucide-react';
import { inWeek, labelDate } from '@/lib/dates';
import { duration, type State, type Prep } from '@/lib/model';
import { commonMeasures, sessionTasks, storageAlert } from '@/lib/planner';
import { rounded } from '@/lib/ingredients';
import { Dialog, Empty, Photo, WeekNav, quantity, type UI } from './common';
import { MealForm } from './weekly';

type Session = State['sessions'][number];
type Tasks = ReturnType<typeof sessionTasks>;
type Choice = { id: string; title: string; day: string; image: string; session: boolean };
function DishImage({ src }: { src: string }) {
  return (
    <span className="cook-art" aria-hidden="true">
      <Utensils size={20} />
      {src && <Photo src={src} />}
    </span>
  );
}
function ChoiceDialog({
  choices,
  active,
  choose,
  close,
}: {
  choices: Choice[];
  active: string;
  choose: (id: string) => void;
  close: () => void;
}) {
  return (
    <Dialog title="Choisir une préparation" close={close}>
      <div className="cook-menu">
        {choices.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={active === v.id}
            onClick={() => {
              choose(v.id);
              close();
            }}
          >
            <DishImage src={v.image} />
            <span>
              <small>
                {v.session ? 'Session · ' : ''}
                {labelDate(v.day)}
              </small>
              <strong>{v.title}</strong>
            </span>
            {active === v.id && <Check size={16} />}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
function instruction(text: string) {
  return (
    text
      .replace(
        /^Veillez à bien respecter les quantités indiquées à gauche pour préparer votre recette\s*!\s*/i,
        '',
      )
      .trim() || text
  );
}
function Method({ ui, tasks, group }: { ui: UI; tasks: Tasks; group?: Session }) {
  const [focus, setFocus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  if (!tasks.length)
    return (
      <Empty title="Aucune étape disponible">
        {group
          ? 'Cette session ne contient pas d’étapes à suivre.'
          : 'Cette préparation ne contient pas d’instructions.'}
      </Empty>
    );
  const done = (t: Tasks[number]) => t.p.ticks.includes(t.n);
  const current =
    tasks.find((t) => t.key === focus) ?? tasks.find((t) => !done(t)) ?? tasks[tasks.length - 1];
  const index = tasks.indexOf(current),
    completed = tasks.filter(done).length;
  async function tick(checked: boolean) {
    if (
      await ui.run(
        { action: 'tick', id: current.p.id, index: current.n, checked },
        checked ? 'Étape terminée.' : 'Étape rouverte.',
      )
    ) {
      const next = tasks
        .slice(index + 1)
        .concat(tasks.slice(0, index))
        .find((t) => !done(t));
      setFocus(checked && next ? next.key : current.key);
    }
  }
  function move(i: number, j: number) {
    if (!group) return;
    const order = tasks.map((t) => t.key);
    [order[i], order[j]] = [order[j], order[i]];
    void ui.run({ action: 'session', data: { ...group, order } }, 'Ordre des tâches enregistré.');
  }
  return (
    <section className="cook-method" aria-label="Étapes de préparation">
      <div className="cook-step-heading">
        <h3 ref={heading} tabIndex={-1}>
          Étape {index + 1} <span>sur {tasks.length}</span>
        </h3>
        {tasks.length > 1 && (
          <div className="cook-arrows">
            <button
              className="icon"
              type="button"
              aria-label="Étape précédente"
              disabled={index === 0}
              onClick={() => setFocus(tasks[index - 1].key)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon"
              type="button"
              aria-label="Étape suivante"
              disabled={index === tasks.length - 1}
              onClick={() => setFocus(tasks[index + 1].key)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      {group && (
        <strong className="cook-step-recipe">
          {current.p.snapshot.title} · étape {current.n + 1}
        </strong>
      )}
      <p className="cook-instruction">{instruction(current.step.text)}</p>
      {current.step.image && (
        <details className="cook-step-photo" key={current.key}>
          <summary>Photo de l’étape</summary>
          <Photo src={current.step.image} title={'Illustration de l’étape ' + (current.n + 1)} />
        </details>
      )}
      <label className="cook-tick">
        <input
          aria-label={'Terminer étape ' + (current.n + 1)}
          type="checkbox"
          checked={done(current)}
          onChange={(e) => void tick(e.target.checked)}
        />
        {done(current) ? 'Étape terminée' : 'Marquer comme faite'}
      </label>
      {tasks.length > 1 && (
        <details className="cook-outline">
          <summary>
            <List size={16} />
            Toutes les étapes{' '}
            <small>
              {completed}/{tasks.length} faites
            </small>
            <ChevronDown size={15} />
          </summary>
          <ol>
            {tasks.map((t, i) => (
              <li key={t.key}>
                <button
                  type="button"
                  className="cook-jump"
                  aria-current={t.key === current.key ? 'step' : undefined}
                  onClick={(e) => {
                    setFocus(t.key);
                    const outline = e.currentTarget.closest('details');
                    if (outline) outline.open = false;
                    heading.current?.focus();
                  }}
                >
                  <span className="cook-number">
                    {done(t) ? <Check aria-label="Terminée" size={14} /> : i + 1}
                  </span>
                  <span>
                    {group && <small>{t.p.snapshot.title}</small>}
                    {instruction(t.step.text)}
                  </span>
                </button>
                {group && (
                  <div className="cook-arrows">
                    <button
                      type="button"
                      className="icon"
                      aria-label="Monter la tâche"
                      disabled={!i || tasks[i - 1].p.id === t.p.id}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon"
                      aria-label="Descendre la tâche"
                      disabled={i === tasks.length - 1 || tasks[i + 1].p.id === t.p.id}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function IngredientList({ p }: { p: Prep }) {
  return (
    <>
      {!p.snapshot.base && (
        <p className="warn">Confirme les portions de référence pour adapter les quantités.</p>
      )}
      <dl className="cook-quantities">
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
      {!!p.snapshot.equipment.length && (
        <details className="cook-utensils">
          <summary>Ustensiles</summary>
          <p>{p.snapshot.equipment.join(', ')}</p>
        </details>
      )}
    </>
  );
}
function Ingredients({ chosen, group, ui }: { chosen: Prep[]; group?: Session; ui: UI }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const screen = window.matchMedia('(min-width: 900px)');
    const fit = () => {
      if (disclosure.current) disclosure.current.open = screen.matches;
    };
    fit();
    screen.addEventListener('change', fit);
    return () => screen.removeEventListener('change', fit);
  }, []);
  const shared = group ? commonMeasures(chosen) : [];
  return (
    <div className="cook-reference">
      <details ref={disclosure} className="cook-pantry">
        <summary>
          <h3>Ingrédients</h3>
          <small>
            {group
              ? chosen.length + ' plat' + (chosen.length > 1 ? 's' : '')
              : chosen[0]?.snapshot.ingredients.length}
          </small>
          <ChevronDown size={16} />
        </summary>
        {group
          ? chosen.map((p) => (
              <details key={p.id} className="cook-subrecipe">
                <summary>
                  {p.snapshot.title} <small>{p.servings} portions</small>
                </summary>
                <IngredientList p={p} />
              </details>
            ))
          : chosen[0] && <IngredientList p={chosen[0]} />}
        {!chosen.length && <p>Aucun plat dans cette session.</p>}
      </details>
      {group && (
        <details className="cook-weights">
          <summary>
            Pesées communes{' '}
            <small>
              {shared.filter((v) => group.weighed?.includes(v.key)).length}/{shared.length}
            </small>
            <ChevronDown size={16} />
          </summary>
          {!shared.length && <p>Aucune quantité commune à peser.</p>}
          {shared.map((v) => (
            <label key={v.key}>
              <input
                type="checkbox"
                checked={group.weighed?.includes(v.key) ?? false}
                onChange={(e) => {
                  const weighed = (group.weighed ?? []).filter((k) => k !== v.key);
                  if (e.target.checked) weighed.push(v.key);
                  void ui.run({ action: 'session', data: { ...group, weighed } });
                }}
              />
              <span>
                {v.name} · {quantity(v.total)} {v.unit}
                <small>
                  {v.parts.map((x) => x.title + ' · ' + quantity(x.q) + ' ' + v.unit).join(' / ')}
                </small>
              </span>
            </label>
          ))}
        </details>
      )}
    </div>
  );
}
function FinishButton({ p, ui }: { p: Prep; ui: UI }) {
  return (
    <button
      type="button"
      className="primary"
      onClick={() =>
        ui.run(
          { action: 'finish', id: p.id, done: !p.done },
          p.done ? 'Préparation rouverte.' : 'Portions disponibles dans le planning.',
        )
      }
    >
      <Check size={15} />
      {p.done ? 'Rouvrir la préparation' : 'Terminer la préparation'}
    </button>
  );
}
function Portions({ ui, chosen }: { ui: UI; chosen: Prep[] }) {
  const meals = chosen.flatMap((p) =>
    ui.s.meals.filter((m) => m.prepId === p.id).map((m) => ({ p, m, warning: storageAlert(p, m) })),
  );
  const warnings = meals.filter((x) => x.warning).length;
  return (
    <footer className="cook-portions">
      <details className="cook-storage">
        <summary>
          Portions et conservation{' '}
          {warnings > 0 && (
            <small className="warn">
              {warnings} alerte{warnings > 1 ? 's' : ''}
            </small>
          )}
          <ChevronDown size={16} />
        </summary>
        {meals.map(({ p, m, warning }) => (
          <div key={m.id} className="cook-meal">
            <span>
              {chosen.length > 1 && <strong>{p.snapshot.title}</strong>}
              {labelDate(m.day)} · {m.slot === 'midi' ? 'Déjeuner' : 'Dîner'} · {m.servings} portion
              {m.servings > 1 ? 's' : ''}
              {m.frozen ? ' · Congélation prévue' : ''}
              {warning && <small className="warn">{warning}</small>}
            </span>
            <button
              type="button"
              className="tiny"
              onClick={() => ui.open(<MealForm ui={ui} day={m.day} slot={m.slot} meal={m} />)}
            >
              Ajuster
            </button>
          </div>
        ))}
        <p>
          Répartissez en petites boîtes fermées et réfrigérez dans les deux heures. Gardez la zone
          froide à 4 °C et consommez les plats maison dans les trois jours. Pour un repas plus
          tardif, prévoyez la congélation dès la préparation si le plat s’y prête.
        </p>
        <a
          className="text-link"
          href="https://www.anses.fr/fr/actualite/eviter-toxi-infections-alimentaires-confinement-bonnes-pratiques"
          target="_blank"
          rel="noreferrer"
        >
          Recommandations de l’Anses ↗
        </a>
      </details>
      {chosen.length === 1 ? (
        <FinishButton ui={ui} p={chosen[0]} />
      ) : (
        chosen.length > 1 && (
          <details className="cook-finish-list">
            <summary>
              Terminer les préparations{' '}
              <small>
                {chosen.filter((p) => p.done).length}/{chosen.length}
              </small>
              <ChevronDown size={16} />
            </summary>
            {chosen.map((p) => (
              <div key={p.id} className="cook-meal">
                <span>{p.snapshot.title}</span>
                <FinishButton ui={ui} p={p} />
              </div>
            ))}
          </details>
        )
      )}
    </footer>
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
  const preps = ui.s.preps
    .filter((p) => inWeek(p.day, ui.w))
    .sort((a, b) => a.day.localeCompare(b.day));
  const groups = ui.s.sessions.filter((g) => inWeek(g.day, ui.w));
  const choices: Choice[] = [
    ...groups.map((g) => ({ id: g.id, title: g.name, day: g.day, image: '', session: true })),
    ...preps.map((p) => ({
      id: p.id,
      title: p.snapshot.title,
      day: p.day,
      image: p.snapshot.image,
      session: false,
    })),
  ];
  const preferred = groups[0]?.id ?? preps.find((p) => !p.done)?.id ?? preps[0]?.id;
  const [selected, setSelected] = useState(initialSession || preferred);
  const [awake, setAwake] = useState(false);
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
  const active = choices.find((c) => c.id === selected) ?? choices.find((c) => c.id === preferred);
  const index = active ? choices.indexOf(active) : 0;
  const group = groups.find((g) => g.id === active?.id);
  const chosen = group
    ? ui.s.preps.filter((p) => p.session === group.id)
    : preps.filter((p) => p.id === active?.id);
  const tasks = group
    ? sessionTasks(ui.s, group.id)
    : chosen.flatMap((p) =>
        p.snapshot.steps.map((step, n) => ({ p, step, n, key: p.id + ':' + n })),
      );
  const total =
    chosen.length && chosen.every((p) => duration(p.snapshot) !== null)
      ? chosen.reduce((sum, p) => sum + duration(p.snapshot)!, 0)
      : null;
  const prepTime =
    group && chosen.length && chosen.every((p) => p.snapshot.prep !== null)
      ? chosen.reduce((sum, p) => sum + p.snapshot.prep!, 0)
      : null;
  return (
    <div className="cook-view">
      <header className="page-heading">
        <h1>En cuisine</h1>
        <WeekNav ui={ui} />
      </header>
      {!active ? (
        <Empty title="Aucune préparation cette semaine">
          <Link href={'/semaine?week=' + ui.w}>Planifier un repas →</Link>
        </Empty>
      ) : (
        <>
          <section className="cook-dish" aria-label="Préparation sélectionnée">
            <DishImage src={active.image} />
            <div className="cook-dish-name">
              <h2>{active.title}</h2>
              <p>
                {labelDate(active.day, { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
                {group
                  ? 'Session de ' + chosen.length + ' plat' + (chosen.length > 1 ? 's' : '')
                  : chosen[0].servings + ' portion' + (chosen[0].servings > 1 ? 's' : '')}
                {total !== null && ' · ' + total + ' min' + (group ? ' en séquence' : '')}
                {prepTime !== null && ' · ' + prepTime + ' min actives'}
              </p>
            </div>
            {choices.length > 1 && (
              <div className="cook-switch">
                <button
                  type="button"
                  className="icon"
                  aria-label="Préparation précédente"
                  onClick={() =>
                    setSelected(choices[(index - 1 + choices.length) % choices.length].id)
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    ui.open(
                      <ChoiceDialog
                        active={active.id}
                        choices={choices}
                        choose={setSelected}
                        close={ui.close}
                      />,
                    )
                  }
                >
                  Changer de plat
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label="Préparation suivante"
                  onClick={() => setSelected(choices[(index + 1) % choices.length].id)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            )}
          </section>
          <div className="cook-layout">
            <Ingredients key={active.id} chosen={chosen} group={group} ui={ui} />
            <div className="cook-main">
              <Method key={active.id} tasks={tasks} group={group} ui={ui} />
              <div className="cook-tools" hidden={!tasks.length}>
                <TimerBox />
                <label>
                  <input
                    type="checkbox"
                    checked={awake}
                    onChange={(e) => setAwake(e.target.checked)}
                  />{' '}
                  Garder l’écran allumé
                </label>
              </div>
              <Portions chosen={chosen} ui={ui} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
