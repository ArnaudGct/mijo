'use client';
import { useEffect, useState } from 'react';
import { Dialog, Empty, Photo, api, type UI } from './common';
import { duration, type Recipe } from '@/lib/model';
import { discoveryTitle, type Discovery } from '@/lib/recipe-sources';

import { defaults, type DiscoveryFilters } from '@/lib/discovery-taste';
import { courses, courseLabels } from '@/lib/discovery-course';
import { useDiscoveries } from './use-discovery';
import { EyeOff } from 'lucide-react';
export function DiscoveryPreview({ ui, item }: { ui: UI; item: Discovery }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api('url', { url: item.url })
      .then(({ data, warning }: { data: Recipe; warning: string }) => {
        if (!active) return;
        if (!data.base || !data.ingredients.length || !data.steps.length)
          throw Error(
            warning || 'Les portions, les ingrédients ou les étapes manquent sur cette fiche.',
          );
        setRecipe(data);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [item.url, attempt]);
  return (
    <Dialog title={item.title} close={ui.close}>
      <Photo src={item.image} className="detail-photo" />
      <div className="discovery-source">
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.publisher} ↗
        </a>
        {recipe && (
          <span>
            {recipe.base} portions
            {duration(recipe) !== null ? ' · ' + duration(recipe) + ' min' : ''}
          </span>
        )}
      </div>
      <button
        className="discovery-skip"
        onClick={async () => {
          if (await ui.run({ action: 'dismissDiscovery', url: item.url }, 'Suggestion écartée.'))
            ui.close();
        }}
      >
        Écarter cette suggestion
      </button>
      {recipe ? (
        <>
          <button
            className="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              if (
                await ui.run(
                  { action: 'recipe', data: { ...recipe, title: discoveryTitle(recipe.title) } },
                  'Recette ajoutée au carnet.',
                )
              )
                ui.close();
              else setSaving(false);
            }}
          >
            Ajouter à mon carnet
          </button>
          <h3>Ingrédients</h3>
          <ul className="discovery-ingredients">
            {recipe.ingredients.map((i, n) => (
              <li key={n}>{i.raw || i.name}</li>
            ))}
          </ul>
          <h3>Préparation</h3>
          <ol className="discovery-steps">
            {recipe.steps.map((step, n) => (
              <li key={n}>{step.text}</li>
            ))}
          </ol>
        </>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
          <button
            onClick={() => {
              setError('');
              setAttempt((n) => n + 1);
            }}
          >
            Réessayer
          </button>
        </>
      ) : (
        <p role="status">Lecture de la recette…</p>
      )}
    </Dialog>
  );
}
export function DiscoveryShelf({ ui }: { ui: UI }) {
  const [filters, setFilters] = useState<DiscoveryFilters>(defaults),
    [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(
      () =>
        setFilters((old) => (old.query === query.trim() ? old : { ...old, query: query.trim() })),
      350,
    );
    return () => clearTimeout(t);
  }, [query]);
  const feed = useDiscoveries(ui, filters);
  return (
    <>
      <div className="tabs discovery-courses" role="group" aria-label="Type de recette">
        {courses.map((course) => (
          <button
            key={course}
            aria-pressed={filters.course === course}
            className={filters.course === course ? 'selected' : ''}
            onClick={() => setFilters((old) => ({ ...old, course }))}
          >
            {courseLabels[course]}
          </button>
        ))}
      </div>
      <div className="discovery-filters">
        <label>
          Recette ou ingrédient
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="Poulet, risotto…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Durée
          <select
            value={filters.minutes}
            onChange={(e) => setFilters({ ...filters, minutes: Number(e.target.value) })}
          >
            <option value={0}>Toutes les durées</option>
            {[20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n} min maximum
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select
            value={filters.publisher}
            onChange={(e) => setFilters({ ...filters, publisher: e.target.value })}
          >
            <option value="">Toutes les sources</option>
            {['Marmiton', 'CuisineAZ', 'Jow', '750g'].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Sélection
          <select
            value={filters.order}
            onChange={(e) =>
              setFilters({ ...filters, order: e.target.value as DiscoveryFilters['order'] })
            }
          >
            <option value="affinity">Pour moi</option>
            <option value="explore">Explorer</option>
            <option value="quick">Durée des résultats</option>
          </select>
        </label>
      </div>
      <div className="cards discovery-cards">
        {feed.cards.map((item) => (
          <DiscoveryCard key={item.url} item={item} ui={ui} />
        ))}
      </div>
      {!feed.cards.length && !feed.loading && !feed.error && (
        <Empty title="Aucune recette dans cette sélection" />
      )}
      <MoreDiscoveries feed={feed} />
    </>
  );
}
export function MoreDiscoveries({ feed }: { feed: ReturnType<typeof useDiscoveries> }) {
  if (feed.error)
    return (
      <div className="discovery-more" role="status">
        Les sources sont momentanément indisponibles.{' '}
        <button onClick={feed.retry}>Réessayer</button>
      </div>
    );
  if (!feed.hasMore) return null;
  return (
    <button className="more" disabled={feed.loading} onClick={feed.more}>
      {feed.loading ? 'Recherche de recettes…' : 'Afficher plus de recettes'}
    </button>
  );
}
export function DiscoveryCard({ ui, item }: { ui: UI; item: Discovery }) {
  return (
    <article className="recipe-card">
      <button
        className="card-image"
        aria-label={'Voir ' + item.title}
        onClick={() => ui.open(<DiscoveryPreview ui={ui} item={item} />)}
      >
        <Photo src={item.image} />
      </button>
      <button
        className="heart"
        aria-label={'Écarter ' + item.title}
        title="Écarter cette suggestion"
        onClick={() => ui.run({ action: 'dismissDiscovery', url: item.url }, 'Suggestion écartée.')}
      >
        <EyeOff size={17} />
      </button>
      <div className="card-copy">
        <div className="card-meta">
          {item.publisher}
          {item.minutes !== null && ' · ' + item.minutes + ' min'}
        </div>
        <button
          className="card-title"
          onClick={() => ui.open(<DiscoveryPreview ui={ui} item={item} />)}
        >
          {item.title}
        </button>
      </div>
    </article>
  );
}
