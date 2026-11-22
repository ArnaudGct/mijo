import { test, expect } from '@playwright/test';
import { today, monday, addDays } from '../lib/dates';
const week = addDays(monday(today()), 14);
const tuesday = addDays(week, 1);
test('parcours privé sur ordinateur et liste emportée sur mobile', async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  expect((await request.get('/api/state')).status()).toBe(401);
  await page.goto('/');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Mon tableau de bord' })).toBeVisible();
  const sidebar = await page.locator('aside').elementHandle();
  await page.getByRole('navigation').getByText('Recettes', { exact: true }).click();
  await expect(page).toHaveURL(/recettes/);
  expect(await sidebar!.evaluate((el) => el === document.querySelector('aside'))).toBe(true);
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titre', { exact: true }).fill('Tarte aux poireaux E2E');
  await dialog.getByRole('button', { name: '+ Ingrédient', exact: true }).click();
  await dialog.getByLabel('Ingrédient 1', { exact: true }).fill('Poireaux');
  await dialog.getByLabel('Quantité', { exact: true }).fill('150');
  await dialog.getByLabel('Unité', { exact: true }).fill('g');
  await dialog.getByRole('button', { name: '+ Étape', exact: true }).click();
  await dialog.getByLabel('Étape 1', { exact: true }).fill('Couper les poireaux.');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Planifier Tarte aux poireaux E2E' }).click();
  await dialog.getByLabel('Jour', { exact: true }).fill(week);
  await dialog.getByRole('button', { name: 'Ajouter au planning' }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/semaine?week=${week}`);
  await expect(page.locator(`[data-mealslot="${week}soir"] .scheduled`)).toContainText(
    'Tarte aux poireaux',
  );
  const source = page.locator(`[data-mealslot="${tuesday}midi"] .meal-card`);
  await source.dragTo(page.locator(`[data-mealslot="${tuesday}soir"]`));
  await expect(page.locator(`[data-mealslot="${tuesday}soir"] .scheduled`)).toContainText(
    'Tarte aux poireaux',
  );
  await page.getByRole('button', { name: 'Compléter la semaine' }).click();
  await page.getByRole('button', { name: 'Planifier', exact: true }).click();
  await dialog.getByLabel('Rechercher un plat ou un ingrédient').fill('poireaux');
  await dialog.getByRole('button', { name: /Tarte aux poireaux/ }).click();
  await expect(dialog.getByRole('button', { name: 'Ajouter au planning' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Batch cooking', exact: true }).click();
  await page.getByRole('button', { name: 'Regrouper des préparations', exact: true }).click();
  await dialog.getByLabel(/Tarte aux poireaux E2E/).check();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/cuisiner?week=${week}`);
  await page.getByLabel('Terminer étape 1').click();
  await expect(page.getByLabel('Terminer étape 1')).toBeChecked();
  await page.getByRole('button', { name: 'Terminer la préparation' }).click();
  await expect(page.getByRole('button', { name: 'Rouvrir la préparation' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/courses?week=${week}`);
  await expect(page.getByText('150 g', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Panier estimé' })).toBeVisible();
  for (const path of [
    '/',
    '/recettes',
    `/semaine?week=${week}`,
    `/cuisiner?week=${week}`,
    '/parametres',
    `/courses?week=${week}`,
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
  await page.getByRole('button', { name: 'Emporter hors ligne' }).click();
  await expect(page).toHaveURL(/courses-hors-ligne/);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('checkbox', { name: /Poireau/ }).check();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Synchroniser les coches' }).click();
  await expect(page.getByRole('status')).toContainText(/synchronis/);
  await page.goto(`/courses?week=${week}`);
  await expect(page.getByLabel('Acheté · Poireau')).toBeChecked();
  await page.goto('/semaine?week=' + week);
  const movedMeal = page.locator(`[data-mealslot="${tuesday}soir"]`);
  await movedMeal.getByRole('button', { name: /^Retirer / }).click();
  await expect(movedMeal.locator('.scheduled')).toHaveCount(0);
  await page.reload();
  await expect(movedMeal.getByRole('button', { name: '+ Recette' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByLabel('Mot de passe')).toBeVisible();
  expect(errors).toEqual([]);
});
test('import corrigé, édition, archives, restauration et suppression sur téléphone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recettes');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Importer une URL' }).click();
  // L’extraction réseau réelle est contrôlée séparément par check-sources.ts.
  await page.route('**/api/url', (route) =>
    route.fulfill({
      json: {
        data: {
          title: 'Soupe de vérification',
          description: '',
          image: '',
          source: 'Fixture E2E',
          url: 'https://example.org/test-soupe',
          rights: 'Fixture',
          base: 2,
          prep: null,
          cook: null,
          total: null,
          difficulty: '',
          tags: [],
          diet: '',
          cuisine: '',
          batch: false,
          equipment: [],
          ingredients: [
            {
              name: 'Poireau',
              raw: '1 poireau',
              quantity: 1,
              unit: 'pièce',
              category: 'Fruits et légumes',
            },
          ],
          steps: [{ text: 'Cuire le poireau.', image: '' }],
          nutrition: '',
          notes: '',
          rating: 0,
          favorite: false,
          verified: false,
        },
        warning: '',
      },
    }),
  );
  await dialog.getByLabel('Adresse de la recette').fill('https://example.org/test-soupe');
  await dialog.getByRole('button', { name: 'Prévisualiser la recette' }).click();
  await expect(dialog.getByLabel('Titre', { exact: true })).toHaveValue('Soupe de vérification');
  await dialog.getByLabel('Titre', { exact: true }).fill('Soupe corrigée E2E');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Rechercher une recette').fill('Soupe corrigée E2E');
  await page.getByRole('button', { name: 'Ouvrir Soupe corrigée E2E' }).click();
  await dialog.getByRole('button', { name: 'Modifier', exact: true }).click();
  await dialog.getByLabel('Portions de référence').fill('3');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Ouvrir Soupe corrigée E2E' }).click();
  await expect(dialog.getByText('3 portions', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dupliquer' }).click();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Ouvrir Soupe corrigée E2E (copie)', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByRole('button', { name: 'Archives', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ouvrir Soupe corrigée E2E (copie)', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await page.getByRole('button', { name: 'Toutes', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ouvrir Soupe corrigée E2E (copie)', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByRole('button', { name: 'Archives', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ouvrir Soupe corrigée E2E (copie)', exact: true })
    .click();
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Aucune recette dans cette sélection')).toBeVisible();
});
test('panier estimé, livraison et fusion des variantes sur mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courses?week=2030-01-07');
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Article', exact: true }).click();
  await dialog.getByLabel('Ingrédient', { exact: true }).fill('Riz E2E');
  await dialog.getByLabel('Quantité', { exact: true }).fill('350');
  await dialog.getByLabel('Unité', { exact: true }).fill('g');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.grocery').filter({ hasText: 'Riz E2E' }).locator('.line-price'),
  ).toContainText('€');
  for (const name of ['Oignon rouge', 'Oignons jaunes']) {
    await page.getByRole('button', { name: 'Article', exact: true }).click();
    await dialog.getByLabel('Ingrédient', { exact: true }).fill(name);
    await dialog.getByLabel('Quantité', { exact: true }).fill('1');
    await dialog.getByLabel('Unité', { exact: true }).fill('pièce');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0);
  }
  const onions = page
    .locator('.grocery')
    .filter({ has: page.getByText('Oignon', { exact: true }) });
  await expect(onions).toHaveCount(1);
  await expect(onions).toContainText('2 pièce');
  await page.getByLabel('Inclure la livraison').check();
  await expect(page.getByText('Minimum de commande non atteint.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Magasin du panier')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
