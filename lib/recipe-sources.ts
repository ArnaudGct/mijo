import type { Course } from './discovery-course';
import type { RecipeCost } from './market';

export const discoveryPublishers = [
  'HelloFresh',
  'Batchly',
  'Marmiton',
  'CuisineAZ',
  'Jow',
  '750g',
] as const;

export const importSites = [
  { name: 'Batchly', example: 'https://www.batchly.fr/recettes/hachis-parmentier' },
  {
    name: 'HelloFresh France',
    example:
      'https://www.hellofresh.fr/recipes/spaghetti-lardons-creme-and-poireau-fondant-654a5a16d637bf067f0a38da',
  },
  {
    name: 'Marmiton',
    example: 'https://www.marmiton.org/recettes/recette_gratin-dauphinois_13809.aspx',
  },
  { name: '750g', example: 'https://www.750g.com/gratin-dauphinois-r31044.htm' },
  { name: 'CuisineAZ', example: 'https://www.cuisineaz.com/recettes/crepe-facile-78347.aspx' },
  { name: 'Jow', example: 'https://jow.fr/fr/recipes/gratin-dauphinois-88j21yhhgnr9j9az0d3w' },
];

export type Discovery = {
  cost?: RecipeCost;
  batch?: boolean;
  course: Course;
  title: string;
  url: string;
  image: string;
  publisher: string;
  minutes: number | null;
};

export function discoveryTitle(title: string) {
  return title
    .replace(/\s*:\s*la meilleure recette\s*$/i, '')
    .replace(/^Recette\s*[-–:]\s*/i, '')
    .trim();
}

export function planningSource(recipe: { source: string; url: string }) {
  const source = recipe.source.trim();
  const domain = URL.canParse(recipe.url) ? new URL(recipe.url).hostname.replace(/^www\./, '') : '';
  const site = importSites.find((site) => {
    const host = new URL(site.example).hostname.replace(/^www\./, '');
    return source.toLowerCase().replace(/^www\./, '') === host || (!source && domain === host);
  });
  if (site) return site.name.replace(' France', '');
  return (
    discoveryPublishers.find((name) => name.toLowerCase() === source.toLowerCase()) ??
    (source || domain || 'Personnelle')
  );
}
