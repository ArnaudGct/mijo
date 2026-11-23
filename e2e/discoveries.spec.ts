import { test, expect } from '@playwright/test';
import { blankRecipe } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import seed from '../lib/discovery-seed.json' with { type: 'json' };

test('les plats sont sélectionnés dès l’accueil et chaque catégorie garde ses propres résultats', async ({
  page,
}) => {
  const requests: string[] = [];
  const main = seed.find((c) => c.course === 'main')!;
  const starter = seed.find((c) => c.course === 'starter')!;
  const dessert = seed.find((c) => c.course === 'dessert')!;
  await page.route('**/api/discoveries/search', (route) => {
    const { course, offset } = route.request().postDataJSON();
    requests.push(course + ':' + offset);
    return route.fulfill({ json: { cards: [dessert, main, starter], next: null, total: 3 } });
  });
  await page.goto('/?week=2020-01-06');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.locator('.hero h2')).toHaveText(main.title);
  await page.getByRole('link', { name: 'Tout voir', exact: true }).last().click();
  const types = page.getByRole('group', { name: 'Type de recette' });
  await expect(types.getByRole('button', { name: 'Plats' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const titles = page.locator('.discovery-cards .card-title');
  await expect(titles).toHaveText([main.title]);
  for (const [label, item] of [
    ['Desserts', dessert],
    ['Entrées', starter],
  ] as const) {
    await types.getByRole('button', { name: label }).click();
    await expect(titles).toHaveText([item.title]);
  }
  expect(requests).toEqual(expect.arrayContaining(['main:0', 'dessert:0', 'starter:0']));
  await page.route('**/api/discoveries/search', (route) =>
    route.fulfill({ status: 503, json: { error: 'indisponible' } }),
  );
  await page.reload();
  await expect(types.getByRole('button', { name: 'Plats' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(titles).toHaveText(seed.filter((c) => c.course === 'main').map((c) => c.title));
  await types.getByRole('button', { name: 'Desserts' }).click();
  await expect(titles).toHaveText(seed.filter((c) => c.course === 'dessert').map((c) => c.title));
});

test('les sources vérifiées, la découverte et l’ajout explicite au carnet', async ({ page }) => {
  await page.route('**/api/discoveries/search', (r) =>
    r.fulfill({ json: { cards: seed.slice(0, 15), next: null, total: 15 } }),
  );
  await page.goto('/recettes?week=2020-01-06');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await page.getByRole('button', { name: 'Importer une URL' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Sites compatibles (5 vérifiés)').click();
  await expect(dialog.locator('.import-sites a')).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Suggestions', exact: true }).click();
  const first = page.locator('.discovery-cards .card-title').first();
  const savedTitle = await first.innerText();
  const card = seed.find((x) => x.title === savedTitle)!;
  const data = {
    ...blankRecipe(),
    title: savedTitle,
    url: card.url,
    source: card.publisher,
    base: 2,
    ingredients: [parseLine('Carotte | 2 | pièce')],
    steps: [{ text: 'Cuire les carottes.', image: '' }],
  };
  await page.route('**/api/url', (r) => r.fulfill({ json: { data, warning: '' } }));
  await first.click();
  await expect(dialog.getByText('Cuire les carottes.')).toBeVisible();
  const inCarnet = async () =>
    (await (await page.request.get('/api/state')).json()).recipes.filter(
      (r: { data: { url: string } }) => r.data.url === card.url,
    ).length;
  expect(await inCarnet()).toBe(0);
  await dialog.getByRole('button', { name: 'Ajouter à mon carnet' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await inCarnet()).toBe(1);
  await expect(page.locator('.card-title').filter({ hasText: savedTitle })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mon carnet', exact: true }).click();
  await expect(page.getByRole('button', { name: savedTitle, exact: true })).toBeVisible();
  await page.goto('/?week=2020-01-06');
  await page.locator('.hero').getByRole('button', { name: 'Voir la recette' }).click();
  await expect(dialog.getByRole('link').first()).not.toHaveAttribute('href', card.url);

  const state = await (await page.request.get('/api/state')).json();
  const row = state.recipes.find((r: { data: { url: string } }) => r.data.url === card.url);
  for (const command of [
    { action: 'archive', id: row.id, archived: true },
    { action: 'deleteRecipe', id: row.id, confirm: true },
  ]) {
    const { revision } = await (await page.request.get('/api/state')).json();
    expect(
      (
        await page.request.post('/api/command', {
          data: { revision, command },
          headers: { Origin: new URL(page.url()).origin },
        })
      ).ok(),
    ).toBeTruthy();
  }
});

test('la suite interroge le catalogue, les filtres repartent de zéro et une suggestion écartée reste masquée', async ({
  page,
}) => {
  const offsets: number[] = [];
  await page.route('**/api/discoveries/search', (route) => {
    const q = route.request().postDataJSON();
    offsets.push(q.offset);
    const cards = q.query
      ? seed.filter((c) => c.title === 'Croziflette')
      : seed.slice(q.offset, q.offset + 3);
    return route.fulfill({
      json: { cards, next: q.query ? null : q.offset + 3, total: seed.length },
    });
  });
  await page.goto('/recettes?onglet=suggestions&week=2020-01-06');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  const cards = page.locator('.discovery-cards article');
  await expect(cards).toHaveCount(3);
  await page.getByRole('button', { name: 'Afficher plus de recettes' }).click();
  await expect(cards).toHaveCount(6);
  await page.getByLabel('Recette ou ingrédient').fill('Croziflette');
  await expect(cards).toHaveCount(1);
  expect(offsets).toContain(3);
  await cards.getByRole('button', { name: 'Écarter Croziflette' }).click();
  await expect(cards).toHaveCount(0);
  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Croziflette' })).toHaveCount(0);
});
