'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, Empty, Photo, api, type UI } from './common';
import { duration, type Recipe } from '@/lib/model';
import { fold } from '@/lib/grocery-names';
import { sourceUrl } from '@/lib/source-url';
import { discoveryTitle, type Discovery } from '@/lib/recipe-sources';
import initial from '@/lib/discovery-seed.json';

let recent: { until: number; request: Promise<Discovery[]> } | undefined;
function liveDiscoveries() {
  if (!recent || recent.until < Date.now()) {
    const request = fetch('/api/discoveries', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw Error('Flux indisponible');
        return (await res.json()) as Discovery[];
      })
      .catch(() => {
        recent = undefined;
        return [];
      });
    recent = { until: Date.now() + 3600000, request };
  }
  return recent.request;
}
export function useDiscoveries({ s, w }: UI) {
  const [live, setLive] = useState<Discovery[]>([]);
  useEffect(() => {
    let active = true;
    liveDiscoveries().then((rows) => {
      if (active) setLive(rows);
    });
    return () => {
      active = false;
    };
  }, []);
  return useMemo(() => {
    const urls = new Set(s.recipes.map((r) => sourceUrl(r.data.url)));
    const titles = new Set(s.recipes.map((r) => fold(discoveryTitle(r.data.title))));
    const sites = new Map<string, Discovery[]>();
    for (const item of [...live, ...initial]) {
      const url = sourceUrl(item.url),
        title = fold(item.title);
      if (urls.has(url) || titles.has(title)) continue;
      urls.add(url);
      titles.add(title);
      const group = sites.get(item.publisher) ?? [];
      group.push(item);
      sites.set(item.publisher, group);
    }
    const week = Math.floor(Date.parse(w) / 604800000);
    const groups = [...sites.values()].map((group) => {
      const start = week % group.length;
      return [...group.slice(start), ...group.slice(0, start)];
    });
    const cards: Discovery[] = [];
    for (let i = 0; groups.some((g) => g.length > i); i++)
      for (const group of groups) if (group[i]) cards.push(group[i]);
    return cards;
  }, [live, s.recipes, w]);
}
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
  const cards = useDiscoveries(ui);
  const [limit, setLimit] = useState(12);
  return (
    <>
      {cards.length === 0 && <Empty title="Toutes ces suggestions sont déjà dans ton carnet" />}
      <div className="cards discovery-cards">
        {cards.slice(0, limit).map((item) => (
          <DiscoveryCard key={item.url} ui={ui} item={item} />
        ))}
      </div>
      {cards.length > limit && (
        <button className="more" onClick={() => setLimit((n) => n + 12)}>
          Afficher davantage
        </button>
      )}
    </>
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
