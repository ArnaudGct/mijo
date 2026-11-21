import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
if (existsSync('.env')) throw Error('Le fichier .env existe déjà.');
const random = () => randomBytes(24).toString('hex');
const salt = random(),
  password = random(),
  database = random();
mkdirSync('data/private', { recursive: true, mode: 0o700 });
writeFileSync('data/private/mot-de-passe.txt', password + '\n', { mode: 0o600, flag: 'wx' });
writeFileSync(
  '.env',
  [
    'POSTGRES_PASSWORD=' + database,
    'DATABASE_URL=postgres://table:' + database + '@127.0.0.1:55439/table',
    'APP_PASSWORD_HASH=' + salt + ':' + scryptSync(password, salt, 64).toString('hex'),
    'APP_ORIGIN=http://localhost:3180',
    'MEDIA_DIR=./data/media',
  ].join('\n') + '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log('Configuration créée. Mot de passe local dans data/private/mot-de-passe.txt');
