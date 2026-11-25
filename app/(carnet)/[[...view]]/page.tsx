import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ view?: string[] }> }) {
  const p = (await params).view ?? [];
  if (
    p.length > 1 ||
    !['', 'recettes', 'semaine', 'courses', 'cuisiner', 'parametres'].includes(p[0] ?? '')
  )
    notFound();
  return null;
}
