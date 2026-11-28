'use client';
import Link from 'next/link';
import { PlanForm } from './recipes';
import { groupedMeals, momentLabel, nextMeal } from '@/lib/shopping-period';
import { ShoppingScan } from './shopping-scan';
import { useState } from 'react';
import { Plus, Copy, Download, WifiOff, Pencil } from 'lucide-react';
import {
  marketBasket,
  marketDate,
  priceSource,
  shipping,
  remainingShoppingText,
} from '@/lib/market';
import { fold, groceryName } from '@/lib/grocery-names';
import { shoppingAisles, suggestAisle } from '@/lib/aisles';
import { type State } from '@/lib/model';
import { money, labelDate, monday, today } from '@/lib/dates';
import {
  Form,
  Field,
  Dialog,
  PageTabs,
  usePageTab,
  Empty,
  quantity,
  api,
  str,
  num,
  type UI,
} from './common';
function download(name: string, txt: string) {
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
type ShoppingLine = ReturnType<typeof marketBasket>['lines'][number];

function Article({ ui, line }: { ui: UI; line?: ShoppingLine }) {
  const [name, setName] = useState(line?.name ?? '');
  const [choice, setChoice] = useState<string | null>(line?.category ?? null);
  const parts = line?.parts ?? [{ key: 'new', quantity: 1, unknown: false, unit: 'pièce' }];
  const manualItems = ui.s.items
    .filter((i) => i.manual)
    .sort((a, b) => b.week.localeCompare(a.week));
  const aisles = shoppingAisles([
    ...ui.s.prefs.customAisles,
    ...(line ? [line.category] : []),
    ...manualItems.map((i) => i.category),
  ]);
  const aisle =
    choice ??
    manualItems.find((i) => fold(groceryName(i.name)) === fold(groceryName(name)))?.category ??
    suggestAisle(name);
  return (
    <Dialog title={line ? 'Modifier l’article' : 'Ajouter un article'} close={ui.close}>
      <Form
        onSave={async (f) => {
          const category = choice === '' ? str(f, 'newAisle') : aisle;
          const measures = parts.map((part, i) => ({
            key: part.key,
            quantity: num(f, 'quantity' + i),
            unit: str(f, 'unit' + i),
          }));
          if (line) {
            if (
              await ui.run(
                {
                  action: 'shoppingLine',
                  week: ui.s.prefs.shoppingList!.id,
                  source: line.parts[0].sourceName,
                  edit: { name: name.trim(), category, measures },
                },
                'Article modifié.',
              )
            )
              ui.close();
          } else {
            const id = crypto.randomUUID();
            if (
              await ui.run({
                action: 'item',
                data: {
                  id,
                  key: 'manuel:' + id,
                  week: ui.s.prefs.shoppingList!.id,
                  name: name.trim(),
                  category,
                  quantity: measures[0].quantity,
                  unit: measures[0].unit,
                  manual: true,
                  checked: false,
                  bag: null,
                },
              })
            )
              ui.close();
          }
        }}
      >
        <Field label="Nom de l’article">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={300}
            autoFocus={!line}
          />
        </Field>
        <Field label="Rayon">
          <select name="category" value={aisle} onChange={(e) => setChoice(e.target.value)}>
            {aisles.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option value="">+ Créer un rayon…</option>
          </select>
        </Field>
        {choice === '' && (
          <Field label="Nom du nouveau rayon">
            <input name="newAisle" required maxLength={70} />
          </Field>
        )}
        {parts.map((part, i) => (
          <div key={part.key} className="columns">
            <Field label={line ? 'Quantité totale' : 'Quantité'}>
              <input
                name={'quantity' + i}
                defaultValue={part.unknown ? '' : part.quantity}
                placeholder={part.unknown ? 'À préciser' : undefined}
                type="number"
                inputMode="decimal"
                required={!line}
                min="0.000001"
                max="10000000"
                step="any"
              />
            </Field>
            <Field label="Unité">
              <input
                name={'unit' + i}
                list="article-unites"
                defaultValue={part.unit}
                required={!line || !!part.unit}
                maxLength={70}
              />
            </Field>
          </div>
        ))}
        <datalist id="article-unites">
          {[
            'pièce',
            'flacon',
            'bidon',
            'paquet',
            'boîte',
            'rouleau',
            'bouteille',
            'g',
            'kg',
            'ml',
            'L',
          ].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Form>
      {line && (
        <button
          className="danger"
          onClick={async () => {
            if (
              await ui.run(
                {
                  action: 'shoppingLine',
                  week: ui.s.prefs.shoppingList!.id,
                  source: line.parts[0].sourceName,
                  edit: null,
                },
                'Article retiré de la liste.',
              )
            )
              ui.close();
          }}
        >
          Retirer de la liste
        </button>
      )}
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
const shoppingTabs = [
  ['liste', 'Liste'],
  ['placard', 'Placard'],
] as const;
export function Shopping({ ui }: { ui: UI }) {
  const { s } = ui;
  const list = s.prefs.shoppingList!;
  const w = list.id;
  const { preps, end } = groupedMeals(s, list);
  const next = end ? nextMeal(end) : list.from;
  const rangeLabel = end ? 'Jusqu’au ' + momentLabel(end) : 'À partir du ' + momentLabel(list.from);
  const tab = usePageTab(shoppingTabs);
  const breakfastHref =
    '/semaine?week=' + monday(end?.day ?? list.from.day) + '&onglet=petit-dejeuner';
  const [delivery, setDelivery] = useState(false);
  const [carrier, setCarrier] = useState<'leclerc' | 'monoprix'>('leclerc');
  const cart = marketBasket(s, w);
  const sections = shoppingAisles([...s.prefs.customAisles, ...cart.lines.map((l) => l.category)])
    .map((aisle) => ({
      aisle,
      lines: cart.lines.filter((l) => l.category === aisle),
    }))
    .filter((section) => section.lines.length);
  const remaining = remainingShoppingText(sections.flatMap((section) => section.lines));
  async function copyRemaining() {
    try {
      await navigator.clipboard.writeText(remaining);
      ui.notify('Liste des achats restants copiée.');
    } catch {
      ui.open(
        <Dialog title="Copier les achats restants" close={ui.close}>
          <Field label="Sélectionnez le texte puis copiez-le">
            <textarea
              autoFocus
              readOnly
              rows={9}
              value={remaining}
              onFocus={(e) => e.currentTarget.select()}
            />
          </Field>
        </Dialog>,
      );
    }
  }
  const availableThisWeek = s.items
    .filter((i) => i.week === w && i.inPantry)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
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
      : line.pantry
        ? 'Selon le goût'
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
      if (
        old?.owner === ui.accountId &&
        old.rows.some((r: { before: boolean; checked: boolean }) => r.before !== r.checked)
      ) {
        window.location.assign(new URL('courses-hors-ligne.html', window.location.origin));
        return;
      }
      if (!('serviceWorker' in navigator))
        throw Error('Mode hors ligne indisponible dans ce navigateur.');
      await navigator.serviceWorker.ready;
      localStorage.setItem(
        'table-offline',
        JSON.stringify({
          owner: ui.accountId,
          week: w,
          periodLabel: rangeLabel,
          rows: sections
            .flatMap(({ lines }) => lines)
            .filter((l) => l.buy.length)
            .map((l) => ({
              name: l.name,
              category: l.category,
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
      </header>
      <PageTabs options={shoppingTabs} active={tab} />
      {tab === 'liste' && (
        <>
          <div className="shopping-coverage">
            <p>
              {end ? (
                <>
                  <strong>{rangeLabel}</strong>
                  <br />
                  {preps.length} préparation{preps.length > 1 ? 's' : ''} dans cette liste
                </>
              ) : (
                <>
                  Prochain repas à couvrir · <strong>{momentLabel(list.from)}</strong>
                </>
              )}
            </p>
            <button onClick={() => ui.open(<PlanForm ui={ui} day={next.day} slot={next.slot} />)}>
              Ajouter un repas
            </button>
          </div>
          <ShoppingScan key={w} ui={ui} />
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
              <small>
                {cart.unvalued || cart.incomplete.length
                  ? 'Quantités chiffrées'
                  : 'Valeur des quantités prévues'}{' '}
                · {money(cart.used)}
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
              produits frais sont comptés au poids ou à la pièce. Pour les produits emballés, le
              panier retient le format courant le moins cher pour couvrir le besoin, au prix médian
              de ce format. La valeur des quantités prévues inclut les ingrédients déjà au placard
              et couvre les portions à préparer. Les pièces et dosettes sont converties avec des
              poids indicatifs. Le sel et le poivre « selon le goût » sont supposés au placard.
            </p>
            <p>
              {s.prefs.hello > 0 && (
                <>Votre panier HelloFresh de référence est de {money(s.prefs.hello)}. </>
              )}
              <a href={priceSource} target="_blank" rel="noreferrer">
                Relevés Open Prices ↗
              </a>
            </p>
          </details>
          <div className="section-heading">
            <h2>
              {cart.lines.filter((l) => l.checked).length} / {cart.count} articles cochés
            </h2>
            <div className="actions">
              <button disabled={!remaining} onClick={copyRemaining}>
                <Copy size={16} /> Copier ce qu’il reste à acheter
              </button>
              <button className="primary" onClick={() => ui.open(<Article ui={ui} />)}>
                <Plus size={16} /> Ajouter un article
              </button>
            </div>
          </div>
          {sections.map(({ aisle: cat, lines: group }) => {
            return (
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
                      <button
                        className="grocery-open"
                        aria-label={'Modifier · ' + l.name}
                        onClick={() => ui.open(<Article ui={ui} line={l} />)}
                      >
                        <strong>{l.name}</strong>
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <small>{describe(l)}</small>
                      {l.parts
                        .filter((p) => p.scanned > 0)
                        .map((p) => (
                          <small key={p.key}>
                            Scanné · {quantity(p.scanned)} {p.unit || 'pièce'}
                            {!p.unknown && p.scanned < p.buy
                              ? ' · Reste à acheter ' + quantity(p.buy - p.scanned) + ' ' + p.unit
                              : ''}
                          </small>
                        ))}
                      {l.parts
                        .filter((p) => !p.checked && p.bought > p.scanned && p.buy > p.bought)
                        .map((p) => (
                          <small key={p.key}>
                            Déjà acheté · {quantity(p.bought)} {p.unit} · Reste à acheter{' '}
                            {quantity(p.buy - p.bought)} {p.unit}
                          </small>
                        ))}
                      {l.parts.some((p) => p.stock > 0) && <small>Stock déduit du placard</small>}
                      {l.breakfast?.product.reserve && (
                        <Link className="pantry-link" href={breakfastHref}>
                          Voir la réserve du petit-déjeuner
                        </Link>
                      )}
                      {!l.breakfast?.product.reserve &&
                        !l.pantry &&
                        (l.available || l.buy.length > 0) && (
                          <button
                            className="pantry-link"
                            aria-label={
                              (l.available ? 'Remettre sur la liste · ' : 'Déjà chez moi · ') +
                              l.name
                            }
                            onClick={() =>
                              ui.run(
                                {
                                  action: 'pantryWeek',
                                  week: w,
                                  name: l.parts[0].sourceName,
                                  available: !l.available,
                                },
                                l.available
                                  ? 'Article remis dans les courses.'
                                  : 'Couvert par le placard pour cette liste.',
                              )
                            }
                          >
                            {l.available ? 'Remettre sur la liste' : 'Déjà chez moi'}
                          </button>
                        )}
                    </div>
                    <span className="line-price">
                      {l.pantry || l.available
                        ? 'Placard'
                        : !l.buy.length
                          ? 'En stock'
                          : l.cents === null
                            ? 'Non chiffré'
                            : money(l.cents)}
                      {l.ref && l.packs > 0 && (
                        <small>
                          {l.packs} × {l.breakfast?.product.size ?? l.pack}{' '}
                          {l.breakfast?.product.unit ?? l.ref.unit}
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
              Les ingrédients apparaissent ici dès que tu ajoutes un repas.
            </Empty>
          )}
          {(preps.length > 0 ||
            cart.lines.length > 0 ||
            s.lots.some((l) => (l.listId ?? l.week) === w)) && (
            <button
              className="primary close-shopping"
              onClick={() =>
                ui.open(
                  <Dialog title="Courses faites ?" close={ui.close}>
                    <p>
                      {end ? (
                        <>
                          Cette liste couvre les repas jusqu’au <strong>{momentLabel(end)}</strong>.
                          La prochaine commencera le <strong>{momentLabel(next)}</strong>.
                        </>
                      ) : (
                        'La prochaine liste commencera au même repas.'
                      )}
                    </p>
                    {cart.lines.some((l) => l.buy.length && !l.checked) && (
                      <p>Les articles non cochés resteront sur cette liste clôturée.</p>
                    )}
                    <div className="actions">
                      <button onClick={ui.close}>Continuer mes courses</button>
                      <button
                        className="primary"
                        onClick={async () => {
                          if (
                            await ui.run(
                              {
                                action: 'closeShoppingList',
                                listId: w,
                                previewRevision: s.revision,
                              },
                              'Courses enregistrées. La nouvelle liste est ouverte.',
                            )
                          )
                            ui.close();
                        }}
                      >
                        Confirmer les courses faites
                      </button>
                    </div>
                  </Dialog>,
                )
              }
            >
              Courses faites
            </button>
          )}
          <div className="actions">
            <button onClick={offline}>
              <WifiOff size={16} /> Emporter hors ligne
            </button>
            <button
              onClick={() =>
                download(
                  'courses-' + list.from.day + '.txt',
                  rangeLabel +
                    '\n\n' +
                    sections
                      .map(({ aisle, lines }) =>
                        [
                          aisle,
                          ...lines.map(
                            (l) => (l.checked ? '☑ ' : '☐ ') + l.name + ' · ' + describe(l),
                          ),
                        ].join('\n'),
                      )
                      .join('\n\n'),
                )
              }
            >
              <Download size={16} /> Exporter
            </button>
          </div>
        </>
      )}
      {tab === 'placard' && (
        <section className="week-section">
          <div className="section-heading">
            <div>
              <h2>Mes stocks disponibles</h2>
              <Link className="text-link" href={breakfastHref}>
                Voir le stock du petit-déjeuner
              </Link>
            </div>
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
          {availableThisWeek.map((i) => (
            <div className="row" key={i.id}>
              <b>{i.name}</b>
              <button
                onClick={() =>
                  ui.run(
                    { action: 'pantryWeek', week: w, name: i.name, available: false },
                    'Article remis dans les courses.',
                  )
                }
              >
                Remettre sur la liste
              </button>
            </div>
          ))}
        </section>
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
                leftovers: true,
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
