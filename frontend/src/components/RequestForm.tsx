'use client';
import { FormEvent, useId, useState } from 'react';
import type { RequestKind } from '@/lib/whatsapp';

const TITLES: Record<RequestKind, string> = { PRICE: 'Demander le prix', TEST_DRIVE: 'Réserver un essai', INFORMATION: 'Demander une information' };
export { TITLES as REQUEST_TITLES };

export function RequestForm({ kind, vehicleSlug, vehicleName, version, onKindChange }: {
  kind: RequestKind; vehicleSlug?: string; vehicleName?: string; version?: string; onKindChange?: (k: RequestKind) => void;
}) {
  const id = useId();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/contact-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: kind, name: f.get('name'), phone: f.get('phone'), email: f.get('email'), message: f.get('message'),
          vehicleSlug, versionLabel: version, website: f.get('website'), consent: f.get('consent') === 'on',
        }),
      });
      if (res.status === 429) throw new Error('Trop de demandes en peu de temps. Réessayez dans une minute.');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(Array.isArray(body?.message) ? body.message[0] : 'Votre demande n’a pas pu être envoyée. Réessayez.');
      }
      setState('done');
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Connexion impossible. Vérifiez votre réseau et réessayez.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div role="status">
        <p className="display text-2xl">Demande envoyée.</p>
        <p className="mt-3 text-steel">Un conseiller vous recontactera au numéro indiqué{vehicleName ? ` au sujet du ${vehicleName}` : ''}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
      {onKindChange && (
        <fieldset className="sm:col-span-2">
          <legend className="eyebrow text-steel">Votre demande</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(TITLES) as RequestKind[]).map((k) => (
              <label key={k} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-[0.9375rem] transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${kind === k ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}>
                <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => onKindChange(k)} />
                {k === 'PRICE' ? 'Prix' : k === 'TEST_DRIVE' ? 'Essai routier' : 'Information'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div><label htmlFor={`${id}-n`} className="text-sm text-steel">Nom</label><input id={`${id}-n`} name="name" required minLength={2} maxLength={120} autoComplete="name" className="field" /></div>
      <div><label htmlFor={`${id}-p`} className="text-sm text-steel">Téléphone</label><input id={`${id}-p`} name="phone" type="tel" required autoComplete="tel" pattern="\+?[0-9 \(\)\.\-]{8,20}" title="8 à 20 chiffres, indicatif possible" className="field" /></div>
      <div className="sm:col-span-2"><label htmlFor={`${id}-e`} className="text-sm text-steel">Courriel (facultatif)</label><input id={`${id}-e`} name="email" type="email" autoComplete="email" className="field" /></div>
      <div className="sm:col-span-2"><label htmlFor={`${id}-m`} className="text-sm text-steel">Message (facultatif)</label><textarea id={`${id}-m`} name="message" rows={2} maxLength={1500} className="field resize-y" /></div>
      <div className="absolute left-[-9999px]" aria-hidden="true"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex gap-3 text-sm text-steel sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]" />
        <span>J’accepte que ces informations soient utilisées pour répondre à ma demande. <a href="/confidentialite" target="_blank" className="underline">Politique de confidentialité</a>.</span>
      </label>
      {error && <p role="alert" className="border-l-2 border-red-500 pl-3 text-sm text-red-500 sm:col-span-2">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="btn btn-primary sm:col-span-2">{state === 'sending' ? 'Envoi en cours…' : 'Envoyer la demande'}</button>
    </form>
  );
}
