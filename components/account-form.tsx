'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Brand, Field, Form, api, useInteractive } from './common';

const forms = {
  login: ['Mon carnet de cuisine', 'Ouvrir mon carnet'],
  register: ['Créer mon compte', 'Créer mon compte'],
  forgot: ['Mot de passe oublié', 'Recevoir le lien'],
  verify: ['Confirmer mon adresse', 'Confirmer mon adresse e-mail'],
  reset: ['Nouveau mot de passe', 'Enregistrer le mot de passe'],
} as const;
type Mode = keyof typeof forms;

export function AccountForm() {
  const action = useSearchParams().get('action') || 'login';
  const mode: Mode = Object.hasOwn(forms, action) ? (action as Mode) : 'login';
  return <AccountPanel key={mode} mode={mode} />;
}

function AccountPanel({ mode }: { mode: Mode }) {
  const interactive = useInteractive();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [title, button] = forms[mode];
  const newPassword = mode === 'register' || mode === 'reset';
  async function submit(form: FormData) {
    setError('');
    try {
      const token = location.hash.slice(1);
      const email = form.get('email');
      const password = form.get('password');
      await api(mode, { email, password, token });
      if (mode === 'login') {
        const copy = localStorage.getItem('table-offline');
        if (copy) {
          let owner: unknown;
          try {
            owner = JSON.parse(copy)?.owner;
          } catch {
            // Old or incomplete copies have no identifiable owner.
          }
          if (!owner || !document.cookie.split('; ').includes('mijo_notebook=' + owner))
            localStorage.removeItem('table-offline');
        }
        window.location.replace(
          location.pathname === '/compte' ? '/' : location.pathname + location.search,
        );
        return;
      }
      if (mode === 'verify' || mode === 'reset')
        history.replaceState(null, '', location.pathname + location.search);
      const messages = {
        register:
          'Consultez votre boîte mail pour confirmer votre adresse. Si vous avez déjà un compte, connectez-vous ou demandez un nouveau mot de passe.',
        forgot:
          'Si un compte actif correspond à cette adresse, un lien de réinitialisation vient de vous être envoyé.',
        verify: 'Votre adresse est confirmée. Vous pouvez ouvrir votre carnet.',
        reset: 'Votre mot de passe est enregistré. Vous pouvez vous connecter.',
      };
      setMessage(messages[mode]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="login">
      <div className="login-art">
        <img src="/cuisine.jpg" alt="Légumes frais sur un plan de travail" />
        <div className="login-caption">
          <h1>Mijo</h1>
        </div>
      </div>
      <div className="login-form" inert={!interactive}>
        <Brand />
        <div>
          <h2>{title}</h2>
          {message ? (
            <p role="status">{message}</p>
          ) : (
            <>
              {mode === 'register' && (
                <p>Vous recevrez un lien pour confirmer votre adresse e-mail.</p>
              )}
              {mode === 'forgot' && <p>Recevez un lien pour choisir un nouveau mot de passe.</p>}
              {mode === 'verify' && <p>Confirmez votre adresse pour activer votre carnet.</p>}
              <Form button={button} onSave={submit}>
                {['login', 'register', 'forgot'].includes(mode) && (
                  <Field label="Adresse e-mail">
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                    />
                  </Field>
                )}
                {(mode === 'login' || newPassword) && (
                  <Field label={newPassword ? 'Choisissez votre mot de passe' : 'Mot de passe'}>
                    <input
                      type="password"
                      name="password"
                      autoComplete={newPassword ? 'new-password' : 'current-password'}
                      minLength={newPassword ? 12 : 1}
                      maxLength={256}
                      aria-describedby={newPassword ? 'password-help' : undefined}
                      required
                    />
                  </Field>
                )}
                {newPassword && <small id="password-help">12 caractères minimum.</small>}
              </Form>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <nav className="account-links" aria-label="Accès au compte">
            {mode !== 'login' && <Link href="/compte">Se connecter</Link>}
            {(mode === 'login' || (mode === 'verify' && error)) && (
              <Link href="/compte?action=register">Créer un compte</Link>
            )}
            {(mode === 'login' || (mode === 'reset' && error)) && (
              <Link href="/compte?action=forgot">Mot de passe oublié&nbsp;?</Link>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
