import type { Metadata } from 'next';
import { getSite } from '@/lib/api';

export const metadata: Metadata = { title: 'Confidentialité', alternates: { canonical: '/confidentialite' } };

export default async function Privacy() {
  const site = await getSite();
  return (
    <article className="shell max-w-3xl pb-24 pt-10 md:pt-16">
      <h1 className="display text-[clamp(1.75rem,9vw,4.5rem)]">Confidentialité</h1>
      {site.privacyPolicy ? <p className="mt-10 whitespace-pre-line leading-relaxed">{site.privacyPolicy}</p> : (
        <div className="mt-10 space-y-6 leading-relaxed">
          <p>Lorsque vous envoyez une demande, ce site enregistre votre nom, votre téléphone, votre message et, si vous les indiquez, votre courriel et le véhicule concerné. Ces données servent uniquement à répondre à votre demande.</p>
          <p>Le site ne dépose aucun cookie publicitaire ni de mesure d’audience. Seul le personnel autorisé, authentifié, peut consulter les demandes, et il peut les supprimer.</p>
          <p>Les boutons WhatsApp ouvrent le service de WhatsApp, soumis à ses propres conditions.</p>
          <p>L’identité du responsable de traitement, la durée de conservation et le point de contact pour exercer vos droits seront précisés par le concessionnaire avant la mise en ligne.</p>
        </div>
      )}
    </article>
  );
}
