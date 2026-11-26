import { expect, test } from '@playwright/test';
import { addDays, inWeek, monday, today } from '../lib/dates';
import { blankRecipe, type State } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import type { Command } from '../lib/commands';

test('caméra mobile, scan continu, abandon et achats partiels', async ({ page }) => {
  const week = addDays(monday(today()), 175);
  await page.addInitScript(() => {
    // Optical fixture for EAN-13 3017620422003; exercise the actual video decoder.
    const bars =
      '10100011010011001001000100001010011011000110101010101110011011001101100111001011100101000010101';
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const c = canvas.getContext('2d')!;
        const draw = () => {
          c.fillStyle = 'white';
          c.fillRect(0, 0, 640, 360);
          c.fillStyle = 'black';
          const pattern = document.documentElement.dataset.nextProduct
            ? '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101'
            : bars;
          [...pattern].forEach((bit, i) => {
            if (bit === '1') c.fillRect(82 + 5 * i, 70, 5, 220);
          });
        };
        draw();
        const stream = canvas.captureStream(10);
        const timer = setInterval(() => (stream.active ? draw() : clearInterval(timer)), 100);
        return stream;
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courses?week=' + week);
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Mes courses' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  const viewport = await page.context().newCDPSession(page);
  await viewport.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
  await expect(nav).toHaveCSS('padding-bottom', '44px');
  await viewport.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 0 } });
  await expect(nav).toHaveCSS('padding-bottom', '26px');
  await viewport.detach();
  const origin = new URL(page.url()).origin;
  await page.request.post('/api/week', { data: { week }, headers: { Origin: origin } });
  const state = async (): Promise<State> => (await page.request.get('/api/state')).json();
  async function write(command: Command) {
    const r = await page.request.post('/api/command', {
      headers: { Origin: origin },
      data: { revision: (await state()).revision, command },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  for (const p of (await state()).preps.filter((p) => inWeek(p.day, week)))
    await write({ action: 'removePrep', id: p.id });
  const { id } = await write({
    action: 'recipe',
    data: {
      ...blankRecipe(),
      title: 'Poulet du marché',
      base: 2,
      ingredients: [parseLine('Filets de poulet | 600 | g')],
      steps: [{ text: 'Cuire.', image: '' }],
    },
  });
  await write({ action: 'plan', id, servings: 2, day: addDays(week, 4), leftovers: true });
  await page.reload();
  await page.route('**/api/product', (route) =>
    route.fulfill({
      json: { product: { name: 'Filets de poulet fermier', quantity: 400, unit: 'g' } },
    }),
  );
  await page.route('**/api/observations', (route) =>
    route.fulfill({ json: { rows: [{ shop: 'Magasin test', cents: 530, day: week }] } }),
  );
  const dialog = page.getByRole('dialog');
  const check = page.getByLabel('Acheté · Filet de poulet');
  const camera = page.getByRole('button', { name: 'Scanner un produit' });
  await page.evaluate(() => {
    delete document.documentElement.dataset.nextProduct;
  });
  await camera.click();
  await expect(dialog.getByText('Filets de poulet fermier', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Prix relevé.*Magasin test/)).toBeVisible();
  await expect(dialog.getByLabel('Quantité de cet emballage')).toHaveValue('400');
  await expect(dialog.getByLabel('Mention sur l’emballage')).toHaveValue('');
  await expect(dialog.getByText('Choisir une date', { exact: true })).toBeVisible();
  // Exercise the content-box sizing seen with the native date field on iPhone.
  const nativeSizing = await page.addStyleTag({
    content: '.scan-date-control input[type=date] { box-sizing: content-box !important; }',
  });
  const dateField = dialog.getByLabel('Date de l’emballage');
  for (const [width, value] of [
    [320, ''],
    [390, ''],
    [390, week],
    [430, week],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await dateField.fill(value);
    const layout = await dialog.evaluate((el) => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
      const product = rect('.scan-product');
      const fields = [...el.querySelectorAll('.editor .field')].map((f) =>
        f.getBoundingClientRect(),
      );
      const controls = [...el.querySelectorAll('.editor input, .editor select')].map(
        (input) => input.closest('.scan-date-control') ?? input,
      );
      const date = rect('input[type=date]');
      const frame = rect('.scan-date-control');
      const mention = rect('.scan-dates select');
      return {
        actionGap: rect('.form-actions').top - mention.bottom,
        buttonGap:
          rect('.form-actions button[type=button]').top -
          rect('.form-actions button[type=submit]').bottom,
        gaps: fields.map((f, i) => Math.round(f.top - (i ? fields[i - 1] : product).bottom)),
        heights: controls.map((control) => control.getBoundingClientRect().height),
        widths: [...controls, el.querySelector('button[type=submit]')!].map((control) =>
          Math.round(control.getBoundingClientRect().width - product.width),
        ),
        dateContained:
          date.left >= frame.left &&
          date.right <= frame.right &&
          date.top >= frame.top &&
          date.bottom <= frame.bottom,
        dateAligned: frame.left === mention.left && frame.right === mention.right,
        overflow: el.scrollWidth > el.clientWidth,
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.actionGap).toBe(32);
    expect(layout.buttonGap).toBe(8);
    expect(layout.dateContained).toBe(true);
    expect(layout.dateAligned).toBe(true);
    expect(layout.gaps).toEqual([16, 16, 16, 16]);
    expect(layout.heights).toEqual([48, 48, 48, 48]);
    expect(layout.widths).toEqual([0, 0, 0, 0, 0]);
  }
  await nativeSizing.evaluate((style) => {
    style.parentNode?.removeChild(style);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel('Date de l’emballage').fill(week);
  await dialog.getByRole('button', { name: 'Ajouter cet emballage' }).click();
  await expect(dialog.getByText('Emballage ajouté. Scannez le produit suivant.')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.nextProduct = '1';
  });
  await expect(dialog.getByText(/4006381333931/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Retour au scan' }).click();
  await dialog.getByRole('button', { name: 'Reprendre le même produit' }).click();
  await expect(dialog.getByLabel('Article de la liste')).toBeVisible();
  await dialog.getByRole('button', { name: 'Retour au scan' }).click();
  await expect(dialog.getByLabel('Numéro du code-barres')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByText(/Reste à acheter 200 g/)).toBeVisible();
  expect((await state()).lots.find((lot) => lot.week === week)).toMatchObject({
    expires: week,
    dateKind: null,
  });
  await expect(check).not.toBeChecked();
  const copy = page.getByRole('button', { name: 'Copier ce qu’il reste à acheter' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install();
  await copy.click();
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Liste des achats restants copiée');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Filet de poulet · 200 g',
  );
  await page.clock.fastForward(3000);
  await copy.click();
  await page.clock.fastForward(3000);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(2001);
  await expect(toast).toHaveCount(0);
  await copy.click();
  await toast.getByRole('button', { name: 'Masquer le message' }).click();
  await expect(toast).toHaveCount(0);
  await page.evaluate(() => {
    delete document.documentElement.dataset.nextProduct;
  });
  await camera.click();
  await expect(dialog.getByText('Filets de poulet fermier', { exact: true })).toBeVisible();
  await dialog.getByLabel('Quantité de cet emballage').fill('200');
  await dialog.getByLabel('Date de l’emballage').fill(addDays(week, 2));
  await dialog.getByRole('button', { name: 'Ajouter cet emballage' }).click();
  await expect(dialog.getByLabel('Numéro du code-barres')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(check).toBeChecked();
  if (await copy.isEnabled()) {
    await copy.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain(
      'Filet de poulet',
    );
  }
  await page.reload();
  await expect(page.getByText('Emballages scannés (2)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminer les courses' })).toHaveCount(0);
  const navSettings = page.getByRole('link', { name: 'Paramètres' });
  await expect(
    page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'),
  ).toHaveCount(5);
  await navSettings.click();
  await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
});

test('une recette pour deux devient quatre repas avec une seule liste de courses', async ({
  page,
}) => {
  const week = addDays(monday(today()), 280);
  await page.goto('/recettes?week=2020-01-06');
  await page.getByLabel('Adresse e-mail').fill('owner@mijo.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Mon carnet de recettes' })).toBeVisible();
  const state = async (): Promise<State> => (await page.request.get('/api/state')).json();
  async function command(command: Command) {
    const response = await page.request.post('/api/command', {
      headers: { Origin: new URL(page.url()).origin },
      data: { revision: (await state()).revision, command },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await command({ action: 'clearWeek', week, previewRevision: (await state()).revision });
  const title = 'Hachis du test batch cooking';
  await command({
    action: 'recipe',
    data: {
      ...blankRecipe(),
      title,
      base: 2,
      ingredients: [parseLine('Carottes | 250 | g')],
      steps: [{ text: 'Cuire les carottes.', image: '' }],
    },
  });
  await page.goto('/recettes?week=' + week);
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const price = dialog.locator('.recipe-price');
  const initialTotal = await price.locator('strong').innerText();
  expect(initialTotal).toMatch(/^≈/);
  await expect(price.locator('.price-coverage')).toHaveCount(0);
  const perPortion = await price.locator('span').nth(1).innerText();
  await dialog.getByLabel('Portions pour les ingrédients').fill('4');
  await expect(price).toContainText('pour 4 portions');
  await expect(price.locator('strong')).not.toHaveText(initialTotal);
  await expect(price.locator('span').nth(1)).toHaveText(perPortion);
  await expect(dialog.getByText('500 g', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Planifier', exact: true }).click();
  await dialog.getByLabel('Organisation des repas').selectOption('batch');
  await expect(dialog.getByLabel('Portions à préparer')).toHaveValue('4');
  await dialog.getByLabel('Portions par repas').fill('2');
  await expect(dialog.getByRole('heading', { name: 'Une préparation, 2 repas' })).toBeVisible();
  await dialog.getByLabel('Portions par repas').fill('1');
  await expect(dialog.getByText(/à congeler dès la préparation/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Ajouter au planning' }).click();
  await expect(dialog).toHaveCount(0);
  const data = await state();
  const prep = data.preps.find((p) => p.day === week && p.snapshot.title === title)!;
  expect(prep.servings).toBe(4);
  expect(data.meals.filter((m) => m.prepId === prep.id)).toHaveLength(4);
  expect(data.recipes.find((r) => r.id === prep.recipeId)?.data.batch).toBe(true);
  await page.goto('/courses?week=' + week);
  await expect(page.getByText('Carotte', { exact: true }).first()).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copier ce qu’il reste à acheter' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Carotte · 500 g');
  await page.getByRole('button', { name: 'Modifier · Carotte' }).click();
  await dialog.getByLabel('Nom de l’article').fill('Carottes du marché');
  await dialog.getByLabel('Quantité totale').fill('0.75');
  await dialog.getByLabel('Unité').fill('kg');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const carrots = page.locator('.grocery').filter({ hasText: 'Carottes du marché' });
  await expect(carrots).toContainText('750 g');
  await carrots.getByRole('checkbox').click();
  await expect(carrots.getByRole('checkbox')).toBeChecked();
  await carrots.getByRole('button', { name: 'Modifier · Carottes du marché' }).click();
  await dialog.getByRole('button', { name: 'Retirer de la liste' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /Modifier · Carotte/ })).toHaveCount(0);
  expect(
    (await state()).preps.find((p) => p.id === prep.id)?.snapshot.ingredients[0].quantity,
  ).toBe(250);
  await page.getByRole('button', { name: 'Ajouter un article' }).click();
  await dialog.getByLabel('Nom de l’article').fill('Carotte');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.grocery').filter({ hasText: 'Carotte' })).toContainText('1 pièce');
  await page.goto('/semaine?week=' + week);
  await page.getByRole('button', { name: 'Vider la semaine' }).click();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  expect((await state()).meals.filter((m) => m.prepId === prep.id)).toHaveLength(4);
  await page.getByRole('button', { name: 'Vider la semaine' }).click();
  await dialog.getByRole('button', { name: 'Vider la semaine' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Vider la semaine' })).toBeDisabled();
  await page.getByRole('button', { name: 'Batch cooking', exact: true }).click();
  const batchHeader = page.locator('.week-section .section-heading');
  await expect(
    batchHeader.getByRole('heading', { name: 'Un plat pour plusieurs repas' }),
  ).toBeVisible();
  await batchHeader.getByRole('button', { name: 'Préparer un plat' }).click();
  await expect(dialog.getByLabel('Organisation des repas')).toHaveValue('batch');
});
