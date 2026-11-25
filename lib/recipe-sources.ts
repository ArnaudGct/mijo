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
