import { today, monday } from '@/lib/dates';
import { date } from '@/lib/model';
import { notFound } from 'next/navigation';
import { authenticated } from '@/lib/auth';
import { state } from '@/lib/db';
import { Login, Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ view?: string[] }>;
  searchParams: Promise<{ week?: string; session?: string }>;
}) {
  const p = (await params).view ?? [];
  if (
    p.length > 1 ||
    !['', 'recettes', 'semaine', 'courses', 'cuisiner', 'parametres'].includes(p[0] ?? '')
  )
    notFound();
  if (!(await authenticated())) return <Login />;
  const data = await state(),
    query = await searchParams;
  const week = monday(date.safeParse(query.week).success ? query.week! : today());
  return (
    <Workspace
      key={(p[0] ?? '') + week}
      initialWeek={week}
      initialSession={query.session ?? ''}
      initial={data}
      view={p[0] ?? ''}
    />
  );
}
