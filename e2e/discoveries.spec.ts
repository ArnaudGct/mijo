import { test, expect } from '@playwright/test';
import { blankRecipe } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import seed from '../lib/discovery-seed.json' with { type: 'json' };

test('les sources vérifiées, la découverte et l’ajout explicite au carnet', async ({ page }) => {
  await page.route('**/api/discoveries', (r) => r.fulfill({ json: [] }));
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
