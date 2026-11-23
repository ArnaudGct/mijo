'use client';
import { useEffect, useMemo, useState } from 'react';
import { today } from '@/lib/dates';
import { fold } from '@/lib/grocery-names';
import { defaults, searchWords, tastes, type DiscoveryFilters } from '@/lib/discovery-taste';
import { discoveryTitle, type Discovery } from '@/lib/recipe-sources';
import { sourceUrl } from '@/lib/source-url';
import initial from '@/lib/discovery-seed.json';
import { type UI, api } from './common';

type Page = { cards: Discovery[]; next: number | null; total: number };
const cache = new Map<string, Promise<Page>>();
function load(filters: DiscoveryFilters, taste: string[], day: string, offset: number) {
  const body = { ...filters, taste, day, offset },
    key = JSON.stringify(body);
  let request = cache.get(key);
  if (!request) {
    request = api('discoveries/search', body).catch((e: Error) => {
      cache.delete(key);
      throw e;
    }) as Promise<Page>;
    if (cache.size >= 60) cache.delete(cache.keys().next().value!);
    cache.set(key, request);
  }
  return request;
}
export function useDiscoveries(ui: UI, filters: DiscoveryFilters = defaults) {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const check = () => setDay(today());
    const id = setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, []);
  const taste = useMemo(() => tastes(ui.s), [ui.s]);
  const signature = JSON.stringify([filters, taste, day]);
  const [pages, setPages] = useState<{ key: string; cards: Discovery[]; next: number | null }>({
    key: '',
    cards: [],
    next: 0,
  });
  const [cursor, setCursor] = useState({ key: '', offset: 0, attempt: 0 });
  const [failure, setFailure] = useState('');
  if (cursor.key !== signature) setCursor({ key: signature, offset: 0, attempt: 0 });
  const offset = cursor.key === signature ? cursor.offset : 0;
  useEffect(() => {
    let active = true;
    const [params, terms, date] = JSON.parse(signature) as [DiscoveryFilters, string[], string];
    load(params, terms, date, offset)
      .then((page) => {
        if (active) {
          setFailure('');
          setPages((prev) => ({
            key: signature,
            cards: [...(offset && prev.key === signature ? prev.cards : []), ...page.cards],
            next: page.next,
          }));
        }
      })
      .catch(() => {
        if (active) setFailure(signature + '|' + offset);
      });
    return () => {
      active = false;
    };
  }, [signature, offset, cursor.attempt]);
  const current = pages.key === signature ? pages : null;
  const error = failure === signature + '|' + offset;
  const loading = !error && (!current || (offset !== 0 && current.next === offset));
  const base = useMemo(() => {
    const terms = searchWords(filters.query);
    return initial.filter(
      (c) =>
        (!filters.publisher || filters.publisher === c.publisher) &&
        (!filters.minutes || (c.minutes !== null && c.minutes <= filters.minutes)) &&
        terms.every((t) => searchWords(c.title).includes(t)),
    );
  }, [filters]);
  const cards = useMemo(() => {
    const urls = new Set([
      ...ui.s.recipes.map((r) => sourceUrl(r.data.url)),
      ...ui.s.prefs.dismissedDiscoveries,
    ]);
    const titles = new Set(ui.s.recipes.map((r) => fold(discoveryTitle(r.data.title))));
    const result: Discovery[] = [];
    // Keep live pages in their ranked order. The local selection covers a slow or unavailable connection.
    for (const c of [...(current?.cards ?? []), ...(!current || error ? base : [])]) {
      const url = sourceUrl(c.url),
        title = fold(discoveryTitle(c.title));
      if (urls.has(url) || titles.has(title)) continue;
      result.push(c);
      urls.add(url);
      titles.add(title);
    }
    return filters.order === 'quick'
      ? result.sort(
          (a, b) =>
            (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
            a.title.localeCompare(b.title, 'fr'),
        )
      : result;
  }, [ui.s.recipes, ui.s.prefs.dismissedDiscoveries, current, error, base, filters.order]);
  function more() {
    if (!loading && current?.next != null)
      setCursor({ key: signature, offset: current.next, attempt: 0 });
  }
  function retry() {
    setFailure('');
    setCursor((old) => ({ key: signature, offset, attempt: old.attempt + 1 }));
  }
  return { cards, loading, error, more, retry, hasMore: current ? current.next !== null : true };
}
