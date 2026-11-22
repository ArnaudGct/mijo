import type { Ingredient } from './model';
export const clean = (s: string) =>
  s.trim().toLocaleLowerCase('fr').replace(/’/g, "'").replace(/\s+/g, ' ').normalize('NFC');
const units: Record<string, [string, number]> = {
  g: ['g', 1],
  gramme: ['g', 1],
  kg: ['g', 1000],
  kilogramme: ['g', 1000],
  mg: ['g', 0.001],
  ml: ['ml', 1],
  millilitre: ['ml', 1],
  cl: ['ml', 10],
  centilitre: ['ml', 10],
  l: ['ml', 1000],
  litre: ['ml', 1000],
  pièce: ['pièce', 1],
  unité: ['pièce', 1],
  cs: ['càs', 1],
  càs: ['càs', 1],
  'cuillère à soupe': ['càs', 1],
  cc: ['càc', 1],
  càc: ['càc', 1],
  'cuillère à café': ['càc', 1],
};
export function normalize(q: number, u: string): [number, string] {
  const raw = clean(u).replace(/\(s\)/g, '');
  const key = raw in units ? raw : raw.replace(/s$/, '');
  const [unit, k] = units[key] ?? [raw, 1];
  return [q * k, unit];
}
export const rounded = (n: number) => Math.round(n * 1e6) / 1e6;
const fractions: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};
export function amount(value: string) {
  const v = value
    .trim()
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (m) => ' ' + fractions[m])
    .trim()
    .replace(',', '.');
  if (!/^\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?$/.test(v)) return null;
  const n = v.split(/\s+/).reduce((sum, p) => {
    const [a, b] = p.split('/').map(Number);
    return sum + a / (b ?? 1);
  }, 0);
  return Number.isFinite(n) && n > 0 ? rounded(n) : null;
}
export function categorize(name: string): Ingredient['category'] {
  const s = clean(name);
  if (
    /^(poireau|oignon|tomate|persil|citron|carotte|champignon|courgette|aubergine|poivron|concombre|pomme|gousse d'ail|gingembre|salade|basilic|coriandre)/.test(
      s,
    )
  )
    return 'Fruits et légumes';
  if (
    /^(bavette|poulet|bœuf|crevette|saumon|dinde|porc|lardon|filet de|pavé de|chair à saucisse|steak|blanc de poulet|émincés de|jambon|poitrine fumée|chorizo|cabillaud|haddock|merlu|truite)/.test(
      s,
    )
  )
    return 'Viandes et poissons';
  if (/^(beurre|crème|yaourt|fromage|burrata|mozzarella|tofu)/.test(s)) return 'Produits frais';
  if (/^(riz|pâte|huile|épice|sel|poivre|farine|sucre|vinaigre|spaghetti|orzo|bouillon)/.test(s))
    return 'Épicerie';
  return 'Autres';
}
// French grocery aisles. Prepared sauces and canned foods belong to the pantry
// even when their name contains a vegetable, fish or dairy product.
export function shoppingCategory(name: string): Ingredient['category'] {
  const s = clean(name).replace(/^\(mini\)\s*/, '');
  if (/surgel[ée]/.test(s)) return 'Surgelés';
  if (
    /en conserve|au naturel|séché|séchée|en poudre|précuit|rouges en boîte/.test(s) ||
    /^(sauce |concentré|chair de tomate|lait de coco|huile|pesto|purée d'ail|purée de gingembre|cube de bouillon|bouillon|moutarde|miso|mayonnaise|ketchup|aïoli|chutney|assaisonnement|garam|gomasio|curry|zaatar|piri-piri|feuille de laurier|noix de muscade)/.test(
      s,
    )
  )
    return 'Épicerie';
  if (
    /^(lait|œuf|oeuf|cheddar|gouda|cantal|copeaux de grana|parmigiano|pecorino|ricotta|panir|labneh|sarasson|mascarpone|guacamole|boulettes thaï|émincés veggie|tortelloni|ravioli|gnocchi)|fraîches?$/.test(
      s,
    )
  )
    return 'Produits frais';
  if (
    /^(dés de (chorizo|filet)|viande hachée|tranches de carré de porc|cuisse de poulet|paupiette|médaillons de porc|coppa|prosciutto|confit de canard|effiloché de porc|farce au porc|saucisse|miettes de saumon)/.test(
      s,
    )
  )
    return 'Viandes et poissons';
  if (
    /^(échalote|tête d'ail|ail des ours|épinard|chou|navet|radis|ciboulette|brocol|portobello|menthe|aneth|cerfeuil|piment|avocat|mangue|kiwi|betterave|pak choï|melon|céleri|pastèque|nectarine|myrtille|abricot|patate douce|mélange de carotte|petits pois|edamame)/.test(
      s,
    )
  )
    return 'Fruits et légumes';
  if (
    /^(couscous|penne|linguine|rigatoni|semoule|casarecce|boulgour|quinoa|coquillettes|farfalle|fusilli|conchiglie|freekeh|lentille|haricot|mélange de haricots|pois chiches|nouilles|pain|petit pain|tortilla|cumin|curcuma|paprika|herbes de provence|olive|chapelure|pignon|cacahuète|graines|pistache|amande|noisette|noix|raisins secs|cassonade|miel|levure|pépite|avoine cuisine)/.test(
      s,
    )
  )
    return 'Épicerie';
  return categorize(s);
}
const number = '(?:\\d+\\s+\\d+/\\d+|\\d+[/]\\d+|\\d+(?:[.,]\\d+)?\\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞])';
export function parseLine(raw: string): Ingredient {
  let name = raw.trim(),
    unit = '',
    quantity: number | null = null;
  const tagged = raw.match(/^(?:<b>|\*\*)(.+?)(?:<\/b>|\*\*)\s*(.*)$/i);
  if (tagged) {
    name = tagged[1].trim();
    const v = tagged[2].trim().replace(/^\((.*)\)$/, '$1');
    const m = v.match(new RegExp('^(' + number + ')\\s*(.*)$'));
    if (v === 'selon le goût') unit = v;
    if (m) {
      quantity = amount(m[1]);
      unit = m[2].replace(/\(s\)/g, '').trim();
    }
  } else if (/^.+?\s+\([\d½⅓⅔¼¾]/.test(raw)) {
    const m = raw.match(/^(.+?)\s+\((.+)\)$/);
    if (m) {
      const parsed = parseLine('<b>' + m[1] + '</b> (' + m[2] + ')');
      return { ...parsed, raw };
    }
  } else if (raw.includes('|')) {
    const [n, q, u] = raw.split('|');
    name = n.trim();
    quantity = amount(q ?? '');
    unit = (u ?? '').trim();
  } else {
    const m = raw.trim().match(new RegExp('^(' + number + ')\\s*(.+)$'));
    if (m) {
      quantity = amount(m[1]);
      const tail = m[2].trim().replace(/\(s\)/g, '');
      const found = tail.match(
        /^(cuillères? à (?:soupe|café)|kilogrammes?|grammes?|millilitres?|litres?|kg|mg|ml|cl|g|l|pièces?|càs|càc|cs|cc|sachets?|gousses?|gou|pincées?|pinc|pots?|tranches?|paquets?|briques?|boîtes?|bouteilles?|noisettes?|pincements?|verres?|bouquets?|branches?|brins?|cm)\.?\s+(?:d[e’']\s*|d'|de la |du )?(.+)$/i,
      );
      if (found) {
        unit =
          ({ gou: 'gousse', pinc: 'pincée' } as Record<string, string>)[found[1].toLowerCase()] ??
          found[1];
        name = found[2].replace(/^d['’]/, '');
      } else {
        unit = /^(?:[\p{L}]+\.|[0-9]|à\s|[-–])/u.test(tail) ? '' : 'pièce';
        name = tail;
      }
    }
  }
  name = name.replace(/^selon le goût\s+/i, '');
  return { name: name || raw, quantity, unit, raw, category: categorize(name) };
}
