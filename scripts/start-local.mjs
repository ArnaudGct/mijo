import { cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw Error('Configurez la base avant de démarrer.');
await cp('public', '.next/standalone/public', { recursive: true });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
const proc = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MEDIA_DIR: resolve(process.env.MEDIA_DIR || 'data/media'),
    HOSTNAME: '127.0.0.1',
    PORT: process.env.PORT || new URL(process.env.APP_ORIGIN).port || '3180',
  },
});
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => proc.kill(sig));
proc.on('exit', (code) => (process.exitCode = code ?? 0));
