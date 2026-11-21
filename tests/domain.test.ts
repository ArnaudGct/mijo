import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRecipe, snapshot, type RecipeRow } from '../lib/model';
import { parseLine, normalize, amount } from '../lib/ingredients';
import { planned, defaultMeals, storageAlert, suggest } from '../lib/planner';
import { needs, basket } from '../lib/shopping';
import { parseNotion } from '../lib/notion';
import { publicAddress, publicUrl, extract } from '../lib/web-import';
const day = '2026-11-16',
  id = () => crypto.randomUUID();
function recipeRow(title: string, raw: string): RecipeRow {
  return {
    id: id(),
    version: id(),
    sourceKey: null,
    original: '',
    archived: false,
    data: {
      ...blankRecipe(),
      title,
      base: 2,
      ingredients: [parseLine(raw)],
      steps: [{ text: 'Préparer.', image: '' }],
    },
  };
}
export function fixture() {
  const s = snapshot.parse({
    revision: 0,
    recipes: [],
    sessions: [],
    preps: [],
    meals: [],
    stock: [],
    items: [],
    prices: [],
    prefs: {},
  });
  s.recipes = [recipeRow('A', 'Champignons | 150 | g'), recipeRow('B', 'Champignons | 0,2 | kg')];
  s.preps = s.recipes.map((r, i) => planned(r, i ? '2026-11-17' : day, 2));
  s.meals = s.preps.flatMap((p) => defaultMeals(p, true));
  return s;
}
test('fractions, virgule, unités compatibles, conditionnements distincts', () => {
  assert.equal(amount('1½'), 1.5);
  assert.equal(amount('⅔'), 0.666667);
  assert.equal(amount('1/0'), null);
  assert.deepEqual(normalize(0.2, 'kg'), [200, 'g']);
  assert.deepEqual(normalize(20, 'cl'), [200, 'ml']);
  assert.equal(parseLine('1 pièce(s) Poireau').name, 'Poireau');
  assert.equal(parseLine('2 pinc. Muscade').unit, 'pincée');
  assert.equal(parseLine('1/2 gou. Ail').quantity, 0.5);
  assert.equal(parseLine('<b>Citron </b>(0.5 pièce(s))').quantity, 0.5);
  assert.equal(parseLine('Poivre').quantity, null);
  assert.equal(parseLine('1 à 2 pommes').unit, '');
});
test('deux préparations, quatre repas, un besoin consolidé de 350 g', () => {
  const s = fixture();
  assert.equal(s.meals.length, 4);
  assert.equal(needs(s, day).rows[0].quantity, 350);
  s.stock.push({ id: id(), name: 'Champignons', quantity: 100, unit: 'g' });
  assert.equal(needs(s, day).rows[0].buy, 250);
  s.stock[0].quantity = 999;
  assert.equal(needs(s, day).rows[0].buy, 0);
});
test('unités et produits incompatibles, portions non confirmées visibles', () => {
  const s = fixture();
  s.preps[0].snapshot.ingredients.push(
    parseLine('Champignons | 1 | pièce'),
    parseLine('Champignons noirs | 1 | pièce'),
  );
  assert.equal(needs(s, day).rows.length, 3);
  s.preps[0].snapshot.base = null;
  assert.equal(needs(s, day).incomplete.length, 1);
  assert.ok(needs(s, day).rows[0].unknown);
});
test('prix par paquet entier, stock, poids, livraison, comparabilité et inconnus', () => {
  const s = fixture();
  s.prefs.helloMeals = 2;
  s.prefs.helloPortions = 4;
  s.prefs.shops[0].delivery = 300;
  s.prices = [
    {
      id: id(),
      shop: 'Carrefour',
      name: 'Champignons',
      product: 'Barquette',
      quantity: 250,
      unit: 'g',
      weight: 270,
      cents: 200,
      day,
      source: 'test',
      estimated: false,
      barcode: '',
    },
  ];
  const b = basket(s, day, 'Carrefour');
  assert.equal(b.cash, 400);
  assert.equal(b.used, 280);
  assert.equal(b.lines[0].weight, 540);
  assert.equal(b.delivered, 700);
  assert.ok(b.comparable);
  s.prices = [];
  assert.equal(basket(s, day, 'Carrefour').complete, false);
  assert.equal(basket(s, day, 'Carrefour').delivered, null);
});
test('dimanche et lundi ne dupliquent pas un achat, conservation anticipée', () => {
  const r = fixture().recipes[0],
    p = planned(r, '2026-11-22', 2),
    m = defaultMeals(p, true);
  assert.equal(m[1].day, '2026-11-23');
  assert.ok(storageAlert(p, { ...m[1], day: '2026-11-25' }));
  assert.equal(storageAlert(p, { ...m[1], day: '2026-11-25', frozen: true }), '');
});
test('suggestions déterministes et sans modification du calendrier', () => {
  const s = fixture();
  s.meals = [];
  s.preps = [];
  const a = suggest(s, day);
  assert.equal(a.length, 2);
  assert.deepEqual(a, suggest(s, day));
  assert.deepEqual(s.preps, []);
});
test('import Notion maintient les références et signale les champs absents', () => {
  const r = parseNotion({
    id: '123',
    title: 'Citron',
    content:
      '## 🛒 Ingrédients\n- <b>Citron </b>(½ pièce(s))\n## Préparation\n### Étape 1\nPresser.',
  });
  assert.equal(r.data.ingredients[0].quantity, 0.5);
  assert.equal(r.data.base, null);
  assert.equal(r.data.steps.length, 1);
  assert.ok(r.issues.length);
});
test('lecture de Recipe dans @graph et repli sur métadonnées', () => {
  const u = 'https://example.org/recette';
  const r = extract(
    '<script type="application/ld+json">' +
      JSON.stringify({
        '@graph': [
          {
            '@type': 'Recipe',
            name: 'Riz',
            recipeIngredient: ['150 g de riz'],
            recipeYield: '2',
            recipeInstructions: [{ '@type': 'HowToStep', text: 'Cuire.' }],
          },
        ],
      }) +
      '</script>',
    u,
  );
  assert.equal(r.title, 'Riz');
  assert.equal(r.ingredients[0].quantity, 150);
  assert.equal(r.base, 2);
  assert.equal(extract('<title>Carnet</title>', u).steps.length, 0);
});
test('validation des destinations web', () => {
  for (const ip of ['127.0.0.1', '192.168.1.1', '::1', '169.254.1.1', '::ffff:127.0.0.1'])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  for (const u of [
    'file:///etc/hosts',
    'http://exemple.fr',
    'https://localhost/',
    'https://127.0.0.1/',
  ])
    assert.throws(() => publicUrl(u));
});
test('conditionnement avec poids sans prix, équivalence explicite et coût réellement consommé', () => {
  const s = fixture();
  s.stock.push({ id: id(), name: 'Champignons', quantity: 100, unit: 'g' });
  s.prices.push({
    id: id(),
    shop: 'Carrefour',
    name: 'Champignons',
    product: 'Boîte',
    quantity: 1,
    unit: 'pièce',
    equivalent: { quantity: 250, unit: 'g' },
    weight: 310,
    cents: null,
    day,
    source: 'Emballage test',
    estimated: false,
    barcode: '',
  });
  let b = basket(s, day, 'Carrefour');
  assert.equal(b.complete, false);
  assert.equal(b.lines[0].best?.count, 1);
  assert.equal(b.lines[0].weight, 310);
  assert.equal(b.known, 0);
  s.prices[0].cents = 200;
  b = basket(s, day, 'Carrefour');
  assert.equal(b.cash, 200);
  assert.equal(b.used, 280);
  s.stock[0].quantity = 500;
  b = basket(s, day, 'Carrefour');
  assert.equal(b.cash, 0);
  assert.equal(b.used, 280);
});
test('pesée commune sans fusion des étapes et répartition par recette', async () => {
  const { commonMeasures, sessionTasks } = await import('../lib/planner');
  const s = fixture(),
    id = crypto.randomUUID();
  for (const p of s.preps) p.session = id;
  s.sessions.push({ id, day, name: 'Session', order: [] });
  const c = commonMeasures(s.preps);
  assert.equal(c.length, 1);
  assert.equal(c[0].total, 350);
  assert.equal(c[0].parts.length, 2);
  assert.equal(sessionTasks(s, id).length, 2);
});
