import { fold } from './grocery-names';
import { shoppingCategory } from './ingredients';
import { categories } from './model';

const household = [
  [
    'Hygiène et soins',
    /^(?:gels? douche|savons?|shamp[o]+ings?|apres.shampoings?|cotons?[ -]?tiges?|dentifrices?|brosses? a dents|deodorants?|rasoirs?|protections? periodiques?)\b/,
  ],
  [
    'Entretien et vaisselle',
    /^(?:liquides? vaisselle|produits? vaisselle|tablettes? (?:de |pour )?(?:lave.vaisselle|vaisselle)|(?:pastilles?|sels?) (?:pour )?lave.vaisselle|eponges?|nettoyants?|produits? (?:menagers?|d'entretien)|javel|vinaigre (?:menager|de nettoyage))\b/,
  ],
  [
    'Linge et lessive',
    /^(?:lessives?|assouplissants?|adoucissants?|detachants?|lingettes? anti.decoloration)\b/,
  ],
  [
    'Papier et sacs',
    /^(?:papiers? (?:toilette|hygienique|cuisson|aluminium)|essuie.tout|mouchoirs?|sacs? (?:poubelle|de congelation)|film alimentaire)\b/,
  ],
  ['Bébé', /^(?:couches?|lingettes? bebe|biberons?)\b/],
  ['Animalerie', /^(?:croquettes?|litieres?|patee (?:pour |de )?(?:chat|chien))\b/],
] as const;
export const householdAisle = (name: string) =>
  household.find(([, pattern]) => pattern.test(fold(name)))?.[0];
export const isHouseholdAisle = (name: string) => household.some(([aisle]) => aisle === name);
export function shoppingAisles(custom: string[]) {
  const named = new Set([
    ...categories.filter((c) => c !== 'Autres'),
    'Boulangerie',
    'Boissons',
    ...household.map(([name]) => name),
    ...custom.filter((name) => name !== 'Autres'),
  ]);
  return [...named, 'Autres'];
}
export function suggestAisle(name: string) {
  const value = fold(name);
  if (/^(?:baguettes?|pains?|croissants?|brioches?)\b/.test(value)) return 'Boulangerie';
  if (/^(?:eau|eaux|jus|sodas?|bieres?|vins?)\b/.test(value)) return 'Boissons';
  return householdAisle(value) ?? shoppingCategory(name);
}
