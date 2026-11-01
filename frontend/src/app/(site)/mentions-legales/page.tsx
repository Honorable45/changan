import type { Metadata } from 'next';
import { getSite } from '@/lib/api';

export const metadata: Metadata = { title: 'Mentions légales', alternates: { canonical: '/mentions-legales' } };

export default async function Legal() {
  const site = await getSite();
  return (
    <article className="shell max-w-3xl pb-24 pt-10 md:pt-16">
      <h1 className="display text-[clamp(1.75rem,9vw,4.5rem)]">Mentions légales</h1>
      <p className="mt-10 whitespace-pre-line leading-relaxed">{site.legalNotice ?? 'Les informations légales de l’éditeur (raison sociale, siège, immatriculation, responsable de publication, hébergeur) seront publiées après confirmation par le concessionnaire.'}</p>
    </article>
  );
}
