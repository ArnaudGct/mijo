'use client';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import { Feedback, Brand, WeekNav, Photo, Field, Form, str, api, type UI } from './common';
import { DiscoveryCard, DiscoveryPreview, useDiscoveries } from './discoveries';
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
  { p: 'parametres', n: 'Paramètres', i: Settings },
];
export function Login() {
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <main className="login">
      <div className="login-art">
        <img
          src="/cuisine.jpg"
          alt="Légumes frais et ingrédients disposés sur un plan de travail"
        />
        <div className="login-caption">
          <h1>Table de saison.</h1>
        </div>
      </div>
      <div className="login-form">
        <Brand />
        <div>
          <h2>Mon carnet de cuisine</h2>
          <Form
            button="Ouvrir mon carnet"
            onSave={async (f) => {
              try {
                await api('login', { password: str(f, 'password') });
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Mot de passe">
              <input type="password" name="password" autoComplete="current-password" required />
            </Field>
          </Form>
          <p role="alert">{error}</p>
        </div>
      </div>
    </main>
  );
}
export function Workspace({ initial, children }: { initial: State; children: ReactNode }) {
  const view = usePathname().replace(/^\/|\/$/g, '');
  const query = useSearchParams();
  const requested = date.safeParse(query.get('week'));
  const w = monday(requested.success ? requested.data : today());
  const initialSession = query.get('session') ?? '';
  const [s, setS] = useState(initial),
    [dialog, setDialog] = useState<ReactNode>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    latest = useRef(s);
  const router = useRouter();
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  const setW = (d: string) => {
    const u = new URL(location.href);
    u.searchParams.set('week', d);
    history.replaceState(null, '', u);
  };
  async function reload() {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 401) router.refresh();
      throw Error('Actualisation impossible.');
    }
    const data = (await res.json()) as State;
    if (data.revision < latest.current.revision) return;
    latest.current = data;
    setS(data);
  }
  const hasRecipes = s.recipes.some(
    (r) => !r.archived && r.data.base && r.data.steps.length && r.data.ingredients.length,
  );
  const generated = s.prefs.generatedWeeks.includes(w);
  useEffect(() => {
    if (!hasRecipes || generated || w < monday(today())) return;
    let current = true;
    api('week', { week: w })
      .then(() => {
        if (current) return reload();
      })
      .catch((e: Error) => {
        if (current) setNotice(e.message);
      });
    return () => {
      current = false;
    };
    // reload reads the current database and uses stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRecipes, generated, w]);
  const ui: UI = {
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
  const weekLink = (p: string) => '/' + p + '?week=' + w;
  const current = nav.find((n) => n.p === view);
  if (!current) return children;
  return (
    <div className="app-shell">
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
          <div className="avatar">A</div>
          <div>
            <b>Arnaud</b>
            <small>Carnet personnel</small>
          </div>
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
  const discoveries = useDiscoveries(ui);
  const slides = discoveries.slice(0, 10);
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
  const cart = marketBasket(s, w);
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
        aria-label="Recettes à découvrir"
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
          <Link className="stat" href={'/' + k.p + '?week=' + w} key={k.n}>
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
        <h2>Suggestions de recettes</h2>
        <Link className="text-link" href={'/recettes?week=' + w + '&onglet=suggestions'}>
          Tout voir <ArrowRight size={16} />
        </Link>
      </div>
      <div className="cards">
        {(discoveries.length > 10 ? discoveries.slice(10, 13) : discoveries.slice(0, 3)).map(
          (item) => (
            <DiscoveryCard key={item.url} ui={ui} item={item} />
          ),
        )}
      </div>
      {!discoveries.length && <p>Toutes ces suggestions sont déjà dans ton carnet.</p>}
    </>
  );
}
