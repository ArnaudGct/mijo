import { cookies } from 'next/headers';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db';
import { UserError } from './commands';
const stretch = promisify(scrypt),
  name = 'table_session',
  digest = (v: string) => createHash('sha256').update(v).digest('hex');
export async function authenticated() {
  const token = (await cookies()).get(name)?.value;
  if (!token || !/^\w{64}$/.test(token)) return false;
  const rows = await db()`select 1 from logins where token_hash=${digest(token)} and expires>now()`;
  return rows.length === 1;
}
export async function login(password: string) {
  const conf = process.env.APP_PASSWORD_HASH ?? '';
  const [salt, hash] = conf.split(':');
  if (!salt || !hash?.match(/^[a-f0-9]{128}$/))
    throw new UserError('Accès privé à configurer sur le serveur.', 503);
  const sql = db();
  const [r] =
    await sql`insert into login_limit values(1,now(),1) on conflict(id) do update set since=case when login_limit.since<now()-interval '10 minutes' then now() else login_limit.since end, attempts=case when login_limit.since<now()-interval '10 minutes' then 1 else login_limit.attempts+1 end returning attempts`;
  if (r.attempts > 12) throw new UserError('Trop de tentatives. Réessayez dans dix minutes.', 429);
  const computed = (await stretch(password, salt, 64)) as Buffer;
  if (!timingSafeEqual(computed, Buffer.from(hash, 'hex')))
    throw new UserError('Mot de passe incorrect.', 401);
  const token = randomBytes(32).toString('hex');
  await sql.begin(async (tx) => {
    await tx`delete from login_limit where id=1`;
    await tx`delete from logins where expires<=now()`;
    await tx`insert into logins values(${digest(token)},now()+interval '30 days')`;
  });
  (await cookies()).set(name, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: 2592000,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(name)?.value;
  if (token) await db()`delete from logins where token_hash=${digest(token)}`;
  jar.delete(name);
}
