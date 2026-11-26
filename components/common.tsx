'use client';
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
  useContext,
  createContext,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { X, Leaf, Sprout, CalendarDays, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import type { State } from '@/lib/model';
import type { Command } from '@/lib/commands';
import { addDays, labelDate, monday } from '@/lib/dates';
export const Feedback = createContext('');
const subscribeToHydration = () => () => {};
export const useInteractive = () =>
  useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
export type UI = {
  accountId: string;
  s: State;
  w: string;
  setW: (v: string) => void;
  run: (c: Command, msg?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  notify: (msg: string) => void;
  open: (v: ReactNode) => void;
  close: () => void;
};
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Sprout size={23} />
      </span>
      Mijo
    </span>
  );
}
export function Dialog({
  title,
  children,
  close,
  className,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const feedback = useContext(Feedback);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => {
      el?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <div className="dialog-body">
        <header className="split">
          <h2>{title}</h2>
          <button className="icon" aria-label="Fermer" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {feedback && (
          <p role="status" className="notice">
            {feedback}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Form({
  onSave,
  children,
  button = 'Enregistrer',
  disabled = false,
  secondaryAction,
}: {
  onSave: (f: FormData) => Promise<void> | void;
  children: ReactNode;
  button?: string;
  disabled?: boolean;
  secondaryAction?: ReactNode;
}) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    const el = e.currentTarget;
    const b = el.querySelector<HTMLButtonElement>('button[type=submit]');
    if (b) b.disabled = true;
    try {
      await onSave(new FormData(el));
    } finally {
      if (b) b.disabled = false;
    }
  }
  const submitButton = (
    <button type="submit" className="primary" disabled={disabled}>
      {button}
    </button>
  );
  return (
    <form onSubmit={submit} method="post" className="editor">
      {children}
      {secondaryAction ? (
        <div className="form-actions">
          {submitButton}
          {secondaryAction}
        </div>
      ) : (
        submitButton
      )}
    </form>
  );
}
export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
export const num = (f: FormData, k: string) =>
  str(f, k) === '' ? null : Number(str(f, k).replace(',', '.'));
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={26} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function usePageTab<const T extends string>(options: ReadonlyArray<readonly [T, string]>) {
  const requested = useSearchParams().get('onglet');
  return options.find(([key]) => key === requested)?.[0] ?? options[0][0];
}

export function PageTabs({
  options,
  active,
}: {
  options: ReadonlyArray<readonly [string, string]>;
  active: string;
}) {
  function selectTab(key: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('onglet', key);
    history.replaceState(null, '', url);
  }
  return (
    <div className="tabs page-tabs">
      {options.map(([key, label]) => (
        <button
          key={key}
          className={active === key ? 'selected' : ''}
          aria-pressed={active === key}
          onClick={() => selectTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function WeekNav({ ui }: { ui: UI }) {
  return (
    <div className="weeknav">
      <button
        className="icon"
        aria-label="Semaine précédente"
        onClick={() => ui.setW(addDays(ui.w, -7))}
      >
        <ChevronLeft size={17} />
      </button>
      <label>
        <CalendarDays size={16} />
        {labelDate(ui.w, { day: 'numeric', month: 'short' })} –{' '}
        {labelDate(addDays(ui.w, 6), { day: 'numeric', month: 'short' })}
        <input
          type="date"
          value={ui.w}
          aria-label="Choisir une semaine"
          onChange={(e) => e.target.value && ui.setW(monday(e.target.value))}
        />
      </label>
      <button
        className="icon"
        aria-label="Semaine suivante"
        onClick={() => ui.setW(addDays(ui.w, 7))}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
export function Photo({
  src,
  title = '',
  className = '',
}: {
  src: string;
  title?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState('');
  return src && src !== failed ? (
    <img
      onError={() => setFailed(src)}
      className={'photo ' + className}
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className={'photo missing ' + className}>
      <Leaf size={30} />
    </div>
  );
}
export const quantity = (n: number | null) =>
  n === null ? 'À préciser' : Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(n);
export async function api(path: string, body: unknown, raw = false) {
  const headers = new Headers();
  if (!raw) headers.set('Content-Type', 'application/json');
  const account = document.querySelector<HTMLElement>('[data-notebook]')?.dataset.notebook;
  if (account) headers.set('X-Mijo-Account', account);
  const res = await fetch('/api/' + path, {
    method: 'POST',
    headers,
    body: raw ? (body as BodyInit) : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Opération impossible.');
  return data;
}
