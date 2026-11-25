import { z } from 'zod';
import { breakfastSettings } from './breakfast-model';
export const categories = [
  'Fruits et légumes',
  'Viandes et poissons',
  'Produits frais',
  'Épicerie',
  'Surgelés',
  'Autres',
] as const;
const text = z.string().trim().max(12000),
  label = z.string().trim().min(1).max(300);
export const id = z.string().uuid();
export const date = z.iso.date();
export const qty = z.number().finite().positive().max(10000000);
export const portions = z.number().int().min(1).max(100);
const minutes = z.number().int().min(0).max(10080).nullable().default(null);
export const url = z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default('');
export const photo = z
  .union([url, z.string().regex(/^\/api\/media\/[a-f0-9-]{36}\.webp$/)])
  .default('');
export const ingredient = z.object({
  name: label,
  sourceId: z.string().max(100).optional(),
  raw: text.default(''),
  quantity: qty.nullable(),
  unit: z.string().trim().max(70),
  category: z.enum(categories).default('Autres'),
});
export const recipe = z.object({
  title: label,
  description: text.default(''),
  image: photo,
  source: text.default(''),
  url,
  rights: text.default(''),
  base: portions.nullable().default(null),
  prep: minutes,
  cook: minutes,
  total: minutes,
  difficulty: text.default(''),
  tags: z.array(label).max(40).default([]),
  cuisine: text.default(''),
  diet: text.default(''),
  batch: z.boolean().default(false),
  equipment: z.array(label).max(50).default([]),
  ingredients: z.array(ingredient).max(300),
  steps: z.array(z.object({ text: label.or(text.min(1)), image: photo })).max(200),
  nutrition: text.default(''),
  notes: text.default(''),
  rating: z.number().int().min(0).max(5).default(0),
  favorite: z.boolean().default(false),
  verified: z.boolean().default(false),
});
export const stores = z.object({
  name: label,
  delivery: z.number().int().nonnegative().nullable(),
  freeAt: z.number().int().nonnegative().nullable(),
});
export const aisleName = z
  .string()
  .trim()
  .min(1)
  .max(70)
  .regex(/^[^\r\n\t]+$/)
  .transform((s) => s.replace(/ +/g, ' '));
export const settings = z.object({
  breakfast: breakfastSettings.optional(),
  customAisles: z.array(aisleName).default([]),
  generatedWeeks: z.array(date).default([]),
  dismissedDiscoveries: z.array(z.string().max(3000)).default([]),
  portions: portions.default(2),
  target: z.number().int().min(1).max(14).default(7),
  budget: z.number().int().nonnegative().nullable().default(null),
  hello: z.number().int().nonnegative().default(7999),
  helloMeals: portions.nullable().default(null),
  helloPortions: portions.nullable().default(null),
  diet: text.default(''),
  maxTime: minutes,
  bagFresh: qty.nullable().default(null),
  bagDry: qty.nullable().default(null),
  shops: z
    .array(stores)
    .max(40)
    .default([
      { name: 'Carrefour', delivery: null, freeAt: null },
      { name: 'E.Leclerc', delivery: null, freeAt: null },
    ]),
  leftovers: z.boolean().default(true),
});
export const recipeRow = z.object({
  id,
  version: id,
  archived: z.boolean(),
  sourceKey: z.string().max(3000).nullable(),
  original: z.string().max(500000),
  data: recipe,
});
export const preparation = z.object({
  batchPerMeal: portions.optional(),
  automatic: z.boolean().optional(),
  id,
  recipeId: id,
  version: id,
  day: date,
  servings: portions,
  session: id.nullable(),
  done: z.boolean(),
  ticks: z.array(z.number().int().nonnegative()),
  snapshot: recipe,
});
export const meal = z.object({
  id,
  prepId: id.nullable(),
  day: date,
  slot: z.enum(['midi', 'soir']),
  servings: portions,
  frozen: z.boolean(),
  consumed: z.boolean(),
});
export const session = z.object({
  id,
  day: date,
  name: label,
  weighed: z.array(z.string().max(1600)).max(500).optional(),
  order: z.array(z.string().max(90)).max(1000),
});
export const inventory = z.object({ id, name: label, quantity: qty, unit: z.string().max(70) });
export const offer = z.object({
  id,
  name: label,
  product: label,
  shop: label,
  quantity: qty,
  unit: label,
  cents: z.number().int().nonnegative().max(10000000).nullable(),
  equivalent: z.object({ quantity: qty, unit: label }).nullable().optional(),
  weight: qty.nullable(),
  day: date,
  source: label,
  estimated: z.boolean(),
  barcode: z.string().max(50),
});
export const purchaseLot = z.object({
  id,
  week: date,
  barcode: z
    .string()
    .regex(/^(?:\d{8}|\d{12,14})$/)
    .or(z.literal('')),
  product: label,
  name: label,
  quantity: qty,
  unit: z.string().trim().min(1).max(70),
  expires: date.nullable(),
  dateKind: z.enum(['DLC', 'DDM']).nullable(),
  used: z.record(id, qty).optional(),
});
export type PurchaseLot = z.infer<typeof purchaseLot>;
export const item = z.object({
  scanBaseline: z.number().nonnegative().optional(),
  id,
  week: date,
  key: z.string().max(600),
  name: label,
  quantity: qty.nullable(),
  unit: z.string().max(70),
  category: aisleName,
  manual: z.boolean(),
  inPantry: z.boolean().optional(),
  checked: z.boolean(),
  bag: z.enum(['Frais', 'Épicerie', 'Troisième']).nullable(),
});
export const basis = z.object({
  stock: z.array(inventory),
  prices: z.array(offer),
  prefs: settings,
});
export const snapshot = z.object({
  past: z.record(date, basis).default({}),
  revision: z.number().int().nonnegative(),
  recipes: z.array(recipeRow),
  preps: z.array(preparation),
  meals: z.array(meal),
  sessions: z.array(session),
  stock: z.array(inventory),
  prices: z.array(offer),
  items: z.array(item),
  lots: z.array(purchaseLot).default([]),
  prefs: settings,
});
export type Recipe = z.infer<typeof recipe>;
export type RecipeRow = z.infer<typeof recipeRow>;
export type Ingredient = z.infer<typeof ingredient>;
export type State = z.infer<typeof snapshot>;
export type Prep = z.infer<typeof preparation>;
export type Offer = z.infer<typeof offer>;
export function blankRecipe() {
  return recipe.parse({ title: 'Nouvelle recette', ingredients: [], steps: [] });
}
export function problems(r: Recipe) {
  return [
    !r.base ? 'Portions de référence inconnues' : '',
    !r.ingredients.length ? 'Ingrédients manquants' : '',
    !r.steps.length ? 'Étapes manquantes' : '',
    r.ingredients.some((i) => (i.quantity === null && i.unit !== 'selon le goût') || !i.unit)
      ? 'Quantités ou unités à vérifier'
      : '',
  ].filter(Boolean);
}
export function duration(r: Recipe) {
  return r.total ?? (r.prep !== null && r.cook !== null ? r.prep + r.cook : null);
}
