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
  const types = page.getByRole('combobox', { name: 'Type de recette' });
  const filters = page.getByRole('button', { name: 'Filtres', exact: true });
  await expect(page.getByRole('button', { name: 'Plats', exact: true })).toHaveCount(0);
  await expect(types).toHaveCount(0);
  await filters.click();
  await expect(types).toHaveValue('main');
  const titles = page.locator('.discovery-cards .card-title');
  await expect(titles).toHaveText([main.title]);
  for (const [label, item] of [
    ['Desserts', dessert],
    ['Entrées', starter],
  ] as const) {
    await types.selectOption({ label });
    await expect(titles).toHaveText([item.title]);
  }
  expect(requests).toEqual(expect.arrayContaining(['main:0', 'dessert:0', 'starter:0']));
  await page.route('**/api/discoveries/search', (route) =>
    route.fulfill({ status: 503, json: { error: 'indisponible' } }),
  );
  await page.reload();
  await expect(types).toHaveCount(0);
  await filters.click();
  await expect(types).toHaveValue('main');
  const mainTitles = seed.filter((c) => c.course === 'main').map((c) => c.title);
  await expect(titles).toHaveText(
    mainTitles.filter(
      (title, i) =>
        mainTitles.findIndex((t) => t.localeCompare(title, 'fr', { sensitivity: 'base' }) === 0) ===
        i,
    ),
  );
  await types.selectOption({ label: 'Desserts' });
  await expect(titles).toHaveText(seed.filter((c) => c.course === 'dessert').map((c) => c.title));
});

test('les sources vérifiées, la découverte et l’ajout explicite au carnet', async ({ page }) => {
  await page.route('**/api/discoveries/search', (r) =>
    r.fulfill({ json: { cards: seed, next: null, total: seed.length } }),
  );
  await page.goto('/recettes?week=2020-01-06');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await page.getByRole('button', { name: 'Importer une URL' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Sites compatibles (6 vérifiés)').click();
  await expect(dialog.locator('.import-sites a')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Suggestions', exact: true }).click();
  const types = page.getByRole('combobox', { name: 'Type de recette' });
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await types.selectOption({ label: 'Desserts' });
  const first = page.locator('.discovery-cards .card-title').first();
  await expect(page.locator('.discovery-cards .recipe-price').first()).toContainText('€/portion');
  await expect(page.locator('.discovery-cards .recipe-price').first()).toHaveText(/^≈/);
  const savedTitle = await first.innerText();
  const card = seed.find((x) => x.title === savedTitle)!;
  const data = {
    ...blankRecipe(),
    title: savedTitle,
    url: card.url,
    source: card.publisher,
    base: 2,
    ingredients: [parseLine('Carotte | 2 | pièce'), parseLine('Produit inconnu | 1 | g')],
    steps: [{ text: 'Cuire les carottes.', image: '' }],
  };
  await page.route('**/api/url', (r) => r.fulfill({ json: { data, warning: '' } }));
  await first.click();
  await expect(dialog.getByText('Cuire les carottes.')).toBeVisible();
  await expect(dialog.locator('.recipe-price')).toContainText('pour 2 portions');
  await expect(dialog.locator('.price-coverage')).toHaveText('1/2 ingrédients chiffrés');
  await expect(dialog.locator('.price-coverage')).toHaveCSS('display', 'block');
  const partialPrice = await dialog.locator('.recipe-price').innerText();
  expect(partialPrice).toMatch(/^≈.*\/portion\n1\/2 ingrédients chiffrés$/);
  await expect(dialog.locator('.recipe-actions')).toHaveCSS(
    'gap',
    await page.locator('.page-heading .actions').evaluate((el) => getComputedStyle(el).gap),
  );
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
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await expect(types).toHaveValue('');
  await types.selectOption({ label: 'Plats' });
  await expect(page.getByRole('button', { name: savedTitle, exact: true })).toHaveCount(0);
  await types.selectOption({ label: 'Desserts' });
  await expect(page.getByRole('button', { name: savedTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await expect(types).toHaveCount(0);
  await expect(
    page
      .locator('.recipe-card')
      .filter({
        has: page.getByRole('button', { name: savedTitle, exact: true }),
      })
      .locator('.recipe-price'),
  ).toHaveText(partialPrice, { useInnerText: true });
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
  await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('Croziflette');
  await expect(cards).toHaveCount(1);
  expect(offsets).toContain(3);
  await cards.getByRole('button', { name: 'Écarter Croziflette' }).click();
  await expect(cards).toHaveCount(0);
  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Croziflette' })).toHaveCount(0);
});

test('les deux panneaux partagent leurs filtres et une recherche VG peut cibler HelloFresh', async ({
  page,
}) => {
  const requests: Record<string, string | number>[] = [];
  await page.route('**/api/discoveries/search', (r) => {
    requests.push(r.request().postDataJSON());
    return r.fulfill({ json: { cards: [], next: null, total: 0 } });
  });
  await page.goto('/recettes?week=2020-01-06');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  for (const section of ['Mon carnet', 'Suggestions']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByLabel('Alimentation')).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtres', exact: true }).click();
    for (const label of [
      'Durée maximale',
      'Cuisine',
      'Ingrédient',
      'Alimentation',
      'Difficulté',
      'Source',
    ])
      await expect(
        page.getByRole(label === 'Cuisine' || label === 'Ingrédient' ? 'textbox' : 'combobox', {
          name: label,
          exact: true,
        }),
      ).toBeVisible();
    await page.getByLabel('Alimentation').selectOption({ label: 'Végétarien (VG)' });
    if (section === 'Mon carnet') {
      const top = (await page.getByLabel('Batch cooking', { exact: true }).boundingBox())!;
      const bottom = (await page.getByLabel('Déjà réalisées').boundingBox())!;
      expect(top.x).toBe(bottom.x);
      expect(top.y + top.height).toBeLessThan(bottom.y);
    }
  }
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('HelloFresh');
  await page.getByLabel('Durée maximale').selectOption('30');
  await page.getByLabel('Ingrédient', { exact: true }).fill('tofu');
  await page.getByLabel('Tri des recettes').selectOption('name');
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({
      offset: 0,
      diet: 'Végétarien',
      publisher: 'HelloFresh',
      minutes: 30,
      ingredient: 'tofu',
      order: 'name',
    });
  await expect(page.locator('.discovery-cards article')).toHaveCount(0);
});
