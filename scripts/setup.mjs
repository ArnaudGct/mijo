import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const database = randomBytes(24).toString('hex');
writeFileSync(
  '.env',
  [
    'POSTGRES_PASSWORD=' + database,
    'DATABASE_URL=postgres://table:' + database + '@127.0.0.1:55439/table',
    'MIJO_OWNER_EMAIL=',
    'SMTP_URL=smtp://127.0.0.1:1027',
    'MAIL_FROM="Mijo <carnet@mijo.test>"',
    'APP_ORIGIN=http://localhost:3180',
    'MEDIA_DIR=./data/media',
  ].join('\n') + '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log('Configuration locale créée.');
