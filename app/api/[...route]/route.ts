import { withAccount } from '@/lib/account-scope';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { storePhoto, mediaDir } from '@/lib/media';
import { db, state } from '@/lib/db';
import { authenticated, login, logout, requestLink, consumeLink } from '@/lib/auth';
import { mutate, UserError } from '@/lib/commands';
import { backup, restore } from '@/lib/backup';
import { discoverPage, discoveryQuery, searchPreview } from '@/lib/discovery-search';
import { cachedDiscovery, discoveryFeed } from '@/lib/discovery-feed';
import { previewUrl } from '@/lib/web-import';
import { readProductCode } from '@/lib/product-scan';
import { lookupProduct } from '@/lib/product-lookup';
import { localObservations } from '@/lib/open-prices';
import { syncChecks } from '@/lib/offline';
import { archivePages } from '@/lib/archive';
import { importBatch } from '@/lib/import-db';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ route: string[] }> };
const headers = { 'Cache-Control': 'private, no-store' };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
async function bytes(req: Request, max: number) {
  if (Number(req.headers.get('content-length')) > max)
    throw new UserError('Fichier trop volumineux.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new UserError('Requête vide.');
  const list: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    n += r.value.length;
    if (n > max) {
      await reader.cancel();
      throw new UserError('Taille maximale dépassée.', 413);
    }
    list.push(r.value);
  }
  return Buffer.concat(list);
}
function error(e: unknown) {
  if (e instanceof UserError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json(
      {
        error:
          'Valeur invalide : ' +
          e.issues
            .slice(0, 3)
            .map((x) => x.path.join('.') + ' ' + x.message)
            .join(', '),
      },
      400,
    );
  return json({ error: 'Opération impossible. Vérifiez les données et la connexion.' }, 400);
}
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const path = (await ctx.params).route.join('/');
    if (path === 'health') {
      try {
        await db()`select id from accounts limit 1`;
        return json({ ok: true });
      } catch {
        return json({ ok: false }, 503);
      }
    }
    const account = await authenticated();
    if (!account) return json({ error: 'Connexion requise.' }, 401);
    const expected = _req.headers.get('X-Mijo-Account');
    if (expected && expected !== account.id)
      return json({ error: 'Le compte a changé. Rechargez la page.' }, 409);
    return await withAccount(account.id, async () => {
      if (path === 'discoveries') return json(await discoveryFeed());
      if (path === 'state') return json(await state());
      if (path === 'export')
        return new Response(JSON.stringify(await backup()), {
          headers: {
            ...headers,
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="mijo.json"',
          },
        });
      if (/^media\/[a-f0-9-]{36}\.webp$/.test(path)) {
        try {
          return new Response(new Uint8Array(await readFile(join(mediaDir(), path.slice(6)))), {
            headers: { ...headers, 'content-type': 'image/webp' },
          });
        } catch {
          return json({ error: 'Image introuvable.' }, 404);
        }
      }
      return json({}, 404);
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!process.env.APP_ORIGIN || req.headers.get('origin') !== process.env.APP_ORIGIN)
      return json({ error: 'Origine refusée.' }, 403);
    const path = (await ctx.params).route.join('/');
    const body = async (max = 200000) => JSON.parse((await bytes(req, max)).toString('utf8'));
    if (['login', 'register', 'forgot', 'verify', 'reset'].includes(path)) {
      const data = await body(3000);
      if (path === 'login') await login(data);
      if (path === 'register') await requestLink('verify', data);
      if (path === 'forgot') await requestLink('reset', data);
      if (path === 'verify') await consumeLink('verify', data);
      if (path === 'reset') await consumeLink('reset', data);
      return json({ ok: true });
    }
    const account = await authenticated();
    if (!account) return json({ error: 'Connexion requise.' }, 401);
    const expected = req.headers.get('X-Mijo-Account');
    if ((expected || path === 'checks') && expected !== account.id)
      return json({ error: 'Le compte a changé. Rechargez la page.' }, 409);
    return await withAccount(account.id, async () => {
      if (path === 'logout') {
        await logout();
        return json({ ok: true });
      }
      if (path === 'discoveries/search') {
        const q = discoveryQuery.parse(await body(6000));
        try {
          return json(await discoverPage(q));
        } catch {
          return json(
            { error: 'La recherche est momentanément indisponible. Réessayez dans un instant.' },
            503,
          );
        }
      }
      if (path === 'week') {
        // Installed clients used to request generation on every calendar visit.
        z.iso.date().parse((await body(500)).week);
        return json({ changed: false });
      }
      if (path === 'checks') return json(await syncChecks(await body()));
      if (path === 'command') {
        const v = await body(800000);
        return json(await mutate(z.number().int().parse(v.revision), v.command));
      }
      if (path === 'product') {
        const code = readProductCode(
          z
            .string()
            .max(80)
            .parse((await body(500)).barcode),
        );
        if (!code) throw new UserError('Code produit invalide.');
        try {
          return json({ product: await lookupProduct(code.barcode) });
        } catch {
          return json({ error: 'Catalogue indisponible. Choisissez un article de la liste.' }, 503);
        }
      }
      if (path === 'observations') {
        const v = await body(1000);
        return json({ rows: await localObservations(v.barcode) });
      }
      if (path === 'url') {
        const v = await body(4000);
        try {
          const url = z.string().max(3000).parse(v.url);
          const data = searchPreview(url) ?? cachedDiscovery(url);
          return json(data ? { data, warning: '', original: url } : await previewUrl(url));
        } catch {
          return json({ error: 'Adresse HTTPS publique requise.' }, 400);
        }
      }
      if (path === 'archive-preview' || path === 'archive-apply') {
        const rows = await archivePages(
          await bytes(req, 24 * 1024 * 1024),
          path === 'archive-apply',
        );
        return json({
          ...(await importBatch(rows, path === 'archive-apply')),
          rows: rows.map((r) => ({ title: r.data.title, issues: r.issues })),
        });
      }
      if (path === 'restore') return json(await restore(await body(64 * 1024 * 1024)));
      if (path === 'media') {
        const source = await bytes(req, 8 * 1024 * 1024);
        return json({ url: await storePhoto(source) });
      }
      return json({}, 404);
    });
  } catch (e) {
    return error(e);
  }
}
