import { previewUrl } from '../lib/web-import';
const urls = [
  'https://www.hellofresh.fr/recipes/spaghetti-lardons-creme-and-poireau-fondant-654a5a16d637bf067f0a38da',
  'https://www.marmiton.org/recettes/recette_gratin-dauphinois_13809.aspx',
  'https://www.750g.com/gratin-dauphinois-r31044.htm',
  'https://www.cuisineaz.com/recettes/crepe-facile-78347.aspx',
  'https://jow.fr/fr/recipes/gratin-dauphinois-88j21yhhgnr9j9az0d3w',
];
const results = await Promise.all(
  urls.map(async (url) => {
    const r = await previewUrl(url);
    return {
      site: new URL(url).hostname,
      title: r.data.title,
      ingredients: r.data.ingredients.length,
      steps: r.data.steps.length,
      base: r.data.base,
      warning: r.warning,
    };
  }),
);
console.table(results);
