import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { blankRecipe } from '../lib/model';

const origin = 'http://127.0.0.1:3181';
async function mailLink(request: APIRequestContext, email: string, action: 'verify' | 'reset') {
  const mailpit = 'http://127.0.0.1:8025/api/v1';
  let link: URL | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(mailpit + '/search', { params: { query: 'to:' + email } });
      const list = await res.json();
      for (const summary of list.messages) {
        const message = await (await request.get(mailpit + '/message/' + summary.ID)).json();
        const candidate = message.Text.match(
          /http:\/\/127\.0\.0\.1:3181\/compte\?action=(verify|reset)#[a-f0-9]{64}/,
        )?.[0];
        if (candidate && new URL(candidate).searchParams.get('action') === action) {
          link = new URL(candidate);
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return link!;
}

test('compte confirmé, carnets et photos indépendants, récupération par e-mail', async ({
  page,
  request,
  playwright,
}) => {
  const email = 'mijo-' + randomUUID() + '@example.test';
  const password = randomBytes(20).toString('hex');
  const laterPassword = randomBytes(20).toString('hex');
  const post = (client: APIRequestContext, path: string, data: unknown) =>
    client.post('/api/' + path, { headers: { Origin: origin }, data });
  await page.goto('/');
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await expect(page.getByRole('heading', { name: 'Créer mon compte' })).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(email.toUpperCase());
  await page.getByLabel('Choisissez votre mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('status')).toContainText('boîte mail');
  expect((await post(request, 'login', { email, password })).status()).toBe(401);
  const activation = await mailLink(request, email, 'verify');
  await page.goto(activation.href);
  await page.getByRole('button', { name: 'Confirmer mon adresse e-mail' }).click();
  await expect(page.getByRole('status')).toContainText('confirmée');
  expect((await post(request, 'verify', { token: activation.hash.slice(1) })).ok()).toBe(false);
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Mon tableau de bord' })).toBeVisible();
  const first = page.request;
  const getState = async (client: APIRequestContext) => (await client.get('/api/state')).json();
  const initial = await getState(first);
  expect(initial.recipes).toHaveLength(0);
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#bb624d' } })
    .png()
    .toBuffer();
  const uploaded = await first.post('/api/media', {
    data: photo,
    headers: { Origin: origin, 'Content-Type': 'image/png' },
  });
  expect(uploaded.ok()).toBe(true);
  const { url } = await uploaded.json();
  const add = await post(first, 'command', {
    revision: initial.revision,
    command: {
      action: 'recipe',
      data: { ...blankRecipe(), title: 'Mon carnet de test', image: url },
    },
  });
  expect(add.ok()).toBe(true);
  expect((await first.get(url)).status()).toBe(200);
  const own = (await getState(first)).recipes[0];
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (
        await post(other, 'login', {
          email: 'owner@mijo.test',
          password: process.env.TABLE_TEST_PASSWORD,
        })
      ).ok(),
    ).toBe(true);
    const second = await getState(other);
    expect(second.recipes.map((r: { id: string }) => r.id)).not.toContain(own.id);
    expect((await other.get(url)).status()).toBe(404);
    const exported = await (await other.get('/api/export')).json();
    expect(exported.versions.some((v: { recipe_id: string }) => v.recipe_id === own.id)).toBe(
      false,
    );
    const previousSession = await playwright.request.newContext({
      baseURL: origin,
      storageState: await page.context().storageState(),
    });
    try {
      await page.getByRole('button', { name: 'Se déconnecter' }).click();
      await page.getByRole('link', { name: 'Mot de passe oublié' }).click();
      await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
      await page.getByLabel('Adresse e-mail').fill(email);
      await page.getByRole('button', { name: 'Recevoir le lien' }).click();
      await expect(page.getByRole('status')).toContainText('réinitialisation');
      // A second device was logged in before the password was changed.
      expect((await post(previousSession, 'login', { email, password })).ok()).toBe(true);
      const reset = await mailLink(request, email, 'reset');
      await page.goto(reset.href);
      await page.getByLabel('Choisissez votre mot de passe').fill(laterPassword);
      await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
      await expect(page.getByRole('status')).toContainText('enregistré');
      expect((await previousSession.get('/api/state')).status()).toBe(401);
      expect((await post(request, 'reset', { token: reset.hash.slice(1), password })).ok()).toBe(
        false,
      );
      expect((await post(request, 'login', { email, password })).status()).toBe(401);
      expect((await post(request, 'login', { email, password: laterPassword })).ok()).toBe(true);
      expect((await getState(request)).recipes[0].id).toBe(own.id);
      expect((await other.get('/api/state')).ok()).toBe(true);
    } finally {
      await previousSession.dispose();
    }
  } finally {
    await other.dispose();
  }
});
