'use client';
import { useState } from 'react';
import {
  Heart,
  Clock3,
  SlidersHorizontal,
  Plus,
  Link2,
  Search,
  CalendarPlus,
  ArrowRight,
  UsersRound,
} from 'lucide-react';
import {
  blankRecipe,
  problems,
  duration,
  categories,
  type Recipe,
  type RecipeRow,
} from '@/lib/model';
import { sourceUrl } from '@/lib/source-url';
import { clean, amount } from '@/lib/ingredients';
import { labelDate, today, inWeek, monday } from '@/lib/dates';
import { Field, Form, Photo, Dialog, Empty, api, str, num, quantity, type UI } from './common';
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
        </div>
        <button className="card-title" onClick={() => ui.open(<RecipeDetail row={row} ui={ui} />)}>
          {r.title}
        </button>
        <div className="card-foot">
          <small>
            <UsersRound size={14} />
            {r.base ? r.base + ' portions' : 'Portions à vérifier'}
            {r.diet ? ' · ' + r.diet : ''}
          </small>
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
export function PlanForm({
  ui,
  id,
  day,
  slot = 'soir',
}: {
  ui: UI;
  id?: string;
  day?: string;
  slot?: 'soir' | 'midi';
}) {
  const active = ui.s.recipes
    .filter((r) => !r.archived && r.data.ingredients.length && r.data.steps.length)
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
  const [selected, setSelected] = useState(id ?? '');
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
    <Dialog title="Planifier une préparation" close={ui.close}>
      <Form
        button="Ajouter au planning"
        disabled={!row}
        onSave={async (f) => {
          if (
            await ui.run(
              {
                action: 'plan',
                id: str(f, 'recipe'),
                day: str(f, 'day'),
                servings: Number(f.get('servings')),
                leftovers: f.has('leftovers'),
                confirmedBase: num(f, 'confirmedBase') ?? undefined,
                slot: str(f, 'slot') as typeof slot,
              },
              'Repas planifié pour le ' + labelDate(str(f, 'day')),
            )
          ) {
            ui.setW(monday(str(f, 'day')));
            ui.close();
          }
        }}
      >
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
        {row && row.data.base === null && (
          <div className="notice">
            <Field label="Portions correspondant aux quantités de la fiche">
              <input
                key={selected}
                name="confirmedBase"
                type="number"
                min="1"
                max="100"
                placeholder="À confirmer si connues"
              />
            </Field>
            <small>
              Cette valeur sert à calculer les courses. Sans elle, les quantités restent à préciser.
            </small>
          </div>
        )}
        <div className="columns">
          <Field label="Jour">
            <input
              name="day"
              type="date"
              required
              defaultValue={day ?? (inWeek(today(), ui.w) ? today() : ui.w)}
            />
          </Field>
          <Field label="Repas">
            <select name="slot" defaultValue={slot}>
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
              defaultValue={ui.s.prefs.portions}
              required
            />
          </Field>
        </div>
        <label>
          <input name="leftovers" type="checkbox" defaultChecked={ui.s.prefs.leftovers} /> Réserver
          une portion du dîner pour le déjeuner suivant
        </label>
      </Form>
    </Dialog>
  );
}
export function Catalog({ ui }: { ui: UI }) {
  const [search, setSearch] = useState(''),
    [filters, setFilters] = useState(false),
    [tab, setTab] = useState('Toutes'),
    [sort, setSort] = useState('Nom'),
    [time, setTime] = useState(''),
    [diet, setDiet] = useState(''),
    [cuisine, setCuisine] = useState(''),
    [ingredient, setIngredient] = useState(''),
    [difficulty, setDifficulty] = useState(''),
    [made, setMade] = useState(false),
    [batch, setBatch] = useState(false),
    [limit, setLimit] = useState(24);
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
        (!time || (duration(r.data) ?? Infinity) <= Number(time)) &&
        (!diet || r.data.diet === diet) &&
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
          <button onClick={() => ui.open(<UrlImport ui={ui} />)}>
            <Link2 size={16} /> Importer une URL
          </button>
          <button className="primary" onClick={() => ui.open(<RecipeEditor ui={ui} />)}>
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </header>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Rechercher une recette"
            placeholder="Rechercher une recette…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button aria-expanded={filters} onClick={() => setFilters(!filters)}>
          <SlidersHorizontal size={16} /> Filtres
        </button>
        <select
          aria-label="Tri des recettes"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {['Nom', 'Durée', 'Préférence', 'Dernière préparation'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {filters && (
        <div className="panel filtergrid">
          <Field label="Durée maximale">
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">Toutes</option>
              {[15, 30, 45, 60].map((n) => (
                <option value={n} key={n}>
                  {n} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cuisine">
            <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
          </Field>
          <Field label="Ingrédient">
            <input value={ingredient} onChange={(e) => setIngredient(e.target.value)} />
          </Field>
          <Field label="Alimentation">
            <select value={diet} onChange={(e) => setDiet(e.target.value)}>
              <option value="">Toutes</option>
              {['Viande', 'Poisson', 'Végétarien'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulté">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Toutes</option>
              {[...new Set(ui.s.recipes.map((r) => r.data.difficulty))].filter(Boolean).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <label>
            <input type="checkbox" checked={made} onChange={(e) => setMade(e.target.checked)} />{' '}
            Déjà réalisées
          </label>
          <label>
            <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} />{' '}
            Batch cooking
          </label>
        </div>
      )}
      <div className="section-heading">
        <div className="tabs">
          {['Toutes', 'Favoris', 'À vérifier', 'Archives'].map((t) => (
            <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>
              {t}
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
        <p role="alert">{error}</p>
      </Form>
    </Dialog>
  );
}
export function RecipeDetail({ row, ui }: { row: RecipeRow; ui: UI }) {
  const r = row.data;
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
          r.base ? r.base + ' portions' : 'Portions inconnues',
        ]
          .filter(Boolean)
          .map((s, i) => (
            <span key={i}>{s}</span>
          ))}
      </div>
      <p>{r.description}</p>
      <div className="actions">
        <button
          disabled={row.archived || !r.ingredients.length || !r.steps.length}
          className="primary"
          onClick={() => ui.open(<PlanForm ui={ui} id={row.id} />)}
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
      {r.ingredients.map((i, n) => (
        <div className="row" key={n}>
          <span>{i.name}</span>
          <b>
            {i.unit === 'selon le goût'
              ? 'Selon le goût'
              : [quantity(i.quantity), i.unit].join(' ')}
          </b>
        </div>
      ))}
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
