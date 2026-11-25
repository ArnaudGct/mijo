import nodemailer from 'nodemailer';
import { UserError } from './commands';

export async function sendAccountMail(email: string, purpose: 'verify' | 'reset', token: string) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM || !process.env.APP_ORIGIN)
    throw new UserError('Le service e-mail est indisponible. Réessayez plus tard.', 503);
  const link = new URL('/compte', process.env.APP_ORIGIN);
  link.searchParams.set('action', purpose);
  // A fragment keeps the secret out of server access logs and link previews.
  link.hash = token;
  const verification = purpose === 'verify';
  const action = verification ? 'Confirmer mon adresse e-mail' : 'Choisir un nouveau mot de passe';
  const title = verification
    ? 'Confirmez votre adresse e-mail'
    : 'Réinitialisez votre mot de passe';
  const description = verification
    ? 'Vous avez demandé la création de votre carnet Mijo.'
    : 'Vous avez demandé à changer votre mot de passe Mijo.';
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Mijo · ' + title,
      html: `<p>${description}</p><p><a href="${link.href}">${action}</a></p><p>Ce lien est valable 30 minutes. Si vous n’avez pas fait cette demande, ignorez ce message.</p>`,
      text: [
        description,
        action,
        link.href,
        'Ce lien est valable 30 minutes. Si vous n’avez pas fait cette demande, ignorez ce message.',
      ].join('\n\n'),
    });
  } catch {
    throw new UserError('L’envoi de l’e-mail a échoué. Réessayez dans un instant.', 503);
  } finally {
    transport.close();
  }
}
