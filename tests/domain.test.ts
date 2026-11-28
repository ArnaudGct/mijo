import { groupedMeals, nextMeal } from '../lib/shopping-period';
import { mealsToClear, weekPlan } from '../lib/week-plan';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRecipe, snapshot, type RecipeRow } from '../lib/model';
import { parseLine, normalize, amount } from '../lib/ingredients';
import {
  planned,
  defaultMeals,
  storageAlert,
  suggest,
  weekPreparations,
  optimizedRecipes,
} from '../lib/planner';
import { marketBasket, recipeCost, shipping } from '../lib/market';
import { needs, basket } from '../lib/shopping';
import { parseNotion } from '../lib/notion';
import { publicAddress, publicUrl, extract } from '../lib/web-import';
import { discoveryCourse } from '../lib/discovery-course';
import { discoveryQuery } from '../lib/discovery-search';
import { recipeDiet } from '../lib/recipe-diet';
const day = '2026-11-16',
  id = () => crypto.randomUUID();

test('prix d’une fiche avant planification, quantités consommées et ingrédients sans tarif', () => {
  const r = { base: 2, ingredients: [parseLine('Riz | 200 | g')] };
  const cost = recipeCost(r);
  assert.ok(cost.cents && cost.cents > 0);
  assert.deepEqual(cost, recipeCost({ ...r, ingredients: [parseLine('Riz | 0,2 | kg')] }));
  const extra = parseLine('Produit inconnu | 20 | g');
  assert.deepEqual(recipeCost({ ...r, ingredients: [...r.ingredients, extra] }), {
    ...cost,
    missing: 1,
  });
  assert.deepEqual(recipeCost({ base: null, ingredients: [extra] }), {
    cents: null,
    portions: null,
    missing: 1,
    priced: 0,
  });
  assert.deepEqual(
    recipeCost({ ...r, ingredients: [...r.ingredients, parseLine('Sel'), parseLine('Poivre')] }),
    cost,
  );
  const tin = parseLine('2 boîtes Haricots rouges (400 g), rincés et égouttés');
  assert.deepEqual([tin.name, tin.quantity, tin.unit], ['Haricots rouges', 800, 'g']);
  const oil = parseLine('2 c. à soupe Huile d’olive');
  assert.deepEqual([oil.name, oil.quantity, oil.unit], ['Huile d’olive', 2, 'càs']);
  assert.equal(parseLine('1 rôti de veau de 1,5 kg bardé').quantity, 1.5);
});

test('le filtre VG accepte une fiche végétalienne publiée et contrôle les ingrédients contradictoires', () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@type': 'Recipe',
      suitableForDiet: 'https://schema.org/VeganDiet',
      recipeIngredient: ['200 g de tofu', 'Riz'],
      name: 'Bowl de tofu',
    }) +
    '</script>';
  const recipe = extract(html, 'https://www.750g.com/bowl-r123.htm');
  assert.equal(recipeDiet(recipe), 'Végétarien');
  assert.equal(
    recipeDiet({ ...recipe, ingredients: [parseLine('Bouillon de volaille')] }),
    'Viande',
  );
  assert.equal(recipeDiet({ ...recipe, ingredients: [parseLine('Sauce de poisson')] }), 'Poisson');
  assert.equal(
    recipeDiet({ ...recipe, diet: '', tags: [], ingredients: [parseLine('Farce maison')] }),
    '',
  );
  assert.equal(
    recipeDiet({ ...recipe, ingredients: [parseLine('Lardons végétaux')] }),
    'Végétarien',
  );
});

