'use client';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutGrid,
  BookOpen,
  CalendarDays,
  ShoppingBasket,
  ChefHat,
  Settings,
  ArrowRight,
  Clock3,
  UtensilsCrossed,
  LogOut,
  Leaf,
  Check,
  ChevronRight,
  ChevronLeft,
  Pause,
  Play,
} from 'lucide-react';
import { type State, date } from '@/lib/model';
import { today, monday, labelDate, inWeek, money } from '@/lib/dates';
import { marketBasket } from '@/lib/market';
import { Feedback, Brand, WeekNav, Photo, api, useInteractive, type UI } from './common';
import { DiscoveryCard, DiscoveryPreview, MoreDiscoveries } from './discoveries';
import { RecipePrice } from './recipe-price';
import { useDiscoveries } from './use-discovery';
import { Catalog, RecipeEditor } from './recipes';
import { MealCalendar, Planner } from './weekly';
import { Cooking } from './cooking';
import { Shopping, Preferences } from './supplies';
const nav = [
  { p: '', n: 'Accueil', i: LayoutGrid },
  { p: 'recettes', n: 'Recettes', i: BookOpen },
  { p: 'semaine', n: 'Ma semaine', i: CalendarDays },
  { p: 'courses', n: 'Courses', i: ShoppingBasket },
  { p: 'cuisiner', n: 'Cuisiner', i: ChefHat },
];
export function Workspace({
  account,
  initial,
  children,
}: {
  account: { id: string; email: string };
  initial: State;
  children: ReactNode;
}) {
  const interactive = useInteractive();
  useEffect(() => {
    const checkAccount = () => {
      if (!document.cookie.split('; ').includes('mijo_notebook=' + account.id)) location.reload();
    };
    const checkVisible = () => {
      if (!document.hidden) checkAccount();
    };
    window.addEventListener('pageshow', checkAccount);
    window.addEventListener('focus', checkAccount);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
      window.removeEventListener('pageshow', checkAccount);
      window.removeEventListener('focus', checkAccount);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, [account.id]);
  const view = usePathname().replace(/^\/|\/$/g, '');
  const query = useSearchParams();
  const requested = date.safeParse(query.get('week'));
  const initialSession = query.get('session') ?? '';
  const [s, setS] = useState(initial),
    [dialog, setDialog] = useState<ReactNode>(null),
    [message, setMessage] = useState<{ text: string } | null>(null),
    [busy, setBusy] = useState(false);
  const w = monday(requested.success ? requested.data : today());
  const lock = useRef(false),
    latest = useRef(s);
  const notice = message?.text ?? '';
  const setNotice = (text: string) => setMessage(text ? { text } : null);
  useEffect(() => {
    if (!message || dialog) return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message, dialog]);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  const setW = (d: string) => {
    const u = new URL(location.href);
    u.searchParams.set('week', d);
    history.replaceState(null, '', u);
  };
  async function reload() {
    const res = await fetch('/api/state', {
      cache: 'no-store',
      headers: { 'X-Mijo-Account': account.id },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 409) window.location.reload();
      throw Error('Actualisation impossible.');
    }
    const data = (await res.json()) as State;
    if (data.revision < latest.current.revision) return;
    latest.current = data;
    setS(data);
  }
  const ui: UI = {
    accountId: account.id,
    s,
    w,
    setW,
    reload,
    open: (v) => {
      setNotice('');
      setDialog(v);
    },
    close: () => setDialog(null),
    notify: setNotice,
    run: async (cmd, msg = 'Enregistré') => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      try {
        const result = await api('command', { revision: latest.current.revision, command: cmd });
        await reload();
        setNotice(
          result.addedMeals === undefined
            ? msg
            : result.addedMeals
              ? result.addedMeals +
                ' repas ajouté' +
                (result.addedMeals > 1 ? 's' : '') +
                ' au planning.'
              : 'Aucun repas à ajouter avec les recettes et les préférences actuelles.',
        );
        return true;
      } catch (e) {
        setNotice((e as Error).message);
        if ((e as Error).message.includes('autre appareil')) setDialog(null);
        await reload().catch(() => {});
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
  const weekLink = (p: string) =>
    '/' + p + (p !== 'courses' && requested.success ? '?week=' + w : '');
  const current = view === 'parametres' ? { n: 'Paramètres' } : nav.find((n) => n.p === view);
  if (!current) return children;
  return (
    <div className="app-shell" data-notebook={account.id} inert={!interactive}>
      <aside>
        <Link className="brand-link" href={weekLink('')}>
          <Brand />
        </Link>
        <nav aria-label="Navigation principale">
          {nav.map((n) => (
            <Link
              key={n.p}
              className={n.p === view ? 'active' : ''}
              aria-current={n.p === view ? 'page' : undefined}
              href={weekLink(n.p)}
            >
              <n.i size={19} />
              {n.n}
            </Link>
          ))}
        </nav>
        <div className="side-end">
          <div className="avatar">{account.email[0].toUpperCase()}</div>
          <div>
            <b title={account.email}>{account.email}</b>
            <small>Carnet personnel</small>
          </div>
          <Link
            className="icon"
            href={weekLink('parametres')}
            aria-label="Paramètres"
            title="Paramètres"
            aria-current={view === 'parametres' ? 'page' : undefined}
          >
            <Settings size={18} />
          </Link>
          <button
            className="icon"
            aria-label="Se déconnecter"
            onClick={async () => {
              try {
                await api('logout', {});
                localStorage.removeItem('table-offline');
                window.location.reload();
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="workspace" aria-busy={busy}>
        <div className="topline">
          <span>
            <Leaf size={14} /> Mon carnet <ChevronRight size={12} /> {current.n}
          </span>
          <span>{labelDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        {view === '' ? (
          <Home ui={ui} />
        ) : view === 'recettes' ? (
          <Catalog ui={ui} />
        ) : view === 'semaine' ? (
          <Planner key={w} ui={ui} />
        ) : view === 'courses' ? (
          <Shopping ui={ui} />
        ) : view === 'cuisiner' ? (
          <Cooking key={w + initialSession} ui={ui} initialSession={initialSession} />
        ) : (
          <Preferences ui={ui} />
        )}
      </main>
      <Feedback.Provider value={notice}>{dialog}</Feedback.Provider>
      {notice && !dialog && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button onClick={() => setNotice('')} aria-label="Masquer le message">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Home({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const feed = useDiscoveries(ui);
  const discoveries = feed.cards;
  const [shown, setShown] = useState(3);
  const slides = discoveries.slice(0, Math.min(10, Math.max(1, discoveries.length - 3)));
  const shelfStart = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPaused(motion.matches);
    sync();
    motion.addEventListener('change', sync);
    return () => motion.removeEventListener('change', sync);
  }, []);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = slides.length;
  const activeIndex = count ? index % count : 0;
  const feature = slides[activeIndex];
  useEffect(() => {
    if (count < 2 || paused || interacting || focused) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    function schedule() {
      clearInterval(timer);
      if (!document.hidden && !document.querySelector('[role="dialog"], dialog[open]')) {
        timer = setInterval(() => {
          if (!document.querySelector('[role="dialog"], dialog[open]'))
            setIndex((i) => (i + 1) % count);
        }, 5000);
      }
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [count, paused, interacting, focused]);
  const meals = s.meals.filter((m) => inWeek(m.day, w));
  const cart = marketBasket(s, s.prefs.shoppingList!.id);
  const openRecipe = () => {
    if (feature) ui.open(<DiscoveryPreview ui={ui} item={feature} />);
    else ui.open(<RecipeEditor ui={ui} />);
  };
  return (
    <>
      <header className="page-heading">
        <h1>Mon tableau de bord</h1>
        <WeekNav ui={ui} />
      </header>
      <section
        className="hero"
        aria-label="Plats à découvrir"
        aria-roledescription="carrousel"
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <div className="hero-copy">
          <h2>{feature?.title ?? 'Ma cuisine de la semaine'}</h2>
          {feature && (
            <p className="inline">
              {feature.publisher}
              {feature.minutes !== null && (
                <>
                  <span>·</span>
                  <Clock3 size={16} />
                  {feature.minutes} min
                </>
              )}
            </p>
          )}
          {feature && <RecipePrice cost={feature.cost} />}
          <button className="on-green" onClick={openRecipe}>
            {feature ? 'Voir la recette' : 'Ajouter une recette'}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="hero-image">
          <Photo
            key={feature?.url}
            src={feature?.image || '/cuisine.jpg'}
            title={feature?.title || ''}
          />
          {count > 1 && (
            <div className="slide-controls">
              <button
                aria-label="Recette précédente"
                onClick={() => setIndex((activeIndex + count - 1) % count)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {activeIndex + 1} / {count}
              </span>
              <button
                aria-label="Recette suivante"
                onClick={() => setIndex((activeIndex + 1) % count)}
              >
                <ChevronRight size={17} />
              </button>
              <button
                className="motion-toggle"
                aria-label={paused ? 'Reprendre le défilement' : 'Suspendre le défilement'}
                onClick={() => {
                  setPaused(!paused);
                  if (paused) {
                    setFocused(false);
                    setInteracting(false);
                  }
                }}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
            </div>
          )}
        </div>
      </section>
      <div className="stats">
        {[
          {
            i: BookOpen,
            n: 'Dîners planifiés',
            v: String(meals.filter((m) => m.slot === 'soir').length) + ' / 7',
            p: 'semaine',
          },
          {
            i: UtensilsCrossed,
            n: 'Portions au menu',
            v: String(meals.reduce((n, m) => n + m.servings, 0)),
            p: 'semaine',
          },
          {
            i: ShoppingBasket,
            n: cart.missing ? 'Sous-total estimé' : 'Panier estimé',
            v: money(cart.cash),
            p: 'courses',
          },
        ].map((k) => (
          <Link
            className="stat"
            href={k.p === 'courses' ? '/courses' : '/' + k.p + '?week=' + w}
            key={k.n}
          >
            <div className="stat-icon">
              <k.i size={20} />
            </div>
            <div>
              <small>{k.n}</small>
              <strong>{k.v}</strong>
            </div>
          </Link>
        ))}
      </div>
      <section className="home-section">
        <div className="section-heading">
          <h2>Au menu cette semaine</h2>
          <Link className="text-link" href={'/semaine?week=' + w}>
            Organiser <ArrowRight size={16} />
          </Link>
        </div>
        <MealCalendar key={w} ui={ui} compact />
      </section>
      <div className="section-heading">
        <h2>Idées de plats</h2>
        <Link className="text-link" href={'/recettes?week=' + w + '&onglet=suggestions'}>
          Tout voir <ArrowRight size={16} />
        </Link>
      </div>
      <div className="cards">
        {discoveries.slice(shelfStart, shelfStart + shown).map((item) => (
          <DiscoveryCard key={item.url} ui={ui} item={item} />
        ))}
      </div>
      {discoveries.length > shelfStart + shown ? (
        <button
          className="more"
          onClick={() => {
            setShown((n) => n + 9);
            if (feed.hasMore && discoveries.length - shelfStart - shown < 9) feed.more();
          }}
        >
          Afficher plus de recettes
        </button>
      ) : (
        <MoreDiscoveries
          feed={{
            ...feed,
            more: () => {
              setShown((n) => n + 9);
              feed.more();
            },
          }}
        />
      )}
      {!discoveries.length && !feed.loading && !feed.error && (
        <p>Aucune autre suggestion pour le moment.</p>
      )}
    </>
  );
}
