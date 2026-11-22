'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Download, WifiOff } from 'lucide-react';
import { basket, needs, type Need } from '@/lib/shopping';
import { categories, type State } from '@/lib/model';
import { today, money, inWeek } from '@/lib/dates';
import { Form, Field, Dialog, WeekNav, Empty, quantity, api, str, num, type UI } from './common';
function download(name: string, txt: string) {
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function Article({ ui }: { ui: UI }) {
  return (
    <Dialog title="Article supplémentaire" close={ui.close}>
      <Form
        onSave={async (f) => {
          const id = crypto.randomUUID();
          if (
            await ui.run({
              action: 'item',
              data: {
                id,
                key: 'manuel:' + id,
                week: ui.w,
                name: str(f, 'name'),
                quantity: num(f, 'quantity'),
                unit: str(f, 'unit'),
                category: str(f, 'category') as (typeof categories)[number],
                manual: true,
                checked: false,
                bag: null,
              },
            })
          )
            ui.close();
        }}
      >
        <Fields />
        <Field label="Rayon">
          <select name="category">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </Form>
    </Dialog>
  );
}
function Fields({ v }: { v?: { name: string; quantity: number | null; unit: string } }) {
  return (
    <>
      <Field label="Ingrédient">
        <input name="name" defaultValue={v?.name} required maxLength={300} />
      </Field>
      <div className="columns">
        <Field label="Quantité">
          <input
            name="quantity"
            defaultValue={v?.quantity ?? ''}
            type="number"
            step="any"
            min="0.000001"
          />
        </Field>
        <Field label="Unité">
          <input name="unit" defaultValue={v?.unit} placeholder="g, ml, pièce…" />
        </Field>
      </div>
    </>
  );
}
function StockForm({ ui, v }: { ui: UI; v?: State['stock'][number] }) {
  return (
    <Dialog title="Stock du placard" close={ui.close}>
      <Form
        onSave={async (f) => {
          if (
            await ui.run({
              action: 'stock',
              data: {
                id: v?.id ?? crypto.randomUUID(),
                name: str(f, 'name'),
                quantity: num(f, 'quantity')!,
                unit: str(f, 'unit'),
              },
            })
          )
            ui.close();
        }}
      >
        <Fields v={v} />
      </Form>
      {v && (
        <button
          className="danger"
          onClick={async () => {
            if (await ui.run({ action: 'remove', table: 'stock', id: v.id })) ui.close();
          }}
        >
          Retirer du placard
        </button>
      )}
    </Dialog>
  );
}
function PriceForm({
  ui,
  v,
  shop,
}: {
  ui: UI;
  v?: Partial<State['prices'][number]>;
  shop: string;
}) {
  return (
    <Dialog title="Relever un prix" close={ui.close}>
      <Form
        onSave={async (f) => {
          if (
            await ui.run({
              action: 'price',
              data: {
                id: v?.id ?? crypto.randomUUID(),
                name: str(f, 'name'),
                product: str(f, 'product'),
                shop: str(f, 'shop'),
                quantity: num(f, 'quantity')!,
                unit: str(f, 'unit'),
                weight: num(f, 'weight'),
                cents: num(f, 'price') === null ? null : Math.round(100 * num(f, 'price')!),
                equivalent:
                  num(f, 'equivQty') === null
                    ? null
                    : { quantity: num(f, 'equivQty')!, unit: str(f, 'equivUnit') },
                day: str(f, 'day'),
                source: str(f, 'source'),
                barcode: str(f, 'barcode'),
                estimated: f.has('estimate'),
              },
            })
          )
            ui.close();
        }}
      >
        <Field label="Ingrédient de la liste">
          <input name="name" defaultValue={v?.name} required />
        </Field>
        <Field label="Produit et conditionnement">
          <input
            name="product"
            defaultValue={v?.product}
            placeholder="Nom exact du produit vendu"
            required
          />
        </Field>
        <Field label="Magasin">
          <input name="shop" defaultValue={v?.shop ?? shop} list="shops" required />
          <datalist id="shops">
            {ui.s.prefs.shops.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </datalist>
        </Field>
        <div className="columns">
          {[
            ['quantity', 'Quantité vendue', v?.quantity, '0.000001'],
            ['weight', 'Poids par paquet (g)', v?.weight, '0.000001'],
            ['price', 'Prix TTC (€)', v?.cents != null ? v.cents / 100 : null, '0'],
          ].map(([k, l, d, min]) => (
            <Field key={String(k)} label={String(l)}>
              <input
                name={String(k)}
                type="number"
                min={String(min)}
                step="any"
                defaultValue={d ?? ''}
                required={k === 'quantity'}
              />
            </Field>
          ))}
          <Field label="Unité vendue">
            <input name="unit" defaultValue={v?.unit} required />
          </Field>
        </div>
        <details>
          <summary>Équivalence nette mesurée du conditionnement</summary>
          <small>
            Renseignez par exemple le poids net indiqué sur une brique vendue en cl. Le poids du sac
            peut inclure l’emballage.
          </small>
          <div className="columns">
            <Field label="Quantité nette équivalente">
              <input
                type="number"
                step="any"
                min="0.000001"
                name="equivQty"
                defaultValue={v?.equivalent?.quantity}
              />
            </Field>
            <Field label="Unité équivalente">
              <input name="equivUnit" defaultValue={v?.equivalent?.unit} />
            </Field>
          </div>
        </details>
        <Field label="Date du relevé">
          <input name="day" type="date" defaultValue={v?.day ?? today()} max={today()} required />
        </Field>
        <Field label="Origine du prix">
          <input
            name="source"
            defaultValue={v?.source}
            placeholder="Ticket, rayon, catalogue…"
            required
          />
        </Field>
        <Field label="Code-barres (facultatif)">
          <input name="barcode" defaultValue={v?.barcode} />
        </Field>
        <label>
          <input type="checkbox" name="estimate" defaultChecked={v?.estimated} /> Prix estimé
        </label>
      </Form>
    </Dialog>
  );
}
function FindPrice({ ui, shop }: { ui: UI; shop: string }) {
  const [rows, setRows] = useState<Partial<State['prices'][number]>[] | null>(null),
    [error, setError] = useState('');
  return (
    <Dialog title="Relevés Open Prices à La Rochelle" close={ui.close}>
      <Form
        button="Chercher les relevés"
        onSave={async (f) => {
          try {
            setError('');
            setRows((await api('observations', { barcode: str(f, 'barcode') })).rows);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Field label="Code-barres du produit">
          <input name="barcode" inputMode="numeric" pattern="[0-9]{8,14}" required />
        </Field>
      </Form>
      {error && <p role="alert">{error}</p>}
      {rows?.length === 0 && (
        <p>Aucun prix observé pour ce code-barres dans les magasins recensés à La Rochelle.</p>
      )}
      {rows?.map((r, i) => (
        <div className="row" key={i}>
          <div>
            {r.product}
            <small>
              {r.shop} · {r.day} · {money(r.cents ?? null)}
            </small>
          </div>
          <button onClick={() => ui.open(<PriceForm ui={ui} shop={shop} v={r} />)}>
            Vérifier le conditionnement
          </button>
        </div>
      ))}
    </Dialog>
  );
}
export function Shopping({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const shops = [...new Set([...s.prefs.shops.map((v) => v.name), ...s.prices.map((p) => p.shop)])];
  const [shop, setShop] = useState(shops[0] ?? ''),
    [tab, setTab] = useState('Liste'),
    [third, setThird] = useState(false);
  const cart = basket(s, w, shop),
    { rows, incomplete } = needs(s, w);
  const saveItem = (
    r: Need,
    changes: { bag?: 'Frais' | 'Épicerie' | 'Troisième'; checked?: boolean },
  ) => {
    const saved = s.items.find((i) => i.week === w && i.key === r.key);
    return ui.run({
      action: 'item',
      data: {
        id: saved?.id ?? crypto.randomUUID(),
        key: r.key,
        week: w,
        name: r.name,
        quantity: saved?.quantity ?? null,
        unit: r.unit,
        category: r.category,
        manual: r.manual,
        checked: r.checked,
        bag: saved?.bag ?? null,
        ...changes,
      },
    });
  };
  const line = (r: Need) => cart.lines.find((l) => l.key === r.key);
  async function offline() {
    try {
      const old = JSON.parse(localStorage.getItem('table-offline') || 'null');
      if (old?.rows.some((r: { before: boolean; checked: boolean }) => r.before !== r.checked)) {
        window.location.assign(new URL('courses-hors-ligne.html', window.location.origin));
        return;
      }
      if (!('serviceWorker' in navigator))
        throw Error('Mode hors ligne indisponible dans ce navigateur.');
      await navigator.serviceWorker.ready;
      localStorage.setItem(
        'table-offline',
        JSON.stringify({
          week: w,
          rows: cart.lines.map((r) => ({
            key: r.key,
            name: r.name,
            unit: r.unit,
            quantity: r.buy,
            unknown: r.unknown,
            checked: r.checked,
            before: r.checked,
          })),
        }),
      );
      window.location.assign(new URL('courses-hors-ligne.html', window.location.origin));
    } catch (e) {
      ui.notify((e as Error).message);
    }
  }
  const weeklyPreps = s.preps.filter((p) => inWeek(p.day, w));
  const single = weeklyPreps.length === 1 ? weeklyPreps[0] : null;
  return (
    <>
      <header className="page-heading">
        <h1>Mes courses</h1>
        <WeekNav ui={ui} />
      </header>
      <div className="toolbar wrap">
        <div className="tabs">
          {['Liste', 'Comparateur', 'Mes sacs', 'Placard', 'Relevés'].map((t) => (
            <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <select
          aria-label="Magasin du panier"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
        >
          {shops.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {incomplete.length > 0 && (
        <div className="notice">
          Courses incomplètes · Portions ou ingrédients à préciser pour {incomplete.join(', ')}.
        </div>
      )}
      {tab === 'Liste' && (
        <>
          <div className="section-heading">
            <h2>
              {cart.lines.filter((r) => r.checked).length} / {cart.lines.length} articles cochés
            </h2>
            <button className="primary" onClick={() => ui.open(<Article ui={ui} />)}>
              <Plus size={16} /> Article
            </button>
          </div>
          {single && (
            <p className="list-origin">
              {single.snapshot.title}{' '}
              <span>
                · {single.servings} portion{single.servings > 1 ? 's' : ''}
              </span>
            </p>
          )}
          {categories.map((c) => {
            const group = rows.filter((r) => r.category === c);
            return (
              !!group.length && (
                <section className="panel" key={c}>
                  <h3>{c}</h3>
                  {group.map((r) => (
                    <div className={'grocery ' + (r.checked ? 'done' : '')} key={r.key}>
                      <input
                        type="checkbox"
                        aria-label={'Acheté · ' + r.name}
                        checked={r.checked}
                        onChange={(e) => saveItem(r, { checked: e.target.checked })}
                      />
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {r.unknown
                            ? r.unit === 'selon le goût'
                              ? 'Selon le goût'
                              : 'Quantité à préciser'
                            : quantity(r.buy) + ' ' + r.unit + ' à acheter'}
                          {r.stock > 0 && ' · en stock ' + quantity(r.stock) + ' ' + r.unit}
                        </small>
                        {(r.manual || !single) && (
                          <small>{r.manual ? 'Article manuel' : r.recipes.join(' · ')}</small>
                        )}
                        {line(r)?.best && (
                          <small>
                            {line(r)!.best!.count} × {line(r)!.best!.p.product} ·{' '}
                            {money(line(r)!.best!.cost)} · reste{' '}
                            {quantity(
                              Math.max(0, line(r)!.best!.count * line(r)!.best!.size - r.buy),
                            )}{' '}
                            {r.unit} · {line(r)!.stale ? 'relevé ancien' : 'relevé récent'}
                          </small>
                        )}
                      </div>
                      <button
                        className="tiny"
                        onClick={() =>
                          ui.open(
                            <PriceForm ui={ui} shop={shop} v={{ name: r.name, unit: r.unit }} />,
                          )
                        }
                      >
                        {line(r)?.best
                          ? 'Relever un prix'
                          : r.buy || r.unknown
                            ? 'Prix inconnu'
                            : 'En stock'}
                      </button>
                      {r.manual && (
                        <button
                          className="icon"
                          aria-label="Retirer l’article manuel"
                          onClick={() => {
                            const i = s.items.find((i) => i.week === w && i.key === r.key);
                            if (i) void ui.run({ action: 'remove', table: 'items', id: i.id });
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )
            );
          })}
          {!rows.length && (
            <Empty title="La liste de courses est vide">
              <Link href={'/semaine?week=' + w}>Planifier une recette →</Link>
            </Empty>
          )}
          <div className="actions">
            <button onClick={offline}>
              <WifiOff size={16} /> Emporter hors ligne
            </button>
            <button
              onClick={() =>
                download(
                  'courses-' + w + '.txt',
                  rows
                    .map(
                      (r) =>
                        (r.checked ? '☑' : '☐') +
                        ' ' +
                        r.name +
                        ' · ' +
                        (r.unknown
                          ? r.unit === 'selon le goût'
                            ? 'Selon le goût'
                            : 'À préciser'
                          : quantity(r.buy) + ' ' + r.unit),
                    )
                    .join('\n'),
                )
              }
            >
              <Download size={16} /> Exporter
            </button>
          </div>
        </>
      )}
      {tab === 'Comparateur' && (
        <>
          <div className="panel">
            <h2>Référence HelloFresh</h2>
            <strong className="large-money">{money(s.prefs.hello)}</strong>
            <small>
              {s.prefs.helloMeals ?? '—'} recettes · {s.prefs.helloPortions ?? '—'} portions au
              total
            </small>
          </div>
          {shops.map((name) => {
            const b = basket(s, w, name);
            return (
              <div className="panel" key={name}>
                <div className="split">
                  <h2>{name}</h2>
                  <span className="pill">
                    {b.known}/{b.lines.length} articles chiffrés
                  </span>
                </div>
                <div className="pricegrid">
                  <div>
                    <small>
                      Ingrédients utilisés {b.consumedComplete ? '' : '· part chiffrée'}
                    </small>
                    <b>{money(b.used)}</b>
                  </div>
                  <div>
                    <small>{b.complete ? 'En caisse' : 'Sous-total connu'}</small>
                    <b>{money(b.cash)}</b>
                  </div>
                  <div>
                    <small>Livraison incluse</small>
                    <b>{money(b.delivered)}</b>
                  </div>
                </div>
                <p>
                  Frais de livraison · {money(b.delivery)}.{' '}
                  {b.estimated ? 'Contient des estimations.' : ''} Disponibilité à confirmer auprès
                  du magasin.
                </p>
                {b.comparable && b.servings > 0 ? (
                  <p>
                    Écart magasin − HelloFresh · {money(b.cash - s.prefs.hello)} ·{' '}
                    {money(Math.round(b.cash / b.servings))} par portion.{' '}
                    {b.delivered !== null
                      ? 'Écart livré · ' + money(b.delivered - s.prefs.hello)
                      : ''}
                  </p>
                ) : (
                  <p className="hint">
                    Comparaison directe indisponible · panier complet et mêmes nombres de recettes
                    et de portions requis.
                  </p>
                )}
                <small>
                  Non chiffrés ·{' '}
                  {b.lines
                    .filter((l) => l.best?.cost == null)
                    .map((l) => l.name)
                    .join(', ') || 'Aucun'}
                </small>
                <small>
                  Poids connu à porter ·{' '}
                  {quantity(b.lines.reduce((n, l) => n + (l.weight ?? 0), 0) / 1000)} kg ·{' '}
                  {b.lines.filter((l) => l.weight === null).length} poids inconnus
                </small>
              </div>
            );
          })}
        </>
      )}
      {tab === 'Mes sacs' && (
        <>
          <div className="section-heading">
            <h2>Répartition à pied</h2>
            <button onClick={() => setThird(true)}>Ajouter un troisième sac</button>
          </div>
          {[
            'Frais',
            'Épicerie',
            ...(third || cart.lines.some((l) => l.bag === 'Troisième') ? ['Troisième'] : []),
          ].map((b) => {
            const ls = cart.lines.filter((l) => l.bag === b),
              g = ls.reduce((n, l) => n + (l.weight ?? 0), 0),
              cap = b === 'Frais' ? s.prefs.bagFresh : b === 'Épicerie' ? s.prefs.bagDry : null;
            return (
              <div className="panel" key={b}>
                <h2>Sac {b.toLowerCase()}</h2>
                <p>
                  {quantity(g / 1000)} kg connus {cap ? ' / ' + quantity(cap / 1000) + ' kg' : ''} ·{' '}
                  {ls.filter((l) => l.weight === null).length} poids inconnus{' '}
                  {cap && g > cap ? ' · Capacité dépassée' : ''}
                </p>
                {ls.map((l) => (
                  <div className="row" key={l.key}>
                    <div>
                      {l.name}
                      <small>
                        {l.weight === null ? 'Poids inconnu' : quantity(l.weight) + ' g'}{' '}
                        {l.best ? ' · ' + l.best.count + ' conditionnement(s)' : ''}
                      </small>
                    </div>
                    <select
                      aria-label={'Sac pour ' + l.name}
                      value={b}
                      onChange={(e) => saveItem(l, { bag: e.target.value as 'Frais' })}
                    >
                      {['Frais', 'Épicerie', 'Troisième'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
      {tab === 'Placard' && (
        <div className="panel">
          <div className="split">
            <h2>Stock disponible</h2>
            <button onClick={() => ui.open(<StockForm ui={ui} />)}>+ Ingrédient</button>
          </div>
          {s.stock.map((v) => (
            <div className="row" key={v.id}>
              <b>{v.name}</b>
              <button onClick={() => ui.open(<StockForm ui={ui} v={v} />)}>
                {quantity(v.quantity)} {v.unit} · Modifier
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === 'Relevés' && (
        <div className="panel">
          <div className="split">
            <h2>Prix et conditionnements</h2>
            <button onClick={() => ui.open(<FindPrice ui={ui} shop={shop} />)}>Open Prices</button>
            <button onClick={() => ui.open(<PriceForm ui={ui} shop={shop} />)}>+ Relevé</button>
          </div>
          {s.prices
            .slice()
            .sort((a, b) => b.day.localeCompare(a.day))
            .map((p) => (
              <div className="row" key={p.id}>
                <div>
                  <b>
                    {p.product} · {money(p.cents)}
                  </b>
                  <small>
                    {p.shop} · {quantity(p.quantity)} {p.unit} · {p.day} · {p.source} ·{' '}
                    {p.estimated ? 'Estimation' : 'Observé'} ·{' '}
                    {Date.parse(today()) - Date.parse(p.day) > 30 * 86400000
                      ? 'Plus de 30 jours'
                      : 'Récent'}
                  </small>
                </div>
                <button onClick={() => ui.open(<PriceForm ui={ui} shop={p.shop} v={p} />)}>
                  Modifier
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
export function Preferences({ ui }: { ui: UI }) {
  const p = ui.s.prefs;
  const [shops, setShops] = useState(p.shops),
    [file, setFile] = useState<File | null>(null),
    [report, setReport] = useState<{
      total: number;
      added: number;
      skipped: number;
      withheld: number;
      incomplete: number;
      rows: { title: string; issues: string[] }[];
    } | null>(null);
  const cents = (f: FormData, k: string) =>
    num(f, k) === null ? null : Math.round(num(f, k)! * 100);
  return (
    <>
      <header className="page-heading">
        <h1>Paramètres</h1>
      </header>
      <div className="panel">
        <Form
          onSave={async (f) => {
            await ui.run({
              action: 'prefs',
              data: {
                portions: num(f, 'portions')!,
                target: num(f, 'target')!,
                budget: cents(f, 'budget'),
                hello: cents(f, 'hello')!,
                helloMeals: num(f, 'helloMeals'),
                helloPortions: num(f, 'helloPortions'),
                diet: str(f, 'diet'),
                maxTime: num(f, 'maxTime'),
                bagDry: num(f, 'dry') === null ? null : num(f, 'dry')! * 1000,
                bagFresh: num(f, 'fresh') === null ? null : num(f, 'fresh')! * 1000,
                shops,
                leftovers: f.has('leftovers'),
              },
            });
          }}
        >
          <h2>Ma semaine et mon budget</h2>
          <div className="columns">
            {[
              ['portions', 'Portions habituelles', p.portions],
              ['target', 'Recettes par semaine', p.target],
              ['maxTime', 'Durée souhaitée (min)', p.maxTime],
              ['budget', 'Budget hebdomadaire (€)', p.budget === null ? null : p.budget / 100],
              ['hello', 'Panier HelloFresh (€)', p.hello / 100],
              ['helloMeals', 'Recettes dans le panier HelloFresh', p.helloMeals],
              ['helloPortions', 'Total de portions HelloFresh', p.helloPortions],
              [
                'fresh',
                'Capacité du sac frais (kg)',
                p.bagFresh === null ? null : p.bagFresh / 1000,
              ],
              ['dry', 'Capacité du sac épicerie (kg)', p.bagDry === null ? null : p.bagDry / 1000],
            ].map(([k, l, v]) => (
              <Field key={k} label={String(l)}>
                <input
                  name={String(k)}
                  type="number"
                  step="any"
                  defaultValue={v ?? ''}
                  min="0"
                  required={['portions', 'target', 'hello'].includes(String(k))}
                />
              </Field>
            ))}
            <Field label="Préférence alimentaire">
              <select name="diet" defaultValue={p.diet}>
                <option value="">Toutes</option>
                {['Viande', 'Poisson', 'Végétarien'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
          </div>
          <label>
            <input name="leftovers" type="checkbox" defaultChecked={p.leftovers} /> Réserver une
            portion pour le déjeuner suivant
          </label>
          <h3>Magasins et livraison</h3>
          {shops.map((v, i) => (
            <div className="columns" key={i}>
              {(['name', 'delivery', 'freeAt'] as const).map((k, j) => (
                <Field key={k} label={['Magasin', 'Livraison (€)', 'Gratuité dès (€)'][j]}>
                  <input
                    required={!j}
                    type={j ? 'number' : 'text'}
                    step="0.01"
                    min="0"
                    value={k === 'name' ? v.name : v[k] === null ? '' : v[k]! / 100}
                    onChange={(e) =>
                      setShops(
                        shops.map((a, n) =>
                          i === n
                            ? {
                                ...a,
                                [k]: j
                                  ? e.target.value === ''
                                    ? null
                                    : Math.round(Number(e.target.value) * 100)
                                  : e.target.value,
                              }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              <button type="button" onClick={() => setShops(shops.filter((_, n) => n !== i))}>
                Retirer
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShops([...shops, { name: '', delivery: null, freeAt: null }])}
          >
            + Magasin
          </button>
          <small>Fuseau Europe/Paris · Devise EUR</small>
        </Form>
      </div>
      <section className="panel">
        <h2>Migration Notion</h2>
        <p>
          Choisissez une archive Markdown/CSV avec ses sous-pages pour vérifier les fiches avant
          import.
        </p>
        <input
          type="file"
          accept=".zip"
          aria-label="Archive Notion"
          onChange={(e) => {
            setReport(null);
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        <div className="actions">
          <button
            disabled={!file}
            onClick={async () => {
              try {
                setReport(await api('archive-preview', file, true));
              } catch (e) {
                ui.notify((e as Error).message);
              }
            }}
          >
            Prévisualiser
          </button>
          {report && (
            <button
              disabled={!file || !report.added}
              onClick={async () => {
                try {
                  const v = await api('archive-apply', file, true);
                  setReport(v);
                  await ui.reload();
                  ui.notify(v.added + ' fiches ajoutées');
                } catch (e) {
                  ui.notify((e as Error).message);
                }
              }}
            >
              Importer les fiches
            </button>
          )}
        </div>
        {report && (
          <details open>
            <summary>
              {report.total} fiches · {report.added} nouvelles · {report.skipped} existantes ·{' '}
              {report.withheld} écartées
            </summary>
            {report.rows.map((r, i) => (
              <small key={i}>
                {r.title} · {r.issues.join(', ') || 'Complète'}
              </small>
            ))}
          </details>
        )}
      </section>
      <section className="panel">
        <h2>Sauvegarde personnelle</h2>
        <p>
          L’export JSON contient les recettes, leurs versions, les photos locales, les semaines, les
          prix et les préférences.
        </p>
        <a className="button" download href="/api/export">
          Télécharger mes données
        </a>
        <Field label="Restaurer un export dans une base vide">
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f && confirm('Restaurer cet export dans la base vide ?'))
                try {
                  const v = await api('restore', f, true);
                  await ui.reload();
                  ui.notify(v.restored + ' recettes restaurées');
                } catch (err) {
                  ui.notify((err as Error).message);
                }
            }}
          />
        </Field>
      </section>
    </>
  );
}