test('les suggestions privilégient les plats et classent les intitulés ambigus avec la rubrique de la fiche', () => {
  assert.equal(
    discoveryQuery.parse({
      query: '',
      publisher: '',
      minutes: 0,
      order: 'explore',
      taste: [],
      offset: 0,
    }).course,
    'main',
  );
  assert.equal(discoveryCourse('Hachis parmentier', []), 'main');
  assert.equal(discoveryCourse('Tarte aux pommes de terre'), 'main');
  assert.equal(discoveryCourse('Sauté de porc au caramel'), 'main');
  assert.equal(discoveryCourse('Riz au lait à la vanille', ['Riz']), 'dessert');
  assert.equal(discoveryCourse('Biscuits au chocolat', ['Plat principal']), 'dessert');
  assert.equal(discoveryCourse('Tarte aux pommes'), 'dessert');
  assert.equal(discoveryCourse('Crêpes au caramel au beurre salé'), 'dessert');
  assert.equal(discoveryCourse('Club sandwich aux rillettes de poulet', ['Sandwich']), 'main');
  assert.equal(discoveryCourse('Tiramisu au saumon', ['Entrée']), 'starter');
  assert.equal(discoveryCourse('Quiche au chèvre', ['Entrée']), 'starter');
  assert.equal(discoveryCourse('Champignons farcis', ['Tapas']), 'starter');
  assert.equal(discoveryCourse('Gratin dauphinois', ['Accompagnement légumes']), null);
  assert.equal(discoveryCourse('Sauce pour poulet rôti'), null);
  assert.equal(discoveryCourse('La spécialité de Camille'), null);
  const html =
    '<nav class="breadcrumb"><a>Accueil</a><a>Desserts</a></nav>' +
    '<script type="application/ld+json">{"@type":"Recipe","name":"Douceur du jour","recipeCategory":"Crêpes"}</script>';
  const fiche = extract(html, 'https://www.cuisineaz.com/recettes/douceur.aspx');
  assert.deepEqual(fiche.tags, ['Desserts', 'Crêpes']);
  assert.equal(discoveryCourse(fiche.title, fiche.tags), 'dessert');
});
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

test('HelloFresh relie les identifiants au bon rendement et garde une étape par consigne illustrée', () => {
  const recipeId = '0123456789abcdef01234567';
  const url = 'https://www.hellofresh.fr/recipes/poelee-' + recipeId;
  const provider = {
    recipeId,
    websiteUrl: url,
    name: 'Poêlée',
    languageCode: 'fr-FR',
    ingredients: [
      { id: 'a', name: 'Champignons' },
      { id: 's', name: 'Poivre et sel' },
    ],
    yields: [
      { yields: 1, ingredients: [{ id: 'a', amount: 65, unit: 'g' }] },
      {
        yields: 2,
        ingredients: [
          { id: 's', amount: 0, unit: 'selon le goût' },
          { id: 'a', amount: 125, unit: 'g' },
        ],
      },
    ],
    steps: [{ index: 1, instructionsHTML: '<ul><li>Émincer.</li><li>Faire revenir.</li></ul>' }],
  };
  const html =
    '<script id="__NEXT_DATA__">' +
    JSON.stringify({ props: { pageProps: { ssrPayload: { recipe: provider } } } }) +
    '</script>';
  const recipe = extract(html, url);
  assert.equal(recipe.base, 2);
  assert.deepEqual(
    recipe.ingredients.map((i) => [i.name, i.sourceId, i.quantity, i.unit]),
    [
      ['Poivre et sel', 'hellofresh:s', null, 'selon le goût'],
      ['Champignons', 'hellofresh:a', 125, 'g'],
    ],
  );
  assert.deepEqual(recipe.steps, [{ text: 'Émincer.\nFaire revenir.', image: '' }]);
  assert.throws(() => extract('<title>Fiche indisponible</title>', url));
});

test('un seul oignon pour plusieurs sources, stock et article manuel, livraison aux seuils', () => {
  const s = fixture();
  s.preps[0].snapshot.ingredients = [parseLine('Oignon rouge | 1 | pièce')];
  s.preps[1].snapshot.ingredients = [parseLine('Oignons jaunes | 100 | g')];
  s.items.push({
    id: id(),
    week: day,
    key: 'manuel:oignon',
    name: 'Oignon',
    unit: 'g',
    quantity: 100,
    category: 'Fruits et légumes',
    manual: true,
    bag: null,
    checked: false,
  });
  s.stock = [{ id: id(), name: 'Oignon blanc', quantity: 50, unit: 'g' }];
  const [line] = marketBasket(s, day).lines;
  assert.equal(marketBasket(s, day).lines.length, 1);
  assert.equal(line.name, 'Oignon');
  assert.equal(line.buy.find((p) => p.unit === 'g')?.buy, 150);
  assert.ok(line.cents && line.cents > 0);
  assert.equal(shipping('leclerc', 4999).fee, null);
  assert.equal(shipping('leclerc', 5000).fee, 790);
  assert.equal(shipping('monoprix', 11999).fee, 800);
  assert.equal(shipping('monoprix', 15000).fee, 400);
  assert.equal(shipping('monoprix', 15001).fee, 0);
});

