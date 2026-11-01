import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const url = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: 'CHANGAN Togo', template: '%s | CHANGAN Togo' },
  description: 'Découvrez la gamme CHANGAN au Togo : photographies, caractéristiques, comparateur et contact avec le concessionnaire.',
  openGraph: { siteName: 'CHANGAN Togo', locale: 'fr_TG', type: 'website' },
};
export const viewport: Viewport = { themeColor: '#0c0d0f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
