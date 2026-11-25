'use client';
import { useEffect, useRef, useState } from 'react';
import { ScanBarcode, CalendarDays, Pencil } from 'lucide-react';
import { Dialog, Field, Form, api, quantity, type UI } from './common';
import { type PurchaseLot } from '@/lib/model';
import { labelDate, money, monday, today } from '@/lib/dates';
import { needs, type Need } from '@/lib/shopping';
import { groceryName } from '@/lib/grocery-names';
import { normalize } from '@/lib/ingredients';
import {
  readProductCode,
  suggestedLine,
  type ProductInfo,
  type ScannedCode,
} from '@/lib/product-scan';

function Camera({ detected, previous }: { detected: (text: string) => boolean; previous: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let closed = false;
    let blocked = previous;
    let clearSince = 0;
    let controls: { stop(): void } | undefined;
    let stream: MediaStream | undefined;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            'Pour utiliser la caméra, ouvrez l’application en HTTPS. Vous pouvez aussi saisir le code ci-dessous.',
          );
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (closed) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
        if (closed || !video.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        controls = await new BrowserMultiFormatReader().decodeFromStream(
          stream,
          video.current,
          (result, _, reader) => {
            if (closed) return;
            if (!result) {
              clearSince ||= performance.now();
              if (performance.now() - clearSince >= 450) blocked = '';
              return;
            }
            clearSince = 0;
            const raw = result.getText();
            if (blocked && readProductCode(raw)?.barcode === blocked) return;
            if (detected(raw)) reader.stop();
          },
        );
        if (closed) controls.stop();
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!closed)
          setError(
            (e as Error).name === 'Error'
              ? (e as Error).message
              : 'Caméra indisponible. Autorisez son accès ou saisissez le code ci-dessous.',
          );
      }
    }
    void start();
    return () => {
      closed = true;
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [detected, previous]);
  return error ? (
    <p role="status">{error}</p>
  ) : (
    <div className="scan-camera">
      <video ref={video} muted playsInline autoPlay aria-label="Aperçu de la caméra" />
      <span aria-hidden="true" />
      <small>Cadrez le code-barres de l’emballage</small>
    </div>
  );
}

function Capture({ found, previous }: { found: (code: ScannedCode) => void; previous: string }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const callback = useRef(found);
  // Keep one camera stream while the manual field is being edited.
  const [detect] = useState(() => (value: string) => {
    const code = readProductCode(value);
    if (code) callback.current(code);
    else setError('Code produit non reconnu. Vérifiez les chiffres ou choisissez l’article.');
    return !!code;
  });
  return (
    <>
      <Camera detected={detect} previous={previous} />
      <form
        className="scan-code"
        onSubmit={(e) => {
          e.preventDefault();
          detect(raw);
        }}
      >
        <Field label="Numéro du code-barres">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode="numeric"
            maxLength={500}
            autoComplete="off"
          />
        </Field>
        <button type="submit" disabled={!raw.trim()}>
          Rechercher
        </button>
      </form>
      {error && <p role="status">{error}</p>}
      {previous && <button onClick={() => detect(previous)}>Reprendre le même produit</button>}
      <button onClick={() => found({ barcode: '', expires: null, dateKind: null })}>
        Choisir un article sans code
      </button>
    </>
  );
}

function Price({ code }: { code: string }) {
  const [price, setPrice] = useState<{ cents: number; shop: string; day: string } | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    api('observations', { barcode: code })
      .then((v) => {
        if (live) setPrice(v.rows[0] ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setDone(true);
      });
    return () => {
      live = false;
    };
  }, [code]);
  return (
    <small>
      {price
        ? 'Prix relevé · ' +
          money(price.cents) +
          ' · ' +
          price.shop +
          ' · ' +
          labelDate(price.day, { day: 'numeric', month: 'short', year: 'numeric' })
        : done
          ? 'Aucun prix local disponible.'
          : 'Recherche du dernier prix relevé…'}
    </small>
  );
}

type EditorProps = {
  ui: UI;
  code: ScannedCode;
  rows: Need[];
  existing?: PurchaseLot;
  onSave: () => void;
  onBack?: () => void;
};

function packageDate(kind: PurchaseLot['dateKind'], date: string) {
  const text = labelDate(date);
  return kind ? kind + ' ' + text : text;
}