test('panier de semaine : formats de riz, bouillon partagé et produits disponibles', () => {
  const s = fixture();
  s.preps[0].snapshot.ingredients = [
    parseLine('Riz | 750 | g'),
    parseLine("Huile d'olive | 9 | càs"),
    parseLine('Bouillon de légumes | 400 | ml'),
  ];
  s.preps[1].snapshot.ingredients = [parseLine('Bouillon cube légumes | 0,5 | pièce')];
  const before = marketBasket(s, day),
    oil = before.lines.find((l) => l.name === "Huile d'olive")!;
  const rice = before.lines.find((l) => l.name === 'Riz')!;
  assert.equal(rice.packs * rice.pack >= 750, true);
  assert.equal(before.lines.filter((l) => l.name === 'Bouillon de légumes').length, 1);
  assert.equal(before.lines.find((l) => l.name === 'Bouillon de légumes')?.packs, 1);
  assert.ok(oil.cents && oil.usedCents && oil.cents > oil.usedCents);
  s.stock = [{ id: id(), name: "Huile d'olive", unit: 'ml', quantity: 100 }];
  assert.equal(marketBasket(s, day).lines.find((l) => l.name === oil.name)?.buy[0].buy, 35);
  s.items.push({
    id: id(),
    week: day,
    name: oil.name,
    key: 'placard:huile',
    quantity: null,
    unit: '',
    inPantry: true,
    manual: false,
    bag: null,
    checked: false,
    category: 'Autres',
  });
  const after = marketBasket(s, day);
  assert.equal(after.cash, before.cash - oil.cents);
  assert.equal(after.used, before.used);
  assert.equal(after.lines.find((l) => l.name === oil.name)?.cents, 0);
  assert.ok(after.cash < before.cash);
});

test('le planning partage les achats de frais et varie les familles de plats', () => {
  const s = fixture();
  const anchor = recipeRow('Bibimbap au poulet', 'Carotte | 2 | pièce');
  anchor.data.ingredients.push(parseLine('Oignon jaune | 1 | pièce'));
  const repeated = recipeRow('Bibimbap aux légumes', 'Carottes | 1 | pièce');
  const matches = recipeRow('Tarte aux carottes', 'Carottes | 3 | pièce');
  matches.data.ingredients.push(parseLine('Oignon rouge | 1 | pièce'));
  const unrelated = recipeRow('Velouté aux poireaux', 'Poireau | 3 | pièce');
  for (const r of [anchor, repeated, matches, unrelated])
    r.data.ingredients.push(parseLine('Huile | 1 | càs'));
  s.recipes = [repeated, unrelated, anchor, matches];
  s.preps = [planned(anchor, day, 2)];
  s.meals = defaultMeals(s.preps[0], true);
  s.prefs.target = 2;
  const [idea] = suggest(s, day);
  assert.equal(idea.id, matches.id);
  assert.match(idea.why, /Carotte/);
  assert.doesNotMatch(idea.why, /Huile/);
});
test('ordre des préparations par première apparition, déjeuner avant dîner, y compris les restes', () => {
  const s = fixture();
  const [a, b] = s.preps;
  b.day = '2026-11-15';
  s.meals = [
    { ...s.meals[0], prepId: a.id, day, slot: 'soir' },
    { ...s.meals[1], prepId: b.id, day, slot: 'midi' },
  ];
  assert.deepEqual(
    weekPreparations(s, day).map((x) => x.p.id),
    [b.id, a.id],
  );
  assert.equal(weekPreparations(s, day)[0].first?.slot, 'midi');
  a.automatic = true;
  b.automatic = false;
  assert.ok(optimizedRecipes(s, day, day).every((x) => x.prep.id !== b.id));
});

