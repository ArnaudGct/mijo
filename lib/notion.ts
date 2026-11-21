import { blankRecipe, recipe, problems } from './model';
import { parseLine } from './ingredients';
export type Page = {
  id: string;
  title: string;
  content: string;
  cover?: string;
  url?: string;
  rating?: number;
  truncated?: boolean;
};
export function parseNotion(p: Page) {
  const md = p.content.replace(/\r/g, '');
  const heading = md.match(/(?:^|\n)#{1,3}[^\n]*ingrédients[^\n]*\n([\s\S]*?)(?=\n#{1,3} |$)/i);
  const ingredients = (heading?.[1] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*+] /.test(l))
    .map((l) => parseLine(l.slice(2).trim()));
  const section =
    md.match(/(?:^|\n)#{1,2}[^\n]*(?:préparation|instructions|étapes)[^\n]*\n([\s\S]*)/i)?.[1] ??
    '';
  const numbered = /^\s*1[.)]\s+/m.test(section) && !/^### /m.test(section);
  const chunks = numbered
    ? section.split(/(?:^|\n)\s*\d+[.)]\s+/).filter((s) => s.trim())
    : section.split(/(?:^|\n)#{2,4}\s+(?=(?:Étape|Etape|Step)\s*\d+)/i).filter((s) => s.trim());
  const steps = chunks.flatMap((c) => {
    const photo = c.match(/!\[[^\]]*\]\(((?:https?:\/\/|\/api\/media\/)[^)]+)\)/)?.[1] ?? '';
    const text = c
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return text ? [{ text, image: photo }] : [];
  });
  const base = md.match(/(?:^|\n)(?:portions?|personnes?)\s*:\s*(\d+)\b/i);
  const original = md.match(/https?:\/\/(?:www\.)?hellofresh\.fr\/recipes\/[^\s)<>]+/)?.[0] ?? '';
  const nutrition = md.match(/(?:[\d.,]+\s*kcal|[\d.,]+\s*g\s*protéines)/gi)?.join(' · ') ?? '';
  const data = recipe.parse({
    ...blankRecipe(),
    title: p.title,
    base: base ? Number(base[1]) : null,
    ingredients,
    steps,
    total: Number(md.match(/(?:⏱️?\s*|Durée\s*:\s*)(\d+)\s*min/i)?.[1]) || null,
    difficulty: md.match(/📊\s*([^\n•<]+)/)?.[1]?.trim() ?? '',
    nutrition,
    source: 'Notion',
    url: original,
    image: p.cover?.startsWith('https://') || p.cover?.startsWith('/api/media/') ? p.cover : '',
    rights:
      'Fiche personnelle importée de Notion. Les droits des textes et photos restent ceux de leurs auteurs.',
    rating: p.rating ?? 0,
    favorite: (p.rating ?? 0) >= 4,
  });
  return {
    sourceKey: 'notion:' + p.id.toLowerCase().replaceAll('-', ''),
    data,
    original: JSON.stringify(p),
    issues: [...problems(data), ...(p.truncated ? ['Source partielle'] : [])],
  };
}