function LotEditor({ ui, code, rows, existing, onSave, onBack }: EditorProps) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID());
  const known = ui.s.lots.find((l) => code.barcode && l.barcode === code.barcode);
  const initial = existing ?? known;
  const initialLine = existing
    ? rows.find((r) => r.sourceName === existing.name && (r.unit || 'pièce') === existing.unit)
    : suggestedLine(rows, code.barcode, initial?.product ?? '', ui.s.lots);
  const [selection, setSelection] = useState(initialLine?.key ?? (existing ? 'extra' : ''));
  const [name, setName] = useState(existing?.name ?? '');
  const [product, setProduct] = useState(initial?.product ?? '');
  const [info, setInfo] = useState<ProductInfo | null>(null);
  const [unit, setUnit] = useState(initial?.unit ?? 'pièce');
  const [amount, setAmount] = useState(
    initial && (existing || initialLine?.unit === initial.unit) ? String(initial.quantity) : '',
  );
  const [expires, setExpires] = useState(existing?.expires ?? code.expires ?? '');
  const [kind, setKind] = useState(code.dateKind);
  const [status, setStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const edited = useRef(false);
  const [lookup] = useState(() => ({ rows, lots: ui.s.lots }));
  useEffect(() => {
    if (!code.barcode || existing) return;
    let live = true;
    api('product', { barcode: code.barcode })
      .then(({ product: p }: { product: ProductInfo | null }) => {
        if (!live) return;
        if (!p) {
          setStatus('Référence absente du catalogue.');
          return;
        }
        setProduct(p.name);
        setInfo(p);
        if (edited.current) return;
        const r = suggestedLine(lookup.rows, code.barcode, p.name, lookup.lots);
        if (r) setSelection(r.key);
        if (p.quantity && (!r || r.unit === p.unit)) {
          setAmount(String(p.quantity));
          setUnit(p.unit);
        }
      })
      .catch(() => {
        if (live) setStatus('Catalogue indisponible. Vous pouvez choisir l’article.');
      });
    return () => {
      live = false;
    };
  }, [code.barcode, existing, lookup]);
  const line = rows.find((r) => r.key === selection);
  const targetUnit = line ? line.unit || 'pièce' : unit;
  function select(v: string) {
    edited.current = true;
    setSelection(v);
    const row = rows.find((r) => r.key === v);
    const u = row?.unit || (v === 'extra' ? info?.unit : '') || 'pièce';
    setUnit(u);
    setAmount(info?.quantity && info.unit === u ? String(info.quantity) : u === 'pièce' ? '1' : '');
    if (v === 'extra') setName(product);
  }
  return (
    <>
      {code.barcode && (
        <div className="scan-product">
          <strong>{product || 'Produit scanné'}</strong>
          <small>
            {code.barcode}
            {info?.quantity ? ' · ' + quantity(info.quantity) + ' ' + info.unit : ''}
          </small>
          {!existing && <Price code={code.barcode} />}
          {status && <small role="status">{status}</small>}
        </div>
      )}
      <Form
        button={existing ? 'Enregistrer les modifications' : 'Ajouter cet emballage'}
        disabled={!selection}
        onSave={async () => {
          setSaving(true);
          const label = line?.sourceName || name.trim();
          const [q, u] = normalize(Number(amount.replace(',', '.')), targetUnit);
          if (
            await ui.run(
              {
                action: 'purchaseLot',
                data: {
                  id,
                  week: ui.w,
                  barcode: code.barcode,
                  product: product || line?.name || label,
                  name: groceryName(label),
                  quantity: q,
                  unit: u,
                  expires: expires || null,
                  dateKind: kind,
                },
              },
              'Emballage enregistré.',
            )
          )
            onSave();
          else {
            setSaving(false);
            setSaveError(
              'Enregistrement non confirmé. Vérifiez la connexion, la quantité et la semaine avant de réessayer.',
            );
          }
        }}
      >
        <Field label="Article de la liste">
          <select required value={selection} onChange={(e) => select(e.target.value)}>
            <option value="">Choisir un article…</option>
            {rows.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
                {r.unit ? ' · ' + r.unit : ''}
              </option>
            ))}
            <option value="extra">Autre article hors liste</option>
          </select>
        </Field>
        {selection === 'extra' && (
          <Field label="Nom de l’ingrédient">
            <input
              required
              maxLength={300}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        {selection && (
          <div className="scan-measure">
            <Field label={'Quantité de cet emballage' + (line ? ' (' + targetUnit + ')' : '')}>
              <input
                required
                type="number"
                inputMode="decimal"
                min="0.000001"
                max="10000000"
                step="any"
                value={amount}
                onChange={(e) => {
                  edited.current = true;
                  setAmount(e.target.value);
                }}
              />
            </Field>
            {!line && (
              <Field label="Unité">
                <input
                  required
                  maxLength={70}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}
        <div className="scan-dates">
          <Field label="Date de l’emballage">
            <span className="scan-date-control">
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              {!expires && (
                <span className="scan-date-hint" aria-hidden="true">
                  Choisir une date <CalendarDays size={18} />
                </span>
              )}
            </span>
          </Field>
          <Field label="Mention sur l’emballage">
            <select
              value={kind ?? ''}
              onChange={(e) => setKind((e.target.value || null) as typeof kind)}
            >
              <option value="">Non définie</option>
              <option value="DLC">À consommer jusqu’au</option>
              <option value="DDM">De préférence avant</option>
            </select>
          </Field>
        </div>
        {line && !line.unknown && (
          <small>
            À acheter · {quantity(Math.max(0, line.buy - line.scanned))} {targetUnit}
          </small>
        )}
        {saveError && <p role="alert">{saveError}</p>}
      </Form>
      {onBack && (
        <button disabled={saving} onClick={onBack}>
          Retour au scan
        </button>
      )}
    </>
  );
}

function ScanDialog({
  ui,
  existing,
  rows,
  close,
}: {
  ui: UI;
  existing?: PurchaseLot;
  rows: Need[];
  close: () => void;
}) {
  const [code, setCode] = useState<ScannedCode | null>(existing ?? null);
  const [previous, setPrevious] = useState('');
  const [added, setAdded] = useState(false);
  function resume(saved: boolean) {
    setAdded(saved);
    setPrevious(code?.barcode ?? '');
    setCode(null);
  }
  return (
    <Dialog title={existing ? 'Modifier l’emballage' : 'Scanner un produit'} close={close}>
      {code ? (
        <LotEditor
          ui={ui}
          code={code}
          rows={rows}
          existing={existing}
          onSave={existing ? close : () => resume(true)}
          onBack={existing ? undefined : () => resume(false)}
        />
      ) : (
        <>
          {added && <p role="status">Emballage ajouté. Scannez le produit suivant.</p>}
          <Capture found={setCode} previous={previous} />
        </>
      )}
      {existing && (
        <button
          className="manual-remove"
          onClick={async () => {
            if (await ui.run({ action: 'removeLot', id: existing.id }, 'Emballage retiré.'))
              close();
          }}
        >
          Retirer cet emballage
        </button>
      )}
    </Dialog>
  );
}
export function ShoppingScan({ ui }: { ui: UI }) {
  const [editing, setEditing] = useState<PurchaseLot | 'new' | null>(null);
  const lots = ui.s.lots.filter((l) => l.week === ui.w);
  const active = ui.w >= monday(today());
  if (!active && !lots.length) return null;
  return (
    <section className="scan-shopping" aria-label="Achats en magasin">
      {active && (
        <div className="actions">
          <button className="primary" onClick={() => setEditing('new')}>
            <ScanBarcode size={18} /> Scanner un produit
          </button>
        </div>
      )}
      {lots.length > 0 && (
        <details className="scan-lots">
          <summary>Emballages scannés ({lots.length})</summary>
          {lots.map((l) => (
            <div className="split" key={l.id}>
              <div>
                <strong>{l.product}</strong>
                <small>
                  {l.name} · {quantity(l.quantity)} {l.unit} ·{' '}
                  {l.expires ? packageDate(l.dateKind, l.expires) : 'Sans date'}
                </small>
              </div>
              {active && !Object.keys(l.used ?? {}).length && (
                <button
                  className="icon"
                  aria-label={'Modifier ' + l.product}
                  onClick={() => setEditing(l)}
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {editing && (
        <ScanDialog
          ui={ui}
          existing={editing === 'new' ? undefined : editing}
          rows={needs(ui.s, ui.w)
            .rows.filter((r) => !r.inPantry && (r.buy > 0 || r.unknown))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))}
          close={() => setEditing(null)}
        />
      )}
    </section>
  );
}
