import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite } from '@/lib/api';

export const metadata: Metadata = { title: 'Services', description: 'Demande de prix, essai routier et informations auprès de CHANGAN Togo.', alternates: { canonical: '/services' } };

const SERVICES = [
  { title: 'Demande de prix', text: 'Indiquez le modèle qui vous intéresse et recevez une réponse du concessionnaire.', href: '/contact?demande=prix', cta: 'Demander un prix' },
  { title: 'Essai routier', text: 'Demandez un rendez-vous pour prendre le volant.', href: '/contact?demande=essai', cta: 'Réserver un essai' },
  { title: 'Informations', text: 'Une question sur la gamme, une version ou un équipement ?', href: '/contact?demande=info', cta: 'Poser une question' },
];

export default async function Services() {
  const site = await getSite();
  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="mega text-[clamp(2rem,11vw,10rem)]">Services</h1>
      <ul className="mt-12 md:mt-20">
        {SERVICES.map((s) => (
          <li key={s.title} className="grid gap-4 border-t border-ink py-8 md:grid-cols-12 md:items-center">
            <h2 className="display text-3xl md:col-span-5 md:text-4xl">{s.title}</h2>
            <p className="text-steel md:col-span-4">{s.text}</p>
            <Link href={s.href} className="btn btn-ghost md:col-span-3">{s.cta}</Link>
          </li>
        ))}
      </ul>
      {site.testDriveConditions && <section className="mt-12 max-w-2xl"><h2 className="display text-2xl">Conditions d’essai</h2><p className="mt-3 whitespace-pre-line text-steel">{site.testDriveConditions}</p></section>}
      {site.warrantyText && <section className="mt-12 max-w-2xl"><h2 className="display text-2xl">Garantie</h2><p className="mt-3 whitespace-pre-line text-steel">{site.warrantyText}</p></section>}
    </div>
  );
}
