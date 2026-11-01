import Link from 'next/link';
import type { Category, Site } from '@/lib/types';
import { Logo } from './Logo';

export function Footer({ site, categories }: { site: Site; categories: Category[] }) {
  const socials = ([['Facebook', site.facebookUrl], ['Instagram', site.instagramUrl], ['TikTok', site.tiktokUrl], ['YouTube', site.youtubeUrl], ['LinkedIn', site.linkedinUrl]] as const).filter(([, u]) => u);
  const hasContact = site.address || site.phone || site.email || site.openingHours;
  return (
    <footer className="bg-mist text-ink">
      <div className="shell grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-4"><Link href="/" aria-label="Accueil CHANGAN Togo" className="inline-flex min-h-11 items-center"><Logo url={site.logoUrl} /></Link>
          {site.dealerName && <p className="mt-4 text-sm text-steel">{site.dealerName}</p>}
        </div>
        <FooterList title="Catalogue" links={[...categories.map((c) => ({ href: `/vehicules?categorie=${c.slug}`, label: c.name })), { href: '/comparer', label: 'Comparateur' }]} />
        <FooterList title="Le site" links={[{ href: '/marque', label: 'La marque' }, { href: '/services', label: 'Services' }, { href: '/contact', label: 'Contact' }]} />
        <div className="md:col-span-4">
          <h2 className="eyebrow text-steel">Concessionnaire</h2>
          {hasContact ? (
            <address className="mt-4 space-y-2 text-[0.9375rem] not-italic">
              {site.address && <p>{site.address}</p>}
              {site.openingHours && <p>{site.openingHours}</p>}
              {site.phone && <p><a className="link-line" href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a></p>}
              {site.email && <p><a className="link-line" href={`mailto:${site.email}`}>{site.email}</a></p>}
            </address>
          ) : <p className="mt-4 text-[0.9375rem] text-steel">Coordonnées en attente de confirmation par le concessionnaire.</p>}
          {socials.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[0.9375rem]">
              {socials.map(([name, url]) => <li key={name}><a className="link-line" rel="noopener" target="_blank" href={url!}>{name}</a></li>)}
            </ul>
          )}
        </div>
      </div>
      <div className="shell flex flex-col gap-3 border-t border-line py-6 text-sm text-steel sm:flex-row sm:justify-between">
        <p>CHANGAN Togo</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li><Link className="hover:text-ink" href="/mentions-legales">Mentions légales</Link></li>
          <li><Link className="hover:text-ink" href="/confidentialite">Confidentialité</Link></li>
          <li><Link className="hover:text-ink" href="/credits">Crédits photographiques</Link></li>
        </ul>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="md:col-span-2">
      <h2 className="eyebrow text-steel">{title}</h2>
      <ul className="mt-4 space-y-1 text-[0.9375rem]">
        {links.map((l) => <li key={l.href}><Link className="inline-flex min-h-8 items-center hover:opacity-60" href={l.href}>{l.label}</Link></li>)}
      </ul>
    </div>
  );
}
