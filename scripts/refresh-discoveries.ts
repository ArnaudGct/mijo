import { writeFile } from 'node:fs/promises';
import { sampleSources } from '../lib/discovery-feed';
const rows = await sampleSources(10, Math.floor(Date.now() / 86400000));
if (new Set(rows.map((r) => r.card.publisher)).size !== 5 || rows.length < 15)
  throw Error('Sélection incomplète, catalogue précédent conservé.');
await writeFile(
  new URL('../lib/discovery-seed.json', import.meta.url),
  JSON.stringify(
    rows.map((r) => r.card),
    null,
    2,
  ) + '\n',
);
console.log(rows.length + ' suggestions vérifiées');
