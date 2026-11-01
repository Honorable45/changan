import type { Metadata } from 'next';
import { RequestSection } from '@/components/RequestSection';
import { getSite } from '@/lib/api';

export const metadata: Metadata = { title: 'Contact', description: 'Demandez un prix, une information ou un essai routier auprès de CHANGAN Togo.', alternates: { canonical: '/contact' } };

export default async function Contact({ searchParams }: { searchParams: Promise<{ demande?: string }> }) {
  const [site, { demande }] = await Promise.all([getSite(), searchParams]);
  const infos = [['Adresse', site.address], ['Horaires', site.openingHours], ['Téléphone', site.phone], ['Courriel', site.email]].filter(([, v]) => v);
  return (
    <>
      <RequestSection site={site} heading="Contact" level="h1" initialKind={demande === 'essai' ? 'TEST_DRIVE' : demande === 'info' ? 'INFORMATION' : 'PRICE'} />
      {infos.length > 0 && (
        <dl className="shell grid gap-8 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {infos.map(([k, v]) => <div key={k} className="border-t border-ink pt-3"><dt className="text-sm text-steel">{k}</dt><dd className="mt-1">{v}</dd></div>)}
        </dl>
      )}
    </>
  );
}
