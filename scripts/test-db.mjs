import postgres from 'postgres';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const url = new URL(process.env.TEST_POSTGRES_ADMIN_URL || process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw Error('Les tests nécessitent un PostgreSQL local isolé.');
const root = postgres(url.href, { max: 1 });
const dbName = 'table_test_' + randomBytes(8).toString('hex');
const temp = await mkdtemp(join(tmpdir(), 'table-test-'));
const password = randomBytes(20).toString('hex'),
  salt = randomBytes(20).toString('hex');
function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Échec de ' + cmd + ' (' + code + ')')),
    );
  });
}
let created = false;
try {
  await root`create database ${root(dbName)}`;
  created = true;
  url.pathname = '/' + dbName;
  const env = {
    ...process.env,
    DATABASE_URL: url.href,
    MEDIA_DIR: temp,
    APP_ORIGIN: 'http://127.0.0.1:3181',
    TABLE_TEST_PASSWORD: password,
    APP_PASSWORD_HASH: salt + ':' + scryptSync(password, salt, 64).toString('hex'),
    TABLE_TEST_DATABASE: dbName,
  };
  await run(process.execPath, ['scripts/migrate.mjs'], env);
  if (process.argv[2] === 'e2e') await run('npx', ['--no-install', 'playwright', 'test'], env);
  else
    await run(
      process.execPath,
      ['--import', 'tsx', '--test', 'tests/postgres.integration.ts'],
      env,
    );
} finally {
  if (created) await root`drop database ${root(dbName)} with (force)`;
  await root.end();
  await rm(temp, { recursive: true, force: true });
}