test('une portion manuelle du lundi devient un duo, annoncé puis enregistré une seule fois', () => {
  const s = fixture(),
    w = day;
  const p = planned(s.recipes[0], w, 1);
  s.prefs.portions = 2;
  s.prefs.target = 1;
  s.preps = [p];
  s.meals = defaultMeals(p, false);
  const result = weekPlan(s, w, w, false);
  assert.deepEqual(
    result.rows.map((r) => [r.meal.day, r.meal.slot, r.added]),
    [
      [w, 'soir', false],
      ['2026-11-17', 'midi', true],
    ],
  );
  assert.equal(result.preps[0].servings, 2);
  assert.equal(p.servings, 1);
  const again = weekPlan(
    { ...s, preps: result.preps, meals: [...s.meals, ...result.meals] },
    w,
    w,
    false,
  );
  assert.equal(again.meals.length, 0);
  assert.equal(again.preps.length, 0);
  assert.equal(weekPlan({ ...s, preps: [{ ...p, done: true }] }, w, w, false).meals.length, 0);
});

test('les critères de planification combinent régime, coût et tirage reproductible', () => {
  const s = fixture();
  s.preps = [];
  s.meals = [];
  s.prefs.target = 1;
  const rice = recipeRow('Riz pilaf', 'Riz | 80 | g');
  const expensive = recipeRow('Grande poêlée', 'Champignons | 2500 | g');
  const unknown = recipeRow('Spécialité', 'Produit sans prix | 1 | pièce');
  const chicken = recipeRow('Poulet rôti', 'Filet de poulet | 250 | g');
  for (const r of [rice, expensive, unknown, chicken]) r.data.diet = 'Végétarien';
  s.recipes = [chicken, unknown, expensive, rice];
  const criteria = { seed: id(), avoid: [], diet: 'vegetarian', strategy: 'economy' } as const;
  const options = { ...criteria, avoid: [] };
  assert.equal(suggest(s, day, day, options)[0].id, rice.id);
  s.prefs.target = 3;
  const flex = suggest(s, day, day, { ...options, diet: 'flexitarian', strategy: 'random' });
  assert.equal(flex.filter((r) => r.id === chicken.id).length, 1);
  assert.deepEqual(
    flex,
    suggest(s, day, day, { ...options, diet: 'flexitarian', strategy: 'random' }),
  );
  assert.ok(suggest(s, day, day, options).every((r) => r.id !== chicken.id));
  s.recipes = [rice];
  s.prefs.target = 7;
  const seven = weekPlan(s, day, day, true, options);
  assert.equal(seven.meals.filter((m) => m.slot === 'soir').length, 7);
  s.recipes = [chicken];
  assert.equal(suggest(s, day, day, options).length, 0);
});

test('le mode ingrédients en commun privilégie le produit frais déjà prévu', () => {
  const s = fixture();
  const shared = recipeRow('Poêlée du mardi', 'Champignons | 220 | g');
  const other = recipeRow('Carottes rôties', 'Carotte | 100 | g');
  s.recipes = [shared, other];
  s.preps = s.preps.slice(0, 1);
  s.meals = defaultMeals(s.preps[0], true);
  s.prefs.target = 2;
  const result = suggest(s, day, day, { seed: id(), avoid: [], strategy: 'shared' });
  assert.equal(result[0].id, shared.id);
});

test('courses du mardi soir au mardi midi avec deux dîners de part et d’autre du dimanche', () => {
  const s = fixture(),
    week = '2026-11-30';
  s.prefs.shoppingDays = { [week]: 1 };
  s.preps = [];
  s.meals = [];
  function meal(title: string, date: string, slot: 'midi' | 'soir') {
    const recipe = recipeRow(title, 'Riz | 100 | g');
    const p = planned(recipe, date, 2);
    s.preps.push(p);
    s.meals.push(...defaultMeals(p, true, slot));
  }
  meal('Lundi précédent', '2026-11-30', 'soir');
  meal('Premier soir', '2026-12-01', 'soir');
  meal('Dimanche soir et lundi midi', '2026-12-06', 'soir');
  meal('Lundi suivant', '2026-12-07', 'soir');
  // Independent lunches at either end are tested separately from the linked leftovers.
  s.meals = s.meals.filter(
    (m) => !['2026-12-01', '2026-12-08'].includes(m.day) || m.slot !== 'midi',
  );
  meal('Déjeuner avant les courses', '2026-12-01', 'midi');
  meal('Dernier déjeuner', '2026-12-08', 'midi');
  meal('Prochain panier', '2026-12-08', 'soir');
  const row = needs(s, week).rows[0];
  assert.deepEqual(row.recipes, [
    'Premier soir',
    'Dimanche soir et lundi midi',
    'Lundi suivant',
    'Dernier déjeuner',
  ]);
  assert.equal(row.quantity, 400);
  assert.deepEqual(needs(s, '2026-12-07').rows[0].recipes, ['Prochain panier']);
});

