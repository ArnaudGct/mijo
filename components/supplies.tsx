'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Download, WifiOff } from 'lucide-react';
import { marketBasket, marketDate, priceSource, shipping } from '@/lib/market';
import { fold, groceryName } from '@/lib/grocery-names';
import { categories, type State } from '@/lib/model';
import { money, labelDate } from '@/lib/dates';
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
export function Shopping({ ui }: { ui: UI }) {
  const { s, w } = ui;
  const [tab, setTab] = useState('Liste'),
    [delivery, setDelivery] = useState(false);
  const [carrier, setCarrier] = useState<'leclerc' | 'monoprix'>('leclerc');
  const cart = marketBasket(s, w);
  type Line = (typeof cart.lines)[number];
  const describe = (line: Line) =>
    line.buy.length
      ? line.buy
          .map((r) =>
            r.unknown
              ? r.unit === 'selon le goût'
                ? 'Selon le goût'
                : 'Quantité à préciser'
              : quantity(r.buy) + ' ' + r.unit,
          )
          .join(' + ')
      : 'En stock';
  const parts = (line: Line) =>
    line.buy.map((r) => ({ key: r.key, quantity: r.buy, unknown: r.unknown, before: r.checked }));
  async function toggle(line: Line, checked: boolean) {
    try {
      await api(
        'checks',
        parts(line).map((r) => ({ ...r, week: w, checked })),
      );
      await ui.reload();
    } catch (e) {
      ui.notify((e as Error).message);
      await ui.reload().catch(() => {});
    }
  }
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
          rows: cart.lines
            .filter((l) => l.buy.length)
            .map((l) => ({
              name: l.name,
              description: describe(l),
              parts: parts(l),
              checked: l.checked,
              before: l.checked,
            })),
        }),
      );
      window.location.assign(new URL('courses-hors-ligne.html', window.location.origin));
    } catch (e) {
      ui.notify((e as Error).message);
    }
  }
  const deliveryRate = shipping(carrier, cart.cash);
  const withFee = delivery && deliveryRate.fee !== null;
  const total = cart.cash + (withFee ? deliveryRate.fee! : 0);
  const partial = cart.missing > 0 || cart.incomplete.length > 0;
  return (
    <>
      <header className="page-heading">
        <h1>Mes courses</h1>
        <WeekNav ui={ui} />
      </header>
      <div className="tabs">
        <button className={tab === 'Liste' ? 'selected' : ''} onClick={() => setTab('Liste')}>
          Liste
        </button>
        <button className={tab === 'Placard' ? 'selected' : ''} onClick={() => setTab('Placard')}>
          Placard
        </button>
      </div>
      {tab === 'Liste' && (
        <>
          <section className="basket-summary" aria-label="Estimation du panier">
            <div>
              <h2>{partial ? 'Sous-total estimé' : 'Panier estimé'}</h2>
              <strong className="large-money">
                {withFee && deliveryRate.from ? 'dès ' : ''}
                {money(total)}
              </strong>
              <small>
                {cart.count} articles · {withFee ? 'livraison incluse' : 'hors livraison'}
              </small>
              {partial && (
                <p>
                  {cart.missing > 0 && cart.missing + ' article(s) sans estimation. '}
                  {cart.incomplete.join(', ')}
                </p>
              )}
            </div>
            <div className="receipt">
              <div>
                <span>Courses</span>
                <b>{money(cart.cash)}</b>
              </div>
              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={delivery}
                    onChange={(e) => setDelivery(e.target.checked)}
                  />{' '}
                  Inclure la livraison
                </label>
                <b>
                  {!delivery
                    ? '—'
                    : deliveryRate.fee === null
                      ? 'Minimum ' + money(deliveryRate.minimum)
                      : (deliveryRate.from ? 'dès ' : '') + money(deliveryRate.fee)}
                </b>
              </div>
              {delivery && (
                <>
                  <fieldset className="carriers">
                    <legend>Service de livraison</legend>
                    <label>
                      <input
                        type="radio"
                        checked={carrier === 'leclerc'}
                        onChange={() => setCarrier('leclerc')}
                      />{' '}
                      E.Leclerc Périgny
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={carrier === 'monoprix'}
                        onChange={() => setCarrier('monoprix')}
                      />{' '}
                      Monoprix
                    </label>
                  </fieldset>
                  <small>
                    {deliveryRate.fee === null
                      ? 'Minimum de commande non atteint.'
                      : 'Sous réserve de desserte à votre adresse.'}{' '}
                    <a href={deliveryRate.url} target="_blank" rel="noreferrer">
                      Barème de livraison ↗
                    </a>
                  </small>
                </>
              )}
            </div>
          </section>
          <details className="price-method">
            <summary>Comment le panier est-il estimé ?</summary>
            <p>
              Prix médians observés en France hors promotions, sur douze mois jusqu’au{' '}
              {labelDate(marketDate, { day: 'numeric', month: 'long', year: 'numeric' })}. Les
              produits en vrac sont comptés au poids et les autres par emballage entier. Les pièces
              et dosettes sont converties avec des poids indicatifs. Le sel et le poivre « selon le
              goût » sont supposés au placard.
            </p>
            <p>
              Votre panier HelloFresh de référence est de {money(s.prefs.hello)}.{' '}
              <a href={priceSource} target="_blank" rel="noreferrer">
                Relevés Open Prices ↗
              </a>
            </p>
          </details>
          <div className="section-heading">
            <h2>
              {cart.lines.filter((l) => l.checked).length} / {cart.count} articles cochés
            </h2>
            <button className="primary" onClick={() => ui.open(<Article ui={ui} />)}>
              <Plus size={16} /> Article
            </button>
          </div>
          {categories.map((cat) => {
            const group = cart.lines.filter((l) => l.category === cat);
            return !group.length ? null : (
              <section key={cat} className="panel">
                <h3>{cat}</h3>
                {group.map((l) => (
                  <div key={l.key} className={'grocery ' + (l.checked ? 'done' : '')}>
                    <input
                      type="checkbox"
                      aria-label={'Acheté · ' + l.name}
                      disabled={!l.buy.length}
                      checked={l.checked}
                      onChange={(e) => void toggle(l, e.target.checked)}
                    />
                    <div>
                      <strong>{l.name}</strong>
                      <small>{describe(l)}</small>
                      {l.parts.some((p) => p.stock > 0) && <small>Stock déduit du placard</small>}
                      {s.items
                        .filter(
                          (i) => i.manual && i.week === w && fold(groceryName(i.name)) === l.key,
                        )
                        .map((i) => (
                          <button
                            className="manual-remove"
                            key={i.id}
                            onClick={() => ui.run({ action: 'remove', table: 'items', id: i.id })}
                          >
                            Retirer l’ajout de {quantity(i.quantity)} {i.unit}
                          </button>
                        ))}
                    </div>
                    <span className="line-price">
                      {l.pantry
                        ? 'Placard'
                        : !l.buy.length
                          ? 'En stock'
                          : l.cents === null
                            ? 'Non chiffré'
                            : money(l.cents)}
                      {l.ref && l.packs > 0 && (
                        <small>
                          {l.packs} × {l.pack} {l.ref.unit}
                        </small>
                      )}
                    </span>
                  </div>
                ))}
              </section>
            );
          })}
          {!cart.lines.length && (
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
                  cart.lines
                    .map((l) => (l.checked ? '☑ ' : '☐ ') + l.name + ' · ' + describe(l))
                    .join('\n'),
                )
              }
            >
              <Download size={16} /> Exporter
            </button>
          </div>
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
    </>
  );
}
export function Preferences({ ui }: { ui: UI }) {
  const p = ui.s.prefs;
  const [file, setFile] = useState<File | null>(null),
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
                ...p,
                portions: num(f, 'portions')!,
                target: num(f, 'target')!,
                budget: cents(f, 'budget'),
                hello: cents(f, 'hello')!,
                diet: str(f, 'diet'),
                maxTime: num(f, 'maxTime'),
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
