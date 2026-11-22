import { clean, normalize } from './ingredients';

export const fold = (s: string) =>
  clean(s)
    .replaceAll('œ', 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const aliases: [RegExp, string][] = [
  [/^lait(?: de vache| (?:demi[- ]ecreme|entier|ecreme)(?: uht)?| uht)?$/, 'Lait'],
  [/^flocons? (?:d'|de l')avoine(?: complets?| nature)?$/, 'Flocons d’avoine'],
  [/^skyr(?: nature)?$/, 'Skyr nature'],
  [/^cannelle(?: (?:en poudre|moulue))?$/, 'Cannelle moulue'],
  [
    /^(?:cube de bouillon de legumes|bouillon(?: cube)? (?:de )?legumes|bouillon de legumes en cube)$/,
    'Bouillon de légumes',
  ],
  [
    /^(?:cube de bouillon de volaille|bouillon(?: cube)? (?:de )?volaille)$/,
    'Bouillon de volaille',
  ],
  [/^(?:cube de bouillon de boeuf|bouillon(?: cube)? (?:de )?boeuf)$/, 'Bouillon de bœuf'],
  [/^(oignons?)( (rouges?|jaunes?|blancs?|doux|roses?))?$/, 'Oignon'],
  [/^carottes?( violettes?)?$/, 'Carotte'],
  [/^tomates?( cotelees?)?$/, 'Tomate'],
  [/^tomates? cerises?$/, 'Tomates cerises'],
  [/^poivrons?( rouges?|verts?|jaunes?)?$/, 'Poivron'],
  [/^(?:\(mini\) |mini )?concombres?$/, 'Concombre'],
  [/^poireaux?$/, 'Poireau'],
  [/^pommes? de terre$/, 'Pommes de terre'],
  [/^champignons?( de paris)?( eminces?)?$/, 'Champignons'],
  [/^(filets?|blancs?) de poulet( label rouge)?$/, 'Filet de poulet'],
  [/^oeufs?( entiers?)?$/, 'Œuf'],
  [/^(gousses? d'ail|tetes? d'ail|ail)$/, 'Ail'],
  [/^sucre( en poudre)?$/, 'Sucre'],
  [/^farine( de ble)?$/, 'Farine'],
  [/^beurre( doux)?( fondu)?$/, 'Beurre'],
  [/^epices (a l'italienne|italiennes)$/, 'Épices italiennes'],
  [/^lardons? fumes?( sans nitrite)?$/, 'Lardons fumés'],
  [/^jambon blanc( sans nitrite)?$/, 'Jambon blanc'],
  [/^pecorino( aop)? rape$/, 'Pecorino râpé'],
  [/^vinaigre balsamique( blanc \/ riz| noir| blanc)?$/, 'Vinaigre balsamique'],
  [/^vinaigre de vin (blanc|rouge ou de cidre)$/, 'Vinaigre de vin'],
  [/^salade( en sachet)?$/, 'Salade'],
  [/^tofu( nature)?$/, 'Tofu'],
  [/^(basilic|courgette|poireau|pomme|citron|aubergine|echalote|avocat)s?$/, ''],
];
export function groceryName(name: string) {
  const base = fold(name);
  for (const [pattern, label] of aliases) {
    const m = base.match(pattern);
    if (m)
      return (
        label ||
        name
          .trim()
          .replace(/s$/i, '')
          .replace(/^./u, (c) => c.toLocaleUpperCase('fr'))
      );
  }
  return name.trim().replace(/^./u, (c) => c.toLocaleUpperCase('fr'));
}

export function groceryMeasure(name: string, quantity: number, unit: string): [number, string] {
  const [q, u] = normalize(quantity, unit);
  if (/^(huile|vinaigre|lait)\b/.test(fold(name)) && (u === 'càs' || u === 'càc'))
    return [q * (u === 'càs' ? 15 : 5), 'ml'];
  if (groceryName(name) === 'Ail') {
    if (/^tetes?/.test(fold(name)) && u === 'pièce') return [q, 'tête'];
    if (/^gousses?/.test(fold(name)) && u === 'pièce') return [q, 'gousse'];
  }
  return [q, u];
}
