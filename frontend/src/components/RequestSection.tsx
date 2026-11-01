'use client';
import { useState } from 'react';
import type { Site } from '@/lib/types';
import { type RequestKind, whatsappMessage, whatsappUrl } from '@/lib/whatsapp';
import { RequestForm } from './RequestForm';

export function RequestSection({ site, initialKind = 'PRICE', heading = 'Parlons de votre prochain véhicule.', level: Heading = 'h2' }: { site: Site; initialKind?: RequestKind; heading?: string; level?: 'h1' | 'h2' }) {
  const [kind, setKind] = useState<RequestKind>(initialKind);
  return (
    <section className="shell grid gap-12 py-20 md:grid-cols-12 md:py-32" aria-labelledby="contact-titre">
      <div className="md:col-span-5">
        <Heading id="contact-titre" className="display text-[clamp(2.25rem,4.4vw,4.5rem)]">{heading}</Heading>
        {site.whatsappNumber && (
          <a className="btn btn-ghost mt-8 w-full sm:w-auto sm:min-w-72" target="_blank" rel="noopener" href={whatsappUrl(site.whatsappNumber, whatsappMessage(kind === 'TEST_DRIVE' ? 'TEST_DRIVE' : 'INFORMATION'))}>
            Écrire sur WhatsApp
          </a>
        )}
        {kind === 'TEST_DRIVE' && site.testDriveConditions && <p className="mt-6 max-w-md text-[0.9375rem] text-steel">{site.testDriveConditions}</p>}
      </div>
      <div className="md:col-span-6 md:col-start-7"><RequestForm kind={kind} onKindChange={setKind} /></div>
    </section>
  );
}
