'use client';
import { RecipeFilterFields, RecipeToolbar } from './recipe-toolbar';
import { DiscoveryShelf } from './discoveries';
import { discoveryCourse, type Course } from '@/lib/discovery-course';
import { RecipePrice } from './recipe-price';
import { recipeCost } from '@/lib/market';
import { AutoPlanButton } from './auto-plan';
import { difficulties, recipeDiet } from '@/lib/recipe-diet';
import { importSites } from '@/lib/recipe-sources';
import { useState } from 'react';
import { Heart, Clock3, Plus, Link2, CalendarPlus, ArrowRight } from 'lucide-react';
import {
  blankRecipe,
  problems,
  duration,
  categories,
  type Recipe,
  type RecipeRow,
  type State,
} from '@/lib/model';
import { sourceUrl } from '@/lib/source-url';
import { batchMeals } from '@/lib/planner';
import { clean, amount, rounded } from '@/lib/ingredients';
import { labelDate, today, inWeek, monday, addDays } from '@/lib/dates';
import {
  PageTabs,
  usePageTab,
  Field,
  Form,
  Photo,
  Dialog,
  Empty,
  api,
  str,
  num,
  quantity,
  type UI,
} from './common';
export function RecipeCard({ row, ui }: { row: RecipeRow; ui: UI }) {
  const r = row.data;
  return (
    <article className="recipe-card">
      <button
        className="card-image"
        onClick={() => ui.open(<RecipeDetail row={row} ui={ui} />)}
        aria-label={'Ouvrir ' + r.title}
      >
        <Photo src={r.image} title={r.title} />
      </button>
      <button
        className={'heart ' + (r.favorite ? 'marked' : '')}
        onClick={() =>
          ui.run({ action: 'recipe', id: row.id, data: { ...r, favorite: !r.favorite } })
        }
        aria-label={'Favori · ' + r.title}
        aria-pressed={r.favorite}
      >
        <Heart size={17} fill={r.favorite ? 'currentColor' : 'none'} />
      </button>
      <div className="card-copy">
        <div className="card-meta">
          <Clock3 size={14} />
          {duration(r) === null ? 'Durée inconnue' : duration(r) + ' min'}
          <span>·</span>
          {r.difficulty || 'Niveau inconnu'}
          {r.diet && ' · ' + r.diet}
        </div>
        <button className="card-title" onClick={() => ui.open(<RecipeDetail row={row} ui={ui} />)}>
          {r.title}
        </button>
        <div className="card-foot">
          <RecipePrice cost={recipeCost(r)} />
          <button
            disabled={row.archived || !r.steps.length || !r.ingredients.length}
            className="icon"
            aria-label={'Planifier ' + r.title}
            onClick={() => ui.open(<PlanForm ui={ui} id={row.id} />)}
          >
            <CalendarPlus size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
export function RecipePicker({
  ui,
  selected,
  setSelected,
  current,
}: {
  ui: UI;
  selected: string;
  setSelected: (id: string) => void;
  current?: RecipeRow;
}) {
  const active = ui.s.recipes
    .filter(
      (r) =>
        r.id === current?.id || (!r.archived && r.data.ingredients.length && r.data.steps.length),
    )
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(12);
  const fold = (v: string) => clean(v).normalize('NFD').replace(/\p{M}/gu, '');
  const choices = active.filter((r) =>
    fold(r.data.title + ' ' + r.data.ingredients.map((i) => i.name).join(' ')).includes(
      fold(query),
    ),
  );
  const row = active.find((r) => r.id === selected);
  return (
    <>
      <input name="recipe" type="hidden" value={selected} />
      {row ? (
        <div className="picker-selected">
          <Photo src={row.data.image} />
          <div>
            <strong>{row.data.title}</strong>
            {duration(row.data) !== null && <small>{duration(row.data)} min</small>}
          </div>
          <button type="button" onClick={() => setSelected('')}>
            Changer
          </button>
        </div>
      ) : (
        <section className="picker" aria-label="Choix de la recette">
          <Field label="Rechercher un plat ou un ingrédient">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(12);
              }}
            />
          </Field>
          <div className="picker-results">
            {choices.slice(0, limit).map((r) => (
              <button
                type="button"
                className="picker-choice"
                key={r.id}
                onClick={() => setSelected(r.id)}
              >
                <Photo src={r.data.image} />
                <span>
                  <strong>{r.data.title}</strong>
                  {duration(r.data) !== null && <small>{duration(r.data)} min</small>}
                </span>
              </button>
            ))}
            {choices.length > limit && (
              <button type="button" onClick={() => setLimit(limit + 12)}>
                Afficher davantage
              </button>
            )}
          </div>
          {!choices.length && (
            <p role="status">
              {active.length
                ? 'Aucun plat ne correspond à la recherche.'
                : 'Ajoutez une recette avec ses ingrédients et ses étapes pour planifier un repas.'}
            </p>
          )}
        </section>
      )}
    </>
  );
}
export function PlanForm({
  ui,
  id,
  day,
  slot = 'soir',
  editing,
  alternative,
  initialPortions,
  initialBatch,
}: {
  ui: UI;
  id?: string;
  day?: string;
  slot?: 'soir' | 'midi';
  editing?: State['meals'][number];
  alternative?: React.ReactNode;
  initialPortions?: number;
  initialBatch?: boolean;
}) {
  const [planDay, setPlanDay] = useState(day ?? (inWeek(today(), ui.w) ? today() : ui.w));
  const [planSlot, setPlanSlot] = useState(slot);
  const occupied = ui.s.meals.find((m) => m.day === planDay && m.slot === planSlot);
  const nextLunch = ui.s.meals.find(
    (m) => m.day === addDays(planDay || ui.w, 1) && m.slot === 'midi',
  );
  const [selected, setSelected] = useState(id ?? '');
  const row = ui.s.recipes.find((r) => r.id === selected);
  const [batch, setBatch] = useState(initialBatch ?? (!!id && !!row?.data.batch && !editing));
  const [servings, setServings] = useState(
    String(initialPortions ?? (batch ? 4 : ui.s.prefs.portions)),
  );
  const [perMeal, setPerMeal] = useState('1');
  const portionCount = Number(servings),
    perMealCount = Number(perMeal);
  const validBatch =
    Number.isInteger(portionCount) &&
    portionCount >= 1 &&
    portionCount <= 100 &&
    Number.isInteger(perMealCount) &&
    perMealCount >= 1 &&
    perMealCount <= portionCount;
  const allocation =
    batch && planDay && validBatch ? batchMeals(planDay, planSlot, portionCount, perMealCount) : [];
  const [pending, setPending] = useState<Extract<
    import('@/lib/commands').Command,
    { action: 'plan' }
  > | null>(null);
  const duo = !batch && planSlot === 'soir' && Number(servings) > 1;
  const conflicts = batch
    ? ui.s.meals.filter((m) => allocation.some((a) => a.day === m.day && a.slot === m.slot))
    : [occupied, duo ? nextLunch : undefined].filter((m) => !!m);
  const locked = conflicts.some((m) => m.consumed);
  async function save(cmd: NonNullable<typeof pending>) {
    if (await ui.run(cmd, 'Repas planifiés.')) {
      ui.setW(monday(cmd.day));
      ui.close();
    } else setPending(null);
  }
  return (
    <Dialog
      title={
        pending
          ? 'Remplacer les repas prévus ?'
          : editing
            ? 'Modifier le repas'
            : 'Planifier une préparation'
      }
      close={() => (pending ? setPending(null) : ui.close())}
    >
      {pending && (
        <div className="confirm-meals">
          {conflicts.map((m) => (
            <p key={m.id}>
              <strong>
                {labelDate(m.day)} · {m.slot === 'midi' ? 'Déjeuner' : 'Dîner'}
              </strong>
              <br />
              {ui.s.preps.find((p) => p.id === m.prepId)?.snapshot.title ??
                'Repas à l’extérieur'} → {row?.data.title}
            </p>
          ))}
          <div className="actions">
            <button autoFocus onClick={() => setPending(null)}>
              Annuler
            </button>
            <button className="primary" onClick={() => save(pending)}>
              Oui, remplacer
            </button>
          </div>
        </div>
      )}
      <div hidden={!!pending}>
        {editing && (
          <p>
            {labelDate(editing.day)} · {editing.slot === 'soir' ? 'Dîner' : 'Déjeuner'} ·{' '}
            {ui.s.preps.find((p) => p.id === editing.prepId)?.snapshot.title ??
              'Repas à l’extérieur'}
          </p>
        )}
        <Form
          button="Ajouter au planning"
          disabled={!row || locked || (batch && !validBatch)}
          onSave={async (f) => {
            const cmd: NonNullable<typeof pending> = {
              action: 'plan',
              id: selected,
              day: planDay,
              slot: planSlot,
              servings: Number(servings),
              leftovers: duo,
              replaceMeal: batch ? undefined : occupied?.id,
              batchPerMeal: batch ? perMealCount : undefined,
              batchReplacements: batch ? conflicts.map((m) => m.id) : undefined,
              previewRevision: conflicts.length ? ui.s.revision : undefined,
              replaceLunch: duo ? nextLunch?.id : undefined,
              confirmedBase: num(f, 'confirmedBase') ?? undefined,
            };
            if (conflicts.length) setPending(cmd);
            else await save(cmd);
          }}
        >
          <RecipePicker ui={ui} selected={selected} setSelected={setSelected} />
          <Field label="Organisation des repas">
            <select
              value={batch ? 'batch' : 'simple'}
              onChange={(e) => {
                const active = e.target.value === 'batch';
                setBatch(active);
                if (active && Number(servings) < 4) setServings('4');
              }}
            >
              <option value="simple">Repas habituel</option>
              <option value="batch">Batch cooking · cuisiner une fois</option>
            </select>
          </Field>
          {row && row.data.base === null && (
            <div className="notice">
              <Field label="Portions correspondant aux quantités de la fiche">
                <input
                  key={selected}
                  name="confirmedBase"
                  required={batch}
                  type="number"
                  min="1"
                  max="100"
                  placeholder="À confirmer si connues"
                />
              </Field>
              <small>
                Cette valeur sert à calculer les courses. Sans elle, les quantités restent à
                préciser.
              </small>
            </div>
          )}
          <div className="columns">
            <Field label="Jour">
              <input
                name="day"
                type="date"
                required
                disabled={!!editing}
                value={planDay}
                onChange={(e) => setPlanDay(e.target.value)}
              />
            </Field>
            <Field label="Repas">
              <select
                name="slot"
                disabled={!!editing}
                value={planSlot}
                onChange={(e) => setPlanSlot(e.target.value as typeof slot)}
              >
                <option value="soir">Dîner</option>
                <option value="midi">Déjeuner</option>
              </select>
            </Field>
            <Field label="Portions à préparer">
              <input
                name="servings"
                type="number"
                min="1"
                max="100"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                required
              />
            </Field>
          </div>
          {batch && (
            <>
              <Field label="Portions par repas">
                <input
                  type="number"
                  min="1"
                  max={portionCount || 100}
                  required
                  value={perMeal}
                  onChange={(e) => setPerMeal(e.target.value)}
                />
              </Field>
              {!!allocation.length && (
                <section className="batch-allocation">
                  <h3>Une préparation, {allocation.length} repas</h3>
                  <ul>
                    {allocation.map((m, i) => (
                      <li key={m.day}>
                        {labelDate(m.day)} · {m.slot === 'soir' ? 'dîner' : 'déjeuner'} ·{' '}
                        {m.servings} portion{m.servings > 1 ? 's' : ''}
                        {i >= 3 && ' · à congeler dès la préparation'}
                      </li>
                    ))}
                  </ul>
                  <small>Ce plat sera classé dans le filtre Batch cooking du carnet.</small>
                </section>
              )}
              {row?.data.base && validBatch ? (
                <details>
                  <summary>Ingrédients pour {portionCount} portions</summary>
                  <ScaledIngredients recipe={row.data} portions={portionCount} />
                </details>
              ) : null}
            </>
          )}
          {duo && planDay && (
            <small>
              Une portion au dîner et une au déjeuner du {labelDate(addDays(planDay, 1))}.
            </small>
          )}
          {locked && <p>Ce créneau contient un repas déjà consommé.</p>}
        </Form>
        {alternative}
      </div>
    </Dialog>
  );
}
const catalogTabs = [
  ['carnet', 'Mon carnet'],
  ['suggestions', 'Suggestions'],
] as const;
export function Catalog({ ui }: { ui: UI }) {
  const section = usePageTab(catalogTabs);
  const [search, setSearch] = useState(''),
    [tab, setTab] = useState('Toutes'),
    [sort, setSort] = useState('Nom'),
    [filters, setFilters] = useState({
      course: '' as Course | '',
      minutes: 0,
      diet: '',
      cuisine: '',
      ingredient: '',
      difficulty: '',
      publisher: '',
    }),
    [made, setMade] = useState(false),
    [batch, setBatch] = useState(false),
    [limit, setLimit] = useState(24);
  const { course, minutes, diet, cuisine, ingredient, difficulty, publisher } = filters;
  const last = (id: string) =>
    ui.s.preps
      .filter((p) => p.recipeId === id && p.done)
      .map((p) => p.day)
      .sort()
      .at(-1) ?? '';
  const list = ui.s.recipes
    .filter(
      (r) =>
        r.archived === (tab === 'Archives') &&
        (tab !== 'Favoris' || r.data.favorite) &&
        (tab !== 'À vérifier' || !r.data.verified || problems(r.data).length) &&
        clean([r.data.title, r.data.description, ...r.data.tags].join(' ')).includes(
          clean(search),
        ) &&
        (!course || discoveryCourse(r.data.title, r.data.tags) === course) &&
        (!minutes || (duration(r.data) ?? Infinity) <= minutes) &&
        (!diet || recipeDiet(r.data) === diet) &&
        (!publisher || r.data.source === publisher) &&
        clean(r.data.cuisine).includes(clean(cuisine)) &&
        (!ingredient ||
          r.data.ingredients.some((i) => clean(i.name).includes(clean(ingredient)))) &&
        (!difficulty || r.data.difficulty === difficulty) &&
        (!batch || r.data.batch) &&
        (!made || last(r.id)),
    )
    .sort(
      (a, b) =>
        (sort === 'Durée'
          ? (duration(a.data) ?? Infinity) - (duration(b.data) ?? Infinity)
          : sort === 'Préférence'
            ? b.data.rating - a.data.rating
            : sort === 'Dernière préparation'
              ? last(b.id).localeCompare(last(a.id))
              : 0) || a.data.title.localeCompare(b.data.title),
    );
  return (
    <>
      <header className="page-heading">
        <h1>Mon carnet de recettes</h1>
        <div className="actions">
          <AutoPlanButton ui={ui} />
          <button onClick={() => ui.open(<UrlImport ui={ui} />)}>
            <Link2 size={16} /> Importer une URL
          </button>
          <button className="primary" onClick={() => ui.open(<RecipeEditor ui={ui} />)}>
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </header>
      <div className="catalog-sections">
        <PageTabs options={catalogTabs} active={section} />
      </div>
      {section === 'suggestions' ? (
        <DiscoveryShelf ui={ui} />
      ) : (
        <>
          <RecipeToolbar
            query={search}
            onSearch={setSearch}
            sort={sort}
            onSort={setSort}
            sorts={['Nom', 'Durée', 'Préférence', 'Dernière préparation'].map(
              (x) => [x, x] as const,
            )}
          >
            <RecipeFilterFields
              allCourses
              values={filters}
              change={(patch) => setFilters((f) => ({ ...f, ...patch }))}
              sources={[...new Set(ui.s.recipes.map((r) => r.data.source).filter(Boolean))].sort()}
              levels={[
                ...new Set([
                  ...difficulties,
                  ...ui.s.recipes.map((r) => r.data.difficulty).filter(Boolean),
                ]),
              ]}
            />
            <div className="recipe-filter-checks">
              <label>
                <input
                  type="checkbox"
                  checked={batch}
                  onChange={(e) => setBatch(e.target.checked)}
                />
                Batch cooking
              </label>
              <label>
                <input type="checkbox" checked={made} onChange={(e) => setMade(e.target.checked)} />
                Déjà réalisées
              </label>
            </div>
          </RecipeToolbar>
          <div className="section-heading">
            <div className="tabs" role="group" aria-label="Classement du carnet">
              {['Toutes', 'Favoris', 'À vérifier', 'Archives'].map((label) => (
                <button
                  key={label}
                  aria-pressed={tab === label}
                  className={tab === label ? 'selected' : ''}
                  onClick={() => setTab(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <small>{list.length} recettes</small>
          </div>
          <div className="cards">
            {list.slice(0, limit).map((r) => (
              <RecipeCard row={r} key={r.id} ui={ui} />
            ))}
          </div>
          {!list.length && <Empty title="Aucune recette dans cette sélection" />}
          {list.length > limit && (
            <button className="more" onClick={() => setLimit(limit + 24)}>
              Afficher davantage
            </button>
          )}
        </>
      )}
    </>
  );
}
function UrlImport({ ui }: { ui: UI }) {
  const [error, setError] = useState('');
  return (
    <Dialog title="Importer une recette" close={ui.close}>
      <Form
        button="Prévisualiser la recette"
        onSave={async (f) => {
          try {
            const v = await api('url', { url: str(f, 'url') });
            const existing = ui.s.recipes.find(
              (r) => r.data.url && sourceUrl(r.data.url) === sourceUrl(v.data.url),
            );
            if (existing) {
              setError('Cette recette figure déjà dans le carnet : ' + existing.data.title);
              return;
            }
            if (!v.data.ingredients.length || !v.data.steps.length || !v.data.base) {
              setError(
                v.warning ||
                  'La source ne fournit pas les ingrédients, les étapes ou le nombre de portions. La recette n’a pas été ajoutée.',
              );
              return;
            }
            ui.open(
              <RecipeEditor
                ui={ui}
                draft={v.data}
                warning={
                  v.warning || 'Vérifiez les ingrédients et les portions avant de sauvegarder.'
                }
              />,
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Field label="Adresse de la recette">
          <input autoFocus name="url" type="url" placeholder="https://…" required />
        </Field>
        <details className="import-sites">
          <summary>Sites compatibles ({importSites.length} vérifiés)</summary>
          <p>
            Ouvre un exemple pour chaque site. D’autres sites peuvent fonctionner si la fiche publie
            les portions, les ingrédients et les étapes.
          </p>
          <ul>
            {importSites.map((site) => (
              <li key={site.name}>
                <a href={site.example} target="_blank" rel="noreferrer">
                  {site.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
        {error && <p role="alert">{error}</p>}
      </Form>
    </Dialog>
  );
}
function ScaledIngredients({ recipe, portions }: { recipe: Recipe; portions: number | null }) {
  return recipe.ingredients.map((i, n) => (
    <div className="row" key={n}>
      <span>{i.name}</span>
      <b>
        {i.unit === 'selon le goût'
          ? 'Selon le goût'
          : [
              quantity(
                i.quantity !== null && recipe.base && portions
                  ? rounded((i.quantity * portions) / recipe.base)
                  : i.quantity,
              ),
              i.unit,
            ].join(' ')}
      </b>
    </div>
  ));
}

export function RecipeDetail({ row, ui }: { row: RecipeRow; ui: UI }) {
  const r = row.data;
  const [portions, setPortions] = useState(
    String(r.base ? (r.batch ? Math.max(4, r.base) : r.base) : ''),
  );
  const count = Number(portions);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 100;
  return (
    <Dialog title={r.title} close={ui.close}>
      <Photo src={r.image} className="detail-photo" />
      <div className="tags">
        {[
          r.difficulty,
          r.diet,
          r.cuisine,
          ...r.tags,
          duration(r) !== null ? duration(r) + ' min' : 'Durée inconnue',
        ]
          .filter(Boolean)
          .map((s, i) => (
            <span key={i}>{s}</span>
          ))}
      </div>
      <p>{r.description}</p>
      {(!r.base || validCount) && (
        <RecipePrice cost={recipeCost(r)} servings={validCount ? count : null} />
      )}
      <div className="actions">
        <button
          disabled={row.archived || !r.ingredients.length || !r.steps.length}
          className="primary"
          onClick={() =>
            ui.open(
              <PlanForm ui={ui} id={row.id} initialPortions={validCount ? count : undefined} />,
            )
          }
        >
          Planifier <ArrowRight size={16} />
        </button>
        <button onClick={() => ui.open(<RecipeEditor ui={ui} row={row} />)}>Modifier</button>
        <button
          onClick={() =>
            ui.open(
              <RecipeEditor ui={ui} draft={{ ...r, title: r.title + ' (copie)' }} duplicate />,
            )
          }
        >
          Dupliquer
        </button>
      </div>
      <h3>Ingrédients</h3>
      <p className="hint">
        {r.verified ? 'Vérifiés' : 'À vérifier'} ·{' '}
        {problems(r).join(' · ') || 'Données renseignées'}
      </p>
      {r.base && (
        <Field label="Portions pour les ingrédients">
          <input
            type="number"
            min="1"
            max="100"
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
          />
        </Field>
      )}
      {!r.base || validCount ? (
        <ScaledIngredients recipe={r} portions={validCount ? count : null} />
      ) : (
        <p>Choisis entre 1 et 100 portions.</p>
      )}
      <h3>Préparation</h3>
      {r.steps.map((x, i) => (
        <div key={i} className="step">
          <b>{i + 1}</b>
          <div>
            {x.text}
            {x.image && <Photo src={x.image} className="step-photo" />}
          </div>
        </div>
      ))}
      <p>
        {r.prep !== null ? 'Préparation ' + r.prep + ' min · ' : ''}
        {r.cook !== null ? 'Cuisson ' + r.cook + ' min' : ''}
      </p>
      <p>Nutrition · {r.nutrition || 'Inconnue'}</p>
      <p>
        Notes · {r.notes || 'Aucune'} · Évaluation {r.rating || '—'}/5
      </p>
      <p>
        Source · {r.source || 'Personnelle'}{' '}
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer">
            Ouvrir l’original ↗
          </a>
        )}
      </p>
      <small>{r.rights}</small>
      <h3>Historique de préparation</h3>
      <p>
        {ui.s.preps
          .filter((p) => p.recipeId === row.id && p.done)
          .map((p) => labelDate(p.day))
          .join(' · ') || 'Aucune préparation terminée.'}
      </p>
      {row.original && (
        <details>
          <summary>Fiche source conservée</summary>
          <pre>{row.original}</pre>
        </details>
      )}
      <div className="actions">
        <button
          onClick={async () => {
            if (await ui.run({ action: 'archive', id: row.id, archived: !row.archived }))
              ui.close();
          }}
        >
          {row.archived ? 'Restaurer' : 'Archiver'}
        </button>
        {row.archived && (
          <button
            className="danger"
            onClick={async () => {
              if (
                confirm('Supprimer définitivement cette recette et ses versions ?') &&
                (await ui.run({ action: 'deleteRecipe', id: row.id, confirm: true }))
              )
                ui.close();
            }}
          >
            Supprimer définitivement
          </button>
        )}
      </div>
    </Dialog>
  );
}
export function RecipeEditor({
  ui,
  row,
  draft,
  warning,
  duplicate,
}: {
  ui: UI;
  row?: RecipeRow;
  draft?: Recipe;
  warning?: string;
  duplicate?: boolean;
}) {
  const r = row?.data ?? draft ?? { ...blankRecipe(), title: '', base: ui.s.prefs.portions };
  const [image, setImage] = useState(r.image),
    [ingredients, setIngredients] = useState(
      r.ingredients.map((i) => ({ ...i, q: i.quantity?.toString() ?? '' })),
    ),
    [steps, setSteps] = useState(r.steps),
    [error, setError] = useState('');
  return (
    <Dialog
      title={row ? 'Modifier la recette' : draft ? 'Vérifier la recette' : 'Nouvelle recette'}
      close={ui.close}
    >
      {warning && <p className="notice">{warning}</p>}
      <Form
        onSave={async (f) => {
          try {
            const data = {
              ...r,
              title: str(f, 'title'),
              description: str(f, 'description'),
              image,
              base: num(f, 'base'),
              prep: num(f, 'prep'),
              cook: num(f, 'cook'),
              total: num(f, 'total'),
              ingredients: ingredients.map((i) => {
                const q = amount(i.q);
                if (i.q.trim() && q === null) throw Error('Quantité invalide pour ' + i.name);
                return { ...i, quantity: q };
              }),
              steps,
              favorite: f.has('favorite'),
              verified: f.has('verified'),
              batch: f.has('batch'),
              diet: str(f, 'diet'),
              difficulty: str(f, 'difficulty'),
              rating: num(f, 'rating') ?? 0,
              cuisine: str(f, 'cuisine'),
              tags: str(f, 'tags')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              equipment: str(f, 'equipment')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              notes: str(f, 'notes'),
              source: str(f, 'source'),
              url: str(f, 'url'),
              nutrition: str(f, 'nutrition'),
              rights: str(f, 'rights'),
            };
            if (
              await ui.run({
                action: 'recipe',
                id: row?.id,
                data,
                sourceKey: duplicate ? 'copy:' + crypto.randomUUID() : undefined,
              })
            )
              ui.close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Field label="Titre">
          <input name="title" defaultValue={r.title} required autoFocus maxLength={300} />
        </Field>
        <Field label="Description">
          <textarea name="description" defaultValue={r.description} />
        </Field>
        <div className="columns">
          {[
            ['base', 'Portions de référence', r.base],
            ['total', 'Durée totale (min)', r.total],
            ['prep', 'Préparation (min)', r.prep],
            ['cook', 'Cuisson (min)', r.cook],
          ].map(([k, n, v]) => (
            <Field key={k} label={String(n)}>
              <input
                type="number"
                min={k === 'base' ? 1 : 0}
                name={String(k)}
                defaultValue={v ?? ''}
                placeholder="Inconnu"
              />
            </Field>
          ))}
        </div>
        <Field label="Photo (URL ou fichier)">
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
        </Field>
        <input
          aria-label="Téléverser une photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file)
              try {
                setImage((await api('media', file, true)).url);
              } catch (err) {
                setError((err as Error).message);
              }
          }}
        />
        <h3>Ingrédients</h3>
        {ingredients.map((x, i) => (
          <div className="ingredient-edit" key={i}>
            <input
              aria-label={'Ingrédient ' + (i + 1)}
              placeholder="Ingrédient"
              title={x.raw || x.name}
              required
              value={x.name}
              onChange={(e) =>
                setIngredients(
                  ingredients.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)),
                )
              }
            />
            <input
              aria-label="Quantité"
              placeholder="Qté"
              value={x.q}
              onChange={(e) =>
                setIngredients(
                  ingredients.map((v, j) => (j === i ? { ...v, q: e.target.value } : v)),
                )
              }
            />
            <input
              aria-label="Unité"
              placeholder="Unité"
              value={x.unit}
              onChange={(e) =>
                setIngredients(
                  ingredients.map((v, j) => (j === i ? { ...v, unit: e.target.value } : v)),
                )
              }
            />
            <select
              aria-label="Rayon"
              value={x.category}
              onChange={(e) =>
                setIngredients(
                  ingredients.map((v, j) =>
                    j === i ? { ...v, category: e.target.value as typeof x.category } : v,
                  ),
                )
              }
            >
              {categories.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Retirer l’ingrédient"
              onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setIngredients([
              ...ingredients,
              { name: '', raw: '', q: '', quantity: null, unit: '', category: 'Autres' },
            ])
          }
        >
          + Ingrédient
        </button>
        <h3>Étapes de cuisine</h3>
        {steps.map((x, i) => (
          <div className="panel" key={i}>
            <Field label={'Étape ' + (i + 1)}>
              <textarea
                value={x.text}
                required
                onChange={(e) =>
                  setSteps(steps.map((v, j) => (j === i ? { ...v, text: e.target.value } : v)))
                }
              />
            </Field>
            <input
              aria-label="Photo de l’étape (URL)"
              placeholder="Adresse de la photo"
              value={x.image}
              onChange={(e) =>
                setSteps(steps.map((v, j) => (j === i ? { ...v, image: e.target.value } : v)))
              }
            />
            <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
              Retirer l’étape
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setSteps([...steps, { text: '', image: '' }])}>
          + Étape
        </button>
        <details open={!!draft}>
          <summary>Classement, source et notes</summary>
          <div className="columns">
            {[
              ['difficulty', 'Difficulté', r.difficulty],
              ['cuisine', 'Cuisine', r.cuisine],
              ['tags', 'Étiquettes (virgules)', r.tags.join(', ')],
              ['equipment', 'Équipements (virgules)', r.equipment.join(', ')],
              ['source', 'Source', r.source],
              ['url', 'URL originale', r.url],
              ['rights', 'Droits', r.rights],
              ['nutrition', 'Nutrition', r.nutrition],
              ['notes', 'Notes personnelles', r.notes],
            ].map(([k, l, v]) => (
              <Field label={l} key={k}>
                <input name={k} defaultValue={v} />
              </Field>
            ))}
            <Field label="Alimentation">
              <select name="diet" defaultValue={r.diet}>
                <option value="">Inconnue</option>
                {['Viande', 'Poisson', 'Végétarien'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Évaluation sur 5">
              <input name="rating" type="number" min="0" max="5" defaultValue={r.rating} />
            </Field>
          </div>
        </details>
        <div className="checks">
          {[
            ['favorite', 'Favori', r.favorite],
            ['batch', 'Adaptée au batch cooking', r.batch],
            ['verified', 'Ingrédients vérifiés', r.verified],
          ].map(([k, l, v]) => (
            <label key={String(k)}>
              <input type="checkbox" name={String(k)} defaultChecked={!!v} /> {l}
            </label>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
      </Form>
    </Dialog>
  );
}
