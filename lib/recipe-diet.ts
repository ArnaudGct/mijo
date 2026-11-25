import { fold } from './grocery-names';
import type { Recipe } from './model';

export const diets = ['Viande', 'Poisson', 'Végétarien'] as const;
export const difficulties = ['Facile', 'Moyen', 'Difficile'] as const;

export function vegetarianLabel(label: string) {
  return /^(?:(?:recettes?|plats?) )?(?:vegetarien(?:ne)?s?|vegetalien(?:ne)?s?|vegans?|veggie|vege|vg|(?:vegetarian|vegan)diet)$/.test(
    fold(label).replace(/^https?:\/\/schema\.org\//, ''),
  );
}

const fish =
  /\b(?:poissons?|saumons?|thons?|anchois|sardines?|truites?|cabillauds?|lieu noir|lieu jaune|merlus?|colins?|haddock|harengs?|maquereaux?|dorades?|soles?|surimi|crevettes?|crabes?|homards?|langoustines?|calamars?|moules?|huitres?|saint[- ]jacques?|fruits de mer|nuoc[- ]mam)\b/;
const meat =
  /\b(?:viandes?|volailles?|poulets?|poules?|dindes?|boeufs?|veaux?|veau|porcs?|cochons?|agneaux?|canards?|lapins?|jambons?|lard(?:ons?)?|bacons?|chorizos?|sauciss(?:es?|ons?)|merguez|pancetta|coppa|prosciutto|bavettes?|steaks? haches?|chipolatas?|gelatine(?: animale)?)\b/;

export function recipeDiet(r: Pick<Recipe, 'diet' | 'tags' | 'ingredients'>) {
  if (r.diet === 'Viande' || r.diet === 'Poisson') return r.diet;
  // Match the ingredient itself, including animal stocks and sauces. A plant-based
  // substitute may use the animal product's name on its label.
  const names = r.ingredients.map((i) =>
    fold(i.name).replace(
      /\b(?:poulet|jambon|lardons?|saucisses?|chorizo|bacon|thon|saumon|viande|gelatine)s?\s+(?:vegetal(?:e|es|s)?|vegetaux|veggie|vegan)\b/g,
      '',
    ),
  );
  if (names.some((name) => meat.test(name))) return 'Viande';
  if (names.some((name) => fish.test(name))) return 'Poisson';
  return r.ingredients.length && (vegetarianLabel(r.diet) || r.tags.some(vegetarianLabel))
    ? 'Végétarien'
    : '';
}