test('les sources et favoris se cumulent avec le régime et la priorité, sans dessert ni déjeuner inventé', () => {
  const s = fixture();
  s.preps = [];
  s.meals = [];
  function candidate(title: string, ingredient: string, source: string, favorite: boolean) {
    const r = recipeRow(title, ingredient);
    Object.assign(r.data, { source, favorite, diet: 'Végétarien', tags: ['Plat'] });
    return r;
  }
  const ok = candidate('Risotto', 'Riz | 200 | g', 'HelloFresh', true);
  s.recipes = [
    ok,
    candidate('Cookies au chocolat', 'Chocolat | 50 | g', 'HelloFresh', true),
    candidate('Quiche', 'Poireau | 2 | pièce', 'Notion', true),
    candidate('Curry', 'Lentilles | 50 | g', 'HelloFresh', false),
    candidate('Poulet rôti', 'Poulet | 200 | g', 'HelloFresh', true),
  ];
  const filters = {
    seed: id(),
    avoid: [],
    diet: 'vegetarian' as const,
    strategy: 'economy' as const,
    favoritesOnly: true,
    sources: ['HelloFresh'],
  };
  const plan = weekPlan(s, '2026-12-01', '2026-12-01', false, filters);
  assert.equal(plan.preps.length, 7);
  assert.ok(plan.preps.every((p) => p.recipeId === ok.id));
  assert.equal(plan.meals.length, 14);
  assert.ok(!plan.meals.some((m) => m.day === '2026-12-01' && m.slot === 'midi'));
  for (const end of ['2026-12-07', '2026-12-08']) {
    const lunch = plan.meals.find((m) => m.day === end && m.slot === 'midi')!;
    assert.ok(plan.meals.some((m) => m.slot === 'soir' && m.prepId === lunch.prepId));
  }
  assert.equal(weekPlan(s, day, day, false, { ...filters, sources: ['Jow'] }).meals.length, 0);
});

test('vider la semaine garde le déjeuner issu du dimanche précédent et retire le duo du dernier soir', () => {
  const s = fixture();
  const before = planned(s.recipes[0], '2026-11-15', 2);
  const last = planned(s.recipes[1], '2026-11-22', 2);
  s.preps = [before, last];
  s.meals = [...defaultMeals(before, true), ...defaultMeals(last, true)];
  assert.deepEqual(
    mealsToClear(s, day).map((m) => m.id),
    s.meals.slice(2).map((m) => m.id),
  );
});

test('la liste groupée suit le dernier déjeuner et le dîner suivant sur plusieurs semaines', () => {
  const s = fixture(),
    list = { id: id(), from: { day, slot: 'soir' as const } };
  s.prefs.shoppingList = list;
  const monday = planned(s.recipes[0], '2026-12-07', 2);
  const dinner = planned(s.recipes[1], '2026-12-15', 1);
  s.preps.push(monday, dinner);
  s.meals.push(...defaultMeals(monday, true), ...defaultMeals(dinner, false));
  const group = groupedMeals(s, list);
  assert.equal(group.preps.length, 4);
  assert.deepEqual(nextMeal(group.end!), { day: '2026-12-16', slot: 'midi' });
  assert.equal(needs(s, list.id).rows[0].quantity, 600);
  s.preps = s.preps.filter((p) => p.id !== dinner.id);
  assert.deepEqual(nextMeal(groupedMeals(s, list).end!), { day: '2026-12-08', slot: 'soir' });
  s.preps.forEach((p) => {
    p.purchasedFor = list.id;
  });
  monday.day = '2026-12-18';
  const next = { id: id(), from: { day: '2026-12-08', slot: 'soir' as const } };
  s.prefs.shoppingList = next;
  assert.equal(needs(s, next.id).rows.length, 0);
});
