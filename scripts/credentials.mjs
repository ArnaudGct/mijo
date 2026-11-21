import { writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
if (!process.argv[2]) throw Error('Indiquez un fichier privé de destination.');
const password = randomBytes(24).toString('base64url'),
  salt = randomBytes(24).toString('hex');
await writeFile(
  process.argv[2],
  JSON.stringify({ password, hash: salt + ':' + scryptSync(password, salt, 64).toString('hex') }) +
    '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log('Accès créé dans le fichier privé indiqué.');
