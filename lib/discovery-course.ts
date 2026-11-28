import { fold } from './grocery-names';

export const courses = ['main', 'starter', 'dessert'] as const;
export type Course = (typeof courses)[number];
export const courseLabels = { main: 'Plats', starter: 'Entrées', dessert: 'Desserts' } as const;

// Some publishers give a meal course, others a dish family such as "Terrines".
// Ambiguous titles are left out unless the publisher supplies a usable category.
const starter =
  /\b(terrines?|carpaccios?|gravlax|verrines?|tapas|accras?|bruschettas?|gaspachos?|gazpachos?|rillettes?|oeufs? mimosa|salades? de crudites|entrees?)\b/;
const dessert =
  /\b(gateaux?|cheese ?cakes?|tiramisu|biscuits?|gaufres?|pancakes?|beignets? au sucre|eclairs? au chocolat|choux a la creme|sables?|brownies?|cookies?|meringues?|sorbets?|clafoutis|panna cotta|patisseries?|desserts?|profiteroles?|madeleines?|speculoos|creme brulee|riz au lait|salade de fruits|omelette norvegienne|galette des rois)\b/;
const savory =
  /\b(sale[e]?s?|saumon|thon|jambon|lardons?|poulet|boeuf|porc|dinde|chevre|feta|tomates?|courgettes?|epinards?|poireaux?|aubergines?|pommes? de terre)\b/;
const sweet =
  /\b(chocolat|vanille|nutella|caramel|praline|framboises?|fraises?|myrtilles?|bananes?|poires?|pommes?|abricots?|cerises?|citrons?)\b/;
const pastry =
  /\b(tartes?|tartelettes?|cremes?|flans?|mousses?|crepes?|cakes?|muffins?|crumbles?|fondants?|moelleux|gratins?|pizzas?|soupes?|risottos?|raviolis?)\b/;
const main =
  /\b(hachis|parmentier|croziflette|tartiflette|raclette|risottos?|paella|couscous|tajines?|lasagnes?|spaghettis?|tagliatelles?|raviolis?|gnocchis?|bibimbap|currys?|dah?ls?|burgers?|hamburgers?|fajitas?|burritos?|ramen|quiches?|pizzas?|omelettes?|blanquette|bourguignon|cassoulet|pot au feu|paupiettes?|croque monsieur|riz cantonais|chili|woks?|ragouts?|boulettes?|steaks?|rotis?)\b/;
const other =
  /^(?:recette (?:de |du )?)?(?:accompagnements?|boissons?|cocktails?|smoothies?|vinaigrettes?|sauces?|marinades?|confitures?|condiments?|sirops?|pate (?:a|pour) (?:crepes?|tartes?|pizzas?))\b/;

export function discoveryCourse(title: string, categories: string[] = []): Course | null {
  const name = fold(title).replace(/[-_]/g, ' ');
  const tags = fold(categories.join(', ')).replace(/[-_]/g, ' ');
  if (
    other.test(name) ||
    /\b(accompagnements?|boissons?|condiments?|side dish|beverage)\b/.test(tags)
  )
    return null;
  if (/\b(desserts?|patisseries?|confiseries?)\b/.test(tags)) return 'dessert';
  if (/\b(entrees?|hors d'oeuvre|starters?|appetizers?|aperitifs?|tapas)\b/.test(tags))
    return 'starter';
  const isSavory = savory.test(name.replace(/\b(?:beurre|caramel) (?:demi )?sale\b/g, ''));
  if (!isSavory && (dessert.test(name) || (pastry.test(name) && sweet.test(name))))
    return 'dessert';
  if (/\b(plats?|main (?:dish|course)|dinner|lunch|proteines? animales? \+ feculent)\b/.test(tags))
    return 'main';
  if (/^(?:club )?sandwich\b/.test(name)) return 'main';
  if (starter.test(name) || starter.test(tags)) return 'starter';
  if (!isSavory && dessert.test(tags)) return 'dessert';
  if (main.test(name) || main.test(tags)) return 'main';
  if (
    /^(?:poulets?|canards?|saumon|dinde|cabillaud|filets?|bavette|paves?|saute|poelee|endives au jambon)\b/.test(
      name,
    )
  )
    return 'main';
  if (isSavory && /\b(tartes?|crepes?|gratins?)\b/.test(name)) return 'main';
  return null;
}

export function isPlanningDish(title: string, tags: string[]) {
  const course = discoveryCourse(title, tags);
  if (course) return course === 'main';
  // A personal recipe can have a descriptive title and no course tag.
  return (
    !other.test(fold(title)) &&
    !/\b(accompagnements?|boissons?|condiments?|side dish|beverage)\b/.test(fold(tags.join(' ')))
  );
}
