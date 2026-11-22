import { clean, normalize } from './ingredients';

export const fold = (s: string) =>
  clean(s)
    .replaceAll('œ', 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const aliases: [RegExp, string][] = [
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
  [
    /^bouillon cube (legumes|de legumes)$|^cube de bouillon de legumes$/,
    'Bouillon cube de légumes',
  ],
  [/^bouillon cube volaille$|^cube de bouillon de volaille$/, 'Bouillon cube de volaille'],
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
  if (groceryName(name) === 'Ail') {
    if (/^tetes?/.test(fold(name)) && u === 'pièce') return [q, 'tête'];
    if (/^gousses?/.test(fold(name)) && u === 'pièce') return [q, 'gousse'];
  }
  return [q, u];
}
