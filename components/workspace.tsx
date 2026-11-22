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
  Plus,
} from 'lucide-react';
import { type State, duration, date } from '@/lib/model';
import { today, monday, addDays, labelDate, inWeek, money } from '@/lib/dates';
import { basket } from '@/lib/shopping';
import { Feedback, Brand, WeekNav, Photo, Field, Form, str, api, type UI } from './common';
import { Catalog, RecipeDetail, RecipeCard, RecipeEditor } from './recipes';
import { Planner, Cooking } from './weekly';
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
    latest.current = data;
    setS(data);
  }
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
        await api('command', { revision: latest.current.revision, command: cmd });
        await reload();
        setNotice(msg);
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
  const list = s.recipes.filter((r) => !r.archived);
  const feature = list.find(
    (r) => r.data.image && r.data.steps.length && r.data.ingredients.length,
  );
  const preps = s.preps.filter((p) => inWeek(p.day, w)).sort((a, b) => a.day.localeCompare(b.day));
  const meals = s.meals.filter((m) => inWeek(m.day, w));
  const cart = basket(s, w, s.prefs.shops[0]?.name ?? '');
  const openRecipe = () => {
    if (feature) ui.open(<RecipeDetail ui={ui} row={feature} />);
    else ui.open(<RecipeEditor ui={ui} />);
  };
  return (
    <>
      <header className="page-heading">
        <h1>Mon tableau de bord</h1>
        <WeekNav ui={ui} />
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-label">
            <Leaf size={15} />
            {feature ? 'Dans mon carnet' : 'Bienvenue dans le carnet'}
          </span>
          <h2>{feature?.data.title ?? 'Ma cuisine de la semaine'}</h2>
          {feature && (
            <p className="inline">
              <Clock3 size={16} />
              {duration(feature.data) ?? '—'} min <span>·</span>{' '}
              {feature.data.difficulty || 'Difficulté à préciser'}
            </p>
          )}
          <button className="on-green" onClick={openRecipe}>
            {feature ? 'Voir la recette' : 'Ajouter une recette'}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="hero-image">
          <Photo src={feature?.data.image || '/cuisine.jpg'} title={feature?.data.title || ''} />
        </div>
      </section>
      <div className="stats">
        {[
          {
            i: BookOpen,
            n: 'Recettes sélectionnées',
            v: preps.length + ' / ' + s.prefs.target,
            p: 'semaine',
          },
          {
            i: UtensilsCrossed,
            n: 'Portions prévues',
            v: String(preps.reduce((n, p) => n + p.servings, 0)),
            p: 'semaine',
          },
          {
            i: ShoppingBasket,
            n: cart.complete ? 'Panier prévisionnel' : 'Sous-total chiffré',
            v: cart.complete || cart.known ? money(cart.cash) : 'À chiffrer',
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
      <div className="section-heading">
        <h2>Au menu cette semaine</h2>
        <Link className="text-link" href={'/semaine?week=' + w}>
          Organiser <ArrowRight size={16} />
        </Link>
      </div>
      <div className="weekstrip">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(w, i);
          return (
            <Link
              href={'/semaine?week=' + w + '#jour-' + d}
              key={d}
              className={d === today() ? 'day today' : 'day'}
            >
              <small>{labelDate(d, { weekday: 'short' })}</small>
              <b>{Number(d.slice(-2))}</b>
              <span>
                {meals.filter((m) => m.day === d).length
                  ? meals.filter((m) => m.day === d).length + ' repas'
                  : 'Libre'}
              </span>
            </Link>
          );
        })}
      </div>
      {preps.length > 0 && (
        <section>
          <h2>Prochaines préparations</h2>
          {preps
            .filter((p) => !p.done)
            .map((p) => (
              <Link className="row" key={p.id} href={'/cuisiner?week=' + w + '&session=' + p.id}>
                {p.snapshot.title}
                <small>
                  {labelDate(p.day)} · {p.servings} portions
                </small>
              </Link>
            ))}
        </section>
      )}
      <div className="section-heading">
        <h2>Mon carnet de recettes</h2>
        <Link className="text-link" href={'/recettes?week=' + w}>
          Tout voir <ArrowRight size={16} />
        </Link>
      </div>
      <div className="cards">
        {list
          .filter((r) => r.data.image)
          .slice(0, 3)
          .map((r) => (
            <RecipeCard key={r.id} row={r} ui={ui} />
          ))}
      </div>
      {!list.length && (
        <button onClick={openRecipe}>
          <Plus size={16} /> Ma première recette
        </button>
      )}
    </>
  );
}
