'use client';
import { useId, useRef, useState } from 'react';
import { type RequestKind, whatsappMessage, whatsappUrl } from '@/lib/whatsapp';
import { REQUEST_TITLES, RequestForm } from './RequestForm';

/** Parcours commercial : WhatsApp si le numéro est configuré, formulaire dans tous les cas. */
export function ContactActions({ whatsapp, vehicleSlug, vehicleName, versions = [], layout = 'row', tone = 'light' }: {
  whatsapp: string | null; vehicleSlug: string; vehicleName: string; versions?: string[]; layout?: 'row' | 'bar'; tone?: 'light' | 'dark';
}) {
  const [version, setVersion] = useState(versions.length === 1 ? versions[0] : '');
  const [kind, setKind] = useState<RequestKind>('PRICE');
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const openForm = (k: RequestKind) => { setKind(k); dialog.current?.showModal(); };

  const action = (k: RequestKind, cls: string, label: string) => whatsapp ? (
    <a className={cls} href={whatsappUrl(whatsapp, whatsappMessage(k, vehicleName, version))} target="_blank" rel="noopener">{label}</a>
  ) : (
    <button type="button" className={cls} onClick={() => openForm(k)}>{label}</button>
  );

  return (
    <>
      {layout === 'row' && versions.length > 1 && (
        <div className="mb-4 max-w-sm">
          <label htmlFor="choix-version" className="text-sm opacity-70">Version</label>
          <select id="choix-version" value={version} onChange={(e) => setVersion(e.target.value)} className="field">
            <option value="">Toutes les versions</option>
            {versions.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      )}
      <div className={layout === 'bar' ? 'grid grid-cols-2' : 'flex flex-col gap-3 sm:flex-row sm:flex-wrap'}>
        {action('PRICE', `btn ${tone === 'dark' || layout === 'bar' ? 'btn-light' : 'btn-primary'} ${layout === 'row' ? 'sm:min-w-56' : 'after:hidden! min-h-11! justify-center px-2! text-sm!'}`, 'Demander le prix')}
        {action('TEST_DRIVE', `btn ${layout === 'row' ? 'btn-ghost sm:min-w-56' : 'text-white after:hidden! min-h-11! justify-center px-2! text-sm!'}`, 'Réserver un essai')}
      </div>
      {whatsapp && layout === 'row' && (
        <p className="mt-3 text-sm opacity-70">
          Ces boutons ouvrent WhatsApp. <button type="button" className="min-h-6 underline" onClick={() => openForm('PRICE')}>Passer par le formulaire</button>
        </p>
      )}
      <dialog ref={dialog} aria-labelledby={dialogTitle} className="glass-sheet m-auto max-h-[92dvh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto p-6 sm:p-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-steel">CHANGAN {vehicleName}{version ? ` · ${version}` : ''}</p>
            <h2 id={dialogTitle} className="display mt-2 text-3xl">{REQUEST_TITLES[kind]}</h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Fermer" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-2xl">×</button>
        </div>
        <RequestForm kind={kind} vehicleSlug={vehicleSlug} vehicleName={vehicleName} version={version || undefined} />
      </dialog>
    </>
  );
}
