import type { Metadata } from 'next';
import { JeuLien } from '@/components/JeuLien';

export const metadata: Metadata = { title: 'Essai virtuel', description: 'Le jeu en 3D dans le quartier administratif de Lomé : conduisez, marchez, volez et croisez les autres joueurs en ligne, avant de réserver un vrai essai.', alternates: { canonical: '/essai-virtuel' } };

/** Le jeu est une application à part (dossier jeu/) : cette page le présente et y mène. */
export default function EssaiVirtuel() {
  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="mega text-[clamp(2rem,11vw,10rem)]">Essai virtuel</h1>
      <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12">
        <div className="md:col-span-6">
          <p className="display text-2xl md:text-3xl">Prenez le volant de la Nevo Q05 dans le quartier administratif de Lomé, puis réservez le vrai essai.</p>
          <p className="mt-5 text-steel">Un parcours guidé de deux à trois minutes, ou la ville en liberté : voitures, motos, hélicoptère, l’IAI-Togo et le supermarché Le Champion. En ligne, vous croisez les autres joueurs.</p>
          <div className="mt-8 grid gap-3 sm:max-w-sm">
            <JeuLien className="btn btn-light w-full">Lancer le jeu</JeuLien>
          </div>
          <p className="mt-4 text-sm text-steel">Le jeu s’ouvre dans votre navigateur, sans installation. Il demande un appareil capable d’afficher la 3D.</p>
        </div>
      </div>
    </div>
  );
}
