import { expect, test, type Locator } from '@playwright/test';
import { parseLine } from '../lib/ingredients';
import { blankRecipe } from '../lib/model';
import type { Command } from '../lib/commands';

test('dépôt de lundi à mardi sur une case vide et sur un repas, à la souris et au toucher', async ({
  page,
}) => {
  const week = '2020-01-06',
    next = '2020-01-07';
  await page.setViewportSize({ width: 1360, height: 920 });
  await page.goto('/semaine?week=' + week);
  await page.getByLabel('Mot de passe').fill(process.env.TABLE_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ouvrir mon carnet' }).click();
  await expect(page.locator('.calendar')).toBeVisible();
  async function seed(command: Command) {
    const { revision } = await (await page.request.get('/api/state')).json();
    const result = await page.request.post('/api/command', {
      data: { revision, command },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(result.ok(), await result.text()).toBe(true);
    return result.json();
  }
  const outside = crypto.randomUUID(),
    title = 'Omelette du lundi';
  const { id: recipe } = await seed({
    action: 'recipe',
    data: {
      ...blankRecipe(),
      title,
      base: 1,
      ingredients: [parseLine('Œuf | 1 | pièce')],
      image: new URL('/icon.png', page.url()).href,
      steps: [{ text: 'Cuire.', image: '' }],
    },
  });
  await seed({
    action: 'plan',
    id: recipe,
    servings: 1,
    day: week,
    slot: 'midi',
    leftovers: false,
  });
  await seed({
    action: 'meal',
    data: {
      id: outside,
      prepId: null,
      day: next,
      slot: 'soir',
      servings: 1,
      consumed: false,
      frozen: false,
    },
  });
  await page.reload();
  const monday = page.locator('[data-mealslot="' + week + 'midi"]'),
    lunch = page.locator('[data-mealslot="' + next + 'midi"]'),
    dinner = page.locator('[data-mealslot="' + next + 'soir"]');
  await expect(monday.locator('.scheduled')).toContainText(title);
  const omelette = await monday.getAttribute('data-meal-id');
  async function center(el: Locator) {
    const b = await el.boundingBox();
    if (!b) throw Error('Élément du planning invisible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  // Aim before pickup, as the user does. Recalculating the target after dragstart
  // would hide a layout shift when dragging between different days.
  async function mouseDrag(from: Locator, to: Locator) {
    const a = await center(from),
      b = await center(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y + 6, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 15 });
    await page.mouse.move(b.x + 1, b.y + 1);
    await page.mouse.up();
  }
  async function persisted(ids: Array<string | null>) {
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      for (const [i, slot] of [monday, lunch, dinner].entries()) {
        if (ids[i]) await expect(slot).toHaveAttribute('data-meal-id', ids[i]!);
        else await expect(slot.locator('.meal-card')).toHaveCount(0);
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  }
  await mouseDrag(monday.locator('.move-grip'), lunch.getByRole('button', { name: '+ Recette' }));
  await persisted([null, omelette, outside]);
  await mouseDrag(lunch.locator('.scheduled span'), page.locator('#jour-' + week + ' > header'));
  await persisted([omelette, null, outside]);
  await mouseDrag(monday.locator('.scheduled img'), dinner.locator('.scheduled'));
  await persisted([outside, null, omelette]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.calendar')
    .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  async function touchDrag(from: Locator, to: Locator) {
    const a = await center(from),
      b = await center(to);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    for (let i = 1; i <= 6; i++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await touchDrag(dinner.locator('.move-grip'), monday.locator('.scheduled'));
  await persisted([omelette, null, outside]);
  await touchDrag(monday.locator('.move-grip'), lunch.locator('.slot-actions'));
  await persisted([null, omelette, outside]);
  await lunch.locator('.move-grip').press('Enter');
  await dinner.locator('.drop-target').press('Enter');
  await persisted([null, outside, omelette]);

  await page.goto('/?week=' + week);
  await page.setViewportSize({ width: 1360, height: 940 });
  await lunch.scrollIntoViewIfNeeded();
  await mouseDrag(lunch.locator('.move-grip'), monday.locator('.menu-meal'));
  await persisted([outside, null, omelette]);
  await dinner.scrollIntoViewIfNeeded();
  await mouseDrag(dinner.locator('.menu-meal span'), monday.locator('.menu-meal'));
  await persisted([omelette, null, outside]);
  await page.setViewportSize({ width: 390, height: 844 });
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await monday.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await touchDrag(monday.locator('.move-grip'), lunch.locator('.menu-meal'));
  await persisted([null, omelette, outside]);
  await page.goto('/semaine?week=' + week);
  await expect(page.locator('.weekly-prep').filter({ hasText: title })).toContainText('Déjeuner');
  await expect(
    page.locator('.weekly-prep').filter({ hasText: title }).locator('img'),
  ).toBeVisible();

  await seed({
    action: 'meal',
    data: {
      id: crypto.randomUUID(),
      prepId: null,
      day: week,
      slot: 'soir',
      servings: 1,
      consumed: false,
      frozen: false,
    },
  });
  const dish = 'Ragoût du carnet à tester';
  await seed({
    action: 'recipe',
    data: {
      ...blankRecipe(),
      title: dish,
      base: 2,
      ingredients: [parseLine('Carottes | 2 | pièce')],
      steps: [{ text: 'Cuire.', image: '' }],
    },
  });
  await page.reload();
  const mondayDinner = page.locator('[data-mealslot="' + week + 'soir"]');
  await mondayDinner.locator('.scheduled').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByLabel('Rechercher un plat ou un ingrédient').fill(dish);
  await dialog.getByRole('button', { name: dish }).click();
  await dialog.getByRole('button', { name: 'Ajouter au planning' }).click();
  await expect(dialog.locator('.confirm-meals p')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(mondayDinner.locator('.scheduled')).toContainText('Repas à l’extérieur');
  await dialog.getByRole('button', { name: 'Ajouter au planning' }).click();
  await dialog.getByRole('button', { name: 'Oui, remplacer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(mondayDinner.locator('.scheduled')).toContainText(dish);
  await expect(lunch.locator('.scheduled')).toContainText(dish);
  const stored = await (await page.request.get('/api/state')).json();
  const prep = stored.preps.find((p: { snapshot: { title: string } }) => p.snapshot.title === dish);
  expect(prep.servings).toBe(2);
  expect(stored.meals.filter((m: { prepId: string }) => m.prepId === prep.id)).toHaveLength(2);
});
