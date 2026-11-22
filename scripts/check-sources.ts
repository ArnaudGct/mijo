import { previewUrl } from '../lib/web-import';
import { importSites } from '../lib/recipe-sources';
const results = await Promise.all(
  importSites.map(async ({ example: url }) => {
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
