'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dialog, Empty, Photo, api, type UI } from './common';
import { duration, type Recipe } from '@/lib/model';
import { discoveryTitle, type Discovery } from '@/lib/recipe-sources';

import { defaults, type DiscoveryFilters } from '@/lib/discovery-taste';
import { useDiscoveries } from './use-discovery';
import { difficulties } from '@/lib/recipe-diet';
import { RecipeFilterFields, RecipeToolbar } from './recipe-toolbar';
import { discoveryPublishers } from '@/lib/recipe-sources';
import { EyeOff } from 'lucide-react';
import { RecipePrice } from './recipe-price';
import { recipeCost } from '@/lib/market';
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
        {recipe && duration(recipe) !== null && <span>{duration(recipe)} min</span>}
      </div>
      <RecipePrice cost={recipe ? recipeCost(recipe) : item.cost} />
      <div className="actions recipe-actions">
        <button
          onClick={async () => {
            if (await ui.run({ action: 'dismissDiscovery', url: item.url }, 'Suggestion écartée.'))
              ui.close();
          }}
        >
          Écarter cette suggestion
        </button>
        {recipe && (
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
        )}
      </div>
      {recipe ? (
        <>
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
  const batchRequested = useSearchParams().get('batch') === '1';
  const [filters, setFilters] = useState<DiscoveryFilters>({ ...defaults, batch: batchRequested }),
    [fields, setFields] = useState({ query: '', ingredient: '', cuisine: '' });
  useEffect(() => {
    const t = setTimeout(
      () =>
        setFilters((old) => ({
          ...old,
          query: fields.query.trim(),
          ingredient: fields.ingredient.trim(),
          cuisine: fields.cuisine.trim(),
        })),
      350,
    );
    return () => clearTimeout(t);
  }, [fields]);
  const feed = useDiscoveries(ui, filters);
  return (
    <>
      <RecipeToolbar
        initiallyExpanded={batchRequested}
        query={fields.query}
        onSearch={(query) => setFields({ ...fields, query })}
        maxLength={100}
        sort={filters.order}
        onSort={(order) => setFilters({ ...filters, order })}
        sorts={[
          ['name', 'Nom'],
          ['quick', 'Durée'],
          ['affinity', 'Préférence'],
          ['explore', 'Explorer'],
        ]}
      >
        <RecipeFilterFields
          values={{ ...filters, ...fields }}
          levels={difficulties}
          sources={discoveryPublishers}
          change={({ cuisine, ingredient, ...immediate }) => {
            if (cuisine !== undefined || ingredient !== undefined)
              setFields((f) => ({
                ...f,
                cuisine: cuisine ?? f.cuisine,
                ingredient: ingredient ?? f.ingredient,
              }));
            else setFilters((f) => ({ ...f, ...immediate }));
          }}
        />
        <div className="recipe-filter-checks">
          <label>
            <input
              type="checkbox"
              checked={filters.batch}
              onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.checked }))}
            />
            Batch cooking
          </label>
        </div>
      </RecipeToolbar>
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
        <div className="card-foot">
          <RecipePrice cost={item.cost} />
        </div>
      </div>
    </article>
  );
}
