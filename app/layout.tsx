import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans/index.css';
import '@fontsource/hedvig-letters-serif/latin-400.css';
import './style.css';
import { authenticated } from '@/lib/auth';
import { state } from '@/lib/db';
import { Login, Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Mijo · Mon carnet de cuisine',
  applicationName: 'Mijo',
  appleWebApp: { capable: true, title: 'Mijo' },
  description: 'Votre carnet privé de recettes, menus et courses.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.png?v=mijo', apple: '/icon.png?v=mijo' },
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
