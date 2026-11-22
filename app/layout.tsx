import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans/index.css';
import '@fontsource/hedvig-letters-serif/latin-400.css';
import './style.css';
import { authenticated } from '@/lib/auth';
import { state } from '@/lib/db';
import { Login, Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Table de saison · Mon carnet de cuisine',
  description: 'Votre carnet privé de recettes, menus et courses.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#354c38' };
export default async function Layout({ children }: { children: React.ReactNode }) {
  const initial = (await authenticated()) ? await state() : null;
  return (
    <html lang="fr">
      <body>{initial ? <Workspace initial={initial}>{children}</Workspace> : <Login />}</body>
    </html>
  );
}
