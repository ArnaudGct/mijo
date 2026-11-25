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
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
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
  await dialog.getByRole('button', { name: '+ Étape', exact: true }).click();
  await dialog.getByLabel('Étape 2', { exact: true }).fill('Faire revenir les poireaux.');
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
  await page.getByRole('button', { name: 'Planifier ma semaine' }).click();
  // The two existing portions were deliberately moved to two dinners.
  await expect(dialog.getByText('Aucun changement à proposer pour cette semaine.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toHaveCount(0);
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
  const method = page.getByRole('region', { name: 'Étapes de préparation' });
  await expect(method.locator('.cook-instruction')).toHaveText('Couper les poireaux.');
  await page.locator('.cook-subrecipe summary').first().click();
  await expect(page.locator('.cook-pantry dt').first()).toBeVisible();
  await page.getByRole('button', { name: 'Préparation suivante' }).click();
  await page.getByRole('button', { name: 'Changer de plat' }).click();
  await dialog.getByRole('button', { name: /Cuisine de la semaine/ }).click();
  await expect(page.locator('.cook-dish-name h2')).toHaveText('Cuisine de la semaine');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.cook-pantry dt').first()).toBeHidden();
  await expect(method.locator('.cook-instruction')).toBeInViewport();
  await page.getByLabel('Terminer étape 1').click();
  await expect(method.locator('.cook-instruction')).toHaveText('Faire revenir les poireaux.');
  await page.reload();
  await expect(method.locator('.cook-instruction')).toHaveText('Faire revenir les poireaux.');
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await expect(page.getByLabel('Terminer étape 1')).toBeChecked();
  await page.locator('.cook-outline summary').click();
  await expect(method.getByRole('button', { name: 'Monter la tâche' }).first()).toBeDisabled();
  await method.getByRole('button', { name: /Faire revenir les poireaux/ }).click();
  await expect(method.locator('.cook-instruction')).toHaveText('Faire revenir les poireaux.');
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
const testImport = test.extend({ serviceWorkers: 'block' });
testImport('import corrigé, édition, archives, restauration et suppression sur téléphone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recettes');
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
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
  await expect(dialog.locator('.recipe-price')).toContainText('3 portions');
  await expect(dialog.getByLabel('Portions pour les ingrédients')).toHaveValue('3');
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
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
  await dialog.getByLabel('Nom de l’article', { exact: true }).fill('Riz E2E');
  await dialog.getByLabel('Quantité', { exact: true }).fill('350');
  await dialog.getByLabel('Unité', { exact: true }).fill('g');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.grocery').filter({ hasText: 'Riz E2E' }).locator('.line-price'),
  ).toContainText('€');
  for (const name of ['Oignon rouge', 'Oignons jaunes']) {
    await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
    await dialog.getByLabel('Nom de l’article', { exact: true }).fill(name);
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
  const total = await page.locator('.basket-summary .large-money').innerText();
  await onions.getByRole('button', { name: 'Déjà chez moi · Oignon' }).click();
  await expect(
    onions.getByRole('button', { name: 'Remettre sur la liste · Oignon' }),
  ).toBeVisible();
  await expect(page.locator('.basket-summary .large-money')).not.toHaveText(total);
  await page.reload();
  await onions.getByRole('button', { name: 'Remettre sur la liste · Oignon' }).click();
  await expect(page.locator('.basket-summary .large-money')).toHaveText(total);
  await page.getByLabel('Inclure la livraison').check();
  await expect(page.getByText('Minimum de commande non atteint.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Magasin du panier')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
test('petit-déjeuner : portions modifiables, relevé en briques et en pots, report dans les courses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/courses?week=${week}&onglet=petit-dejeuner`);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/semaine' &&
      url.searchParams.get('week') === week &&
      url.searchParams.get('onglet') === 'petit-dejeuner',
  );
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Ma semaine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Planning des repas', exact: true }).click();
  await expect(page.locator('.calday')).toHaveCount(7);
  await page.getByRole('button', { name: 'Petit-déjeuner', exact: true }).click();
  await expect(page.locator('.calday')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Planifier', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Régler mon bol' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('group', { name: 'Flocons d’avoine' })
    .getByLabel('Par matin (g)')
    .fill('50');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const foods = page.locator('.breakfast-table article');
  await expect(foods).toHaveCount(5);
  await expect(foods.filter({ hasText: 'Flocons d’avoine' })).toContainText('350 g');
  await expect(foods.filter({ hasText: 'Skyr nature' })).toContainText('1 pot');
  await page.getByRole('button', { name: 'Relever mon stock' }).click();
  await dialog.getByLabel('Nombre de formats · Lait').fill('6');
  await dialog.getByLabel('Nombre de formats · Skyr nature').fill('3');
  await dialog.getByRole('button', { name: 'Enregistrer le relevé' }).click();
  await expect(foods.filter({ hasText: 'Skyr nature' })).toContainText('36 bols');
  await page.reload();
  await expect(foods.filter({ hasText: 'Lait' })).toContainText('Aucun achat');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Semaine suivante', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Petit-déjeuner', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Semaine précédente', exact: true }).click();
  await page.getByRole('link', { name: 'Voir ma liste de courses' }).click();
  await expect(page.getByRole('heading', { name: 'Mes courses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liste', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Petit-déjeuner', exact: true })).toHaveCount(0);
  await expect(
    page.locator('.grocery').filter({ has: page.getByText('Flocons d’avoine', { exact: true }) }),
  ).toHaveCount(1);
  const milk = page.locator('.grocery').filter({ has: page.getByText('Lait', { exact: true }) });
  await expect(milk).toHaveCount(1);
  await expect(milk).toContainText('En stock');
  await page.getByRole('button', { name: 'Placard', exact: true }).click();
  await page.getByRole('link', { name: 'Voir le stock du petit-déjeuner' }).click();
  await expect(foods.filter({ hasText: 'Skyr nature' })).toContainText('36 bols');
  await page.getByRole('button', { name: 'Personnaliser mon petit-déjeuner' }).click();
  await dialog.getByLabel('À partir du').fill(tuesday);
  await dialog.getByRole('button', { name: 'Remplacer Pomme', exact: true }).click();
  await dialog.getByLabel('Remplacer par').fill('Bananes');
  await dialog.getByRole('button', { name: 'Confirmer le remplacement' }).click();
  await dialog.getByRole('button', { name: 'Retirer Cannelle moulue' }).click();
  await dialog.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
  await dialog.getByLabel('Nouvel ingrédient').fill('Graines de chia');
  await dialog.getByLabel('Mesurer en').selectOption('g');
  await dialog.getByRole('button', { name: 'Ajouter au bol' }).click();
  await dialog
    .getByRole('group', { name: 'Graines de chia' })
    .getByLabel('Par matin (g)')
    .fill('8');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(foods.filter({ hasText: 'Banane' })).toContainText('6 pièces sur la période');
  await expect(foods.filter({ hasText: 'Graines de chia' })).toContainText('48 g sur la période');
  await page.reload();
  await page.getByRole('button', { name: 'Semaine suivante', exact: true }).click();
  await expect(foods.filter({ hasText: 'Pomme' })).toHaveCount(0);
  await expect(foods.filter({ hasText: 'Banane' })).toContainText('7 pièces sur la période');
  await page.getByRole('button', { name: 'Relever mon stock' }).click();
  await expect(dialog.getByLabel('Nombre de formats · Banane')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('link', { name: 'Voir ma liste de courses' }).click();
  await expect(
    page.locator('.grocery').filter({ has: page.getByText('Banane', { exact: true }) }),
  ).toHaveCount(1);
});
test('articles du quotidien, rayon personnalisé réutilisable, export et coches hors ligne', async ({
  page,
  context,
}) => {
  const shoppingWeek = '2031-03-03';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courses?week=' + shoppingWeek);
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  const dialog = page.getByRole('dialog');
  const add = page.getByRole('button', { name: 'Ajouter un article', exact: true });
  await add.click();
  await dialog.getByLabel('Nom de l’article').fill('Liquide vaisselle au citron');
  await expect(dialog.getByRole('combobox', { name: 'Rayon', exact: true })).toHaveValue(
    'Entretien et vaisselle',
  );
  await dialog.getByLabel('Quantité').fill('2');
  await dialog.getByLabel('Unité').fill('flacon');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const detergent = page.locator('.grocery').filter({ hasText: 'Liquide vaisselle au citron' });
  await expect(detergent.locator('.line-price')).toContainText('€');
  await add.click();
  await dialog.getByLabel('Nom de l’article').fill('Recharge de stylo');
  await dialog.getByRole('combobox', { name: 'Rayon', exact: true }).selectOption('');
  await dialog.getByLabel('Nom du nouveau rayon').fill('Bureau');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const office = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'Bureau', exact: true }) });
  await expect(office).toContainText('Recharge de stylo');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const download = await downloading;
  const contents = await (
    await import('node:fs/promises')
  ).readFile((await download.path())!, 'utf8');
  expect(contents).toMatch(/Bureau\n☐ Recharge de stylo/);
  await page.getByRole('button', { name: 'Emporter hors ligne' }).click();
  await expect(page.getByRole('heading', { name: 'Bureau', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('checkbox', { name: /Recharge de stylo/ }).check();
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('synchronisées');
  await page.goto('/courses?week=' + shoppingWeek);
  await expect(office.getByRole('checkbox')).toBeChecked();
  await office.getByRole('button', { name: /Retirer l’ajout/ }).click();
  await expect(office).toHaveCount(0);
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await add.click();
  await expect(dialog.getByRole('option', { name: 'Bureau', exact: true })).toHaveCount(1);
  await dialog.getByLabel('Nom de l’article').fill('Cotons-tiges');
  await expect(dialog.getByRole('combobox', { name: 'Rayon', exact: true })).toHaveValue(
    'Hygiène et soins',
  );
});
