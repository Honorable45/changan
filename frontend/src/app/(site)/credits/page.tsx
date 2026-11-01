import type { Metadata } from 'next';
import { getCredits } from '@/lib/api';

export const metadata: Metadata = { title: 'Crédits photographiques', alternates: { canonical: '/credits' } };

export default async function Credits() {
  const rows = await getCredits();
  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="display text-[clamp(1.75rem,9vw,4.5rem)]">Crédits photographiques</h1>
      <p className="mt-6 max-w-2xl text-steel">Photographies publiées sous licence libre sur Wikimedia Commons, en attendant les visuels officiels. Les vues extérieures ont été détourées et leurs plaques masquées. Sur l’accueil, les couleurs de l’UNI-K autres que le bleu clair sont simulées à partir de sa photographie. Leur présence n’implique aucune approbation de leurs auteurs. Les licences CC BY-SA imposent de partager à l’identique les versions modifiées.</p>
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
