import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { RevealManager } from '@/components/Reveal';
import { getCategories, getSite } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite().catch(() => null);
  // Tant que le site présente des données de démonstration, il reste hors des moteurs de recherche.
  return site?.demoMode === false ? {} : { robots: { index: false, follow: false } };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [site, categories] = await Promise.all([getSite(), getCategories()]);
  return (
    <div className="theme-dark">
      <a href="#contenu" className="sr-only z-50 bg-ink p-3 text-paper focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Aller au contenu</a>
      {site.demoMode && (
        <p className="relative z-50 bg-[#0b0c0e] px-4 py-1.5 text-center text-xs leading-snug text-white/60">
          Maquette de démonstration, données à confirmer. <Link href="/credits" className="underline">Sources</Link>
        </p>
      )}
      <Header logoUrl={site.logoUrl} />
      <main id="contenu">{children}</main>
      <Footer site={site} categories={categories} />
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <filter id="verre-liquide" x="-10%" y="-30%" width="120%" height="160%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" seed="7" result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <RevealManager />
    </div>
  );
}
