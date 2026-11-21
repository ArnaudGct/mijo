import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { existsSync } from 'node:fs';
if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL requise');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(61488514)`;
    await tx`create table if not exists schema_migrations(name text primary key, digest text not null)`;
    for (const name of (await readdir('db/migrations')).filter((n) => n.endsWith('.sql')).sort()) {
      const contents = await readFile('db/migrations/' + name, 'utf8'),
        digest = createHash('sha256').update(contents).digest('hex');
      const [old] = await tx`select digest from schema_migrations where name=${name}`;
      if (old) {
        if (old.digest !== digest) throw Error('Migration modifiée après application : ' + name);
        continue;
      }
      await tx.unsafe(contents);
      await tx`insert into schema_migrations values(${name},${digest})`;
      console.log(name);
    }
  });
} finally {
  await sql.end();
}
