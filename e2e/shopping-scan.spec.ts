import { expect, test } from '@playwright/test';
import { addDays, inWeek, monday, today } from '../lib/dates';
import { blankRecipe, type State } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import type { Command } from '../lib/commands';

test('caméra mobile, deux emballages, prix daté et déplacement du dîner avec son déjeuner', async ({
  page,
}) => {
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
          [...bars].forEach((bit, i) => {
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
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.getByRole('heading', { name: 'Mes courses' })).toBeVisible();
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
  await camera.click();
  await expect(dialog.getByText('Filets de poulet fermier', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Prix relevé.*Magasin test/)).toBeVisible();
  await expect(dialog.getByLabel('Quantité de cet emballage')).toHaveValue('400');
  await dialog.getByLabel('Date de l’emballage').fill(week);
  await dialog.getByRole('button', { name: 'Ajouter cet emballage' }).click();
  await expect(page.getByText(/Reste à acheter 200 g/)).toBeVisible();
  await expect(check).not.toBeChecked();
  await camera.click();
  await expect(dialog.getByText('Filets de poulet fermier', { exact: true })).toBeVisible();
  await dialog.getByLabel('Quantité de cet emballage').fill('200');
  await dialog.getByLabel('Date de l’emballage').fill(addDays(week, 2));
  await dialog.getByRole('button', { name: 'Ajouter cet emballage' }).click();
  await expect(check).toBeChecked();
  await page.reload();
  await expect(page.getByText('Emballages scannés (2)')).toBeVisible();
  await page.getByRole('button', { name: 'Terminer les courses' }).click();
  await expect(page.getByText('Planning réorganisé')).toBeVisible();
  await page.getByRole('link', { name: 'Voir ma semaine' }).click();
  await expect(page.locator('[data-mealslot="' + week + 'soir"]')).toContainText(
    'Poulet du marché',
  );
  await expect(page.locator('[data-mealslot="' + addDays(week, 1) + 'midi"]')).toContainText(
    'Poulet du marché',
  );
});
