import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = { title: { default: 'Administration', template: '%s | Administration CHANGAN Togo' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: '#0c0d0f' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body><div className="min-h-dvh bg-mist">{children}</div></body>
    </html>
  );
}
