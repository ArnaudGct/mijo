import { cookies } from 'next/headers';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { db } from './db';
import { UserError } from './commands';
import { sendAccountMail } from './account-mail';

const stretch = promisify(scrypt);
const cookieName = 'table_session';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const emailInput = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordInput = z.string().min(12, 'Utilisez au moins 12 caractères.').max(256);
const tokenInput = z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide.');
type Purpose = 'verify' | 'reset';
export type Account = { id: string; email: string };

async function hashPassword(password: string) {
  const salt = randomBytes(24).toString('hex');
  const key = (await stretch(password, salt, 64)) as Buffer;
  return salt + ':' + key.toString('hex');
}

async function rateLimit(bucket: string, limit: number) {
  const sql = db();
  await sql`delete from auth_limits where since < now() - interval '10 minutes'`;
  const [row] = await sql`insert into auth_limits(bucket,since,attempts) values(${bucket},now(),1)
    on conflict (bucket) do update set attempts=auth_limits.attempts+1 returning attempts`;
  if (row.attempts > limit)
    throw new UserError('Trop de demandes. Réessayez dans dix minutes.', 429);
}

export async function authenticated(): Promise<Account | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !tokenInput.safeParse(token).success) return null;
  const [user] = await db()<
    Account[]
  >`select a.id,a.email from logins l join accounts a on a.id=l.account_id
    where l.token_hash=${digest(token)} and l.expires>now() and a.verified_at is not null`;
  return user ?? null;
}

export async function login(input: unknown) {
  const { email, password } = z
    .object({ email: emailInput, password: z.string().min(1).max(256) })
    .parse(input);
  await rateLimit('login:' + digest(email), 15);
  const sql = db();
  const [user] =
    await sql`select id,password_hash from accounts where email=${email} and verified_at is not null`;
  const [salt, hash] = (user?.password_hash || 'mijo-dummy:' + '00'.repeat(64)).split(':');
  const key = (await stretch(password, salt, 64)) as Buffer;
  if (!timingSafeEqual(key, Buffer.from(hash, 'hex')) || !user)
    throw new UserError('Adresse ou mot de passe incorrect, ou adresse à confirmer.', 401);
  const token = randomBytes(32).toString('hex');
  await sql.begin(async (tx) => {
    const [valid] =
      await tx`select id from accounts where id=${user.id} and password_hash=${user.password_hash} for update`;
    if (!valid) throw new UserError('Le mot de passe a changé. Reconnectez-vous.', 401);
    await tx`delete from logins where expires<=now()`;
    await tx`insert into logins(token_hash,account_id,expires) values(${digest(token)},${user.id},now()+interval '30 days')`;
    await tx`delete from auth_limits where bucket=${'login:' + digest(email)}`;
  });
  const jar = await cookies();
  const options = {
    sameSite: 'lax' as const,
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: 2592000,
  };
  jar.set(cookieName, token, { ...options, httpOnly: true });
  // Public identifier for clearing stale tabs and offline copies; never used to authenticate.
  jar.set('mijo_notebook', user.id, options);
}

export async function requestLink(purpose: Purpose, input: unknown) {
  const { email } = z.object({ email: emailInput }).parse(input);
  const password =
    purpose === 'verify' ? z.object({ password: passwordInput }).parse(input).password : null;
  await rateLimit('mail:' + purpose + ':' + digest(email), 5);
  await rateLimit('mail:total', 200);
  const pendingHash = password === null ? null : await hashPassword(password);
  const token = randomBytes(32).toString('hex');
  const sql = db();
  const issued = await sql.begin(async (tx) => {
    if (purpose === 'verify')
      await tx`insert into accounts(email) values(${email}) on conflict(email) do nothing`;
    const [account] = await tx`select id,verified_at from accounts where email=${email} for update`;
    if (!account || (purpose === 'verify' ? !!account.verified_at : !account.verified_at))
      return false;
    await tx`delete from account_tokens where expires<=now()`;
    await tx`insert into account_tokens(digest,account_id,purpose,pending_hash,expires)
      values(${digest(token)},${account.id},${purpose},${pendingHash},now()+interval '30 minutes')`;
    return true;
  });
  if (issued) {
    try {
      await sendAccountMail(email, purpose, token);
    } catch (e) {
      await sql`delete from account_tokens where digest=${digest(token)}`;
      throw e;
    }
  }
}

export async function consumeLink(purpose: Purpose, input: unknown) {
  const { token } = z.object({ token: tokenInput }).parse(input);
  const password =
    purpose === 'reset' ? z.object({ password: passwordInput }).parse(input).password : null;
  const key = digest(token);
  await db().begin(async (tx) => {
    const [account] =
      await tx`select a.id,a.verified_at from accounts a join account_tokens t on a.id=t.account_id
      where t.digest=${key} and t.purpose=${purpose} and t.expires>now() for update of a`;
    const invalid = () =>
      new UserError('Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.', 400);
    if (!account || (purpose === 'verify' ? !!account.verified_at : !account.verified_at))
      throw invalid();
    const [link] =
      await tx`delete from account_tokens where digest=${key} and purpose=${purpose} and expires>clock_timestamp() returning pending_hash`;
    if (!link) throw invalid();
    const hash = password === null ? link.pending_hash : await hashPassword(password);
    await tx`update accounts set password_hash=${hash}, verified_at=coalesce(verified_at,now()) where id=${account.id}`;
    await tx`insert into preferences(account_id,id,data) values(${account.id},1,'{"hello":0}') on conflict(account_id,id) do nothing`;
    await tx`delete from account_tokens where account_id=${account.id}`;
    await tx`delete from logins where account_id=${account.id}`;
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db()`delete from logins where token_hash=${digest(token)}`;
  jar.delete(cookieName);
  jar.delete('mijo_notebook');
}
