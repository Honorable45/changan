import type { Metadata } from 'next';
import { getCredits } from '@/lib/api';

export const metadata: Metadata = { title: 'Crédits photographiques', alternates: { canonical: '/credits' } };

export default async function Credits() {
  const rows = await getCredits();
  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="display text-[clamp(1.75rem,9vw,4.5rem)]">Crédits photographiques</h1>
      <p className="mt-6 max-w-2xl text-steel">Photographies publiées sous licence libre sur Wikimedia Commons, en attendant les visuels officiels. Les vues extérieures ont été détourées et leurs plaques masquées. Sur l’accueil, les couleurs de l’UNI-K autres que le bleu clair sont simulées à partir de sa photographie. Leur présence n’implique aucune approbation de leurs auteurs. Les licences CC BY-SA imposent de partager à l’identique les versions modifiées.</p>
      <p className="mt-4 max-w-2xl text-steel">Essai virtuel : plan du quartier administratif de Lomé <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">© contributeurs OpenStreetMap</a>, licence ODbL. Le monument de l’Indépendance y est modelé d’après une <a className="underline" href="https://commons.wikimedia.org/wiki/File:Monuments_de_l%27ind%C3%A9pendance_et_Palais_des_congr%C3%A8s_de_Lom%C3%A9.jpg" rel="noopener" target="_blank">photographie de Hermannkass</a> (CC BY-SA 4.0). L’hôtel du 2 Février, la place, le Palais des congrès et l’immeuble du CENETI sont redessinés d’après des vidéos et images de référence, dont aucune n’est reprise.</p>
      <ul className="mt-12">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-1 border-t border-line py-3 text-[0.9375rem] md:grid-cols-12 md:gap-6">
            <span className="md:col-span-6">{r.alt}</span>
            <span className="text-steel md:col-span-3">{r.credit}</span>
            <span className="md:col-span-3">{r.licenseUrl ? <a className="underline" href={r.licenseUrl} rel="noopener" target="_blank">{r.license}</a> : r.license}{r.sourceUrl && <> · <a className="underline" href={r.sourceUrl} rel="noopener" target="_blank">source</a></>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
