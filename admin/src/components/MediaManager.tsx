'use client';
import { FormEvent, useState } from 'react';
import type { AdminVehicle } from '@/app/(app)/vehicules/[id]/page';
import { Photo } from '@/components/Photo';
import { api } from '@/lib/admin';
import { VIEW } from '@/lib/labels';
import type { Media } from '@/lib/types';
import { btn, btnPrimary, ConfirmDelete, Field, input, Notice } from './ui';

const KINDS = { IMAGE: 'Photographie', SPIN_FRAME: 'Vue de rotation 360°', VIDEO: 'Vidéo (MP4, WebM)', MODEL_3D: 'Modèle 3D (GLB)' } as const;
const ACCEPT: Record<string, string> = { IMAGE: 'image/jpeg,image/png,image/webp,image/avif,image/tiff', SPIN_FRAME: 'image/jpeg,image/png,image/webp', VIDEO: 'video/mp4,video/webm', MODEL_3D: '.glb,model/gltf-binary' };

export function MediaManager({ vehicle, reload }: { vehicle: AdminVehicle; reload: () => Promise<void> }) {
  const [kind, setKind] = useState<keyof typeof KINDS>('IMAGE');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const images = vehicle.media.filter((m) => m.kind === 'IMAGE');
  const others = vehicle.media.filter((m) => m.kind !== 'IMAGE');

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const data = new FormData(el);
    const files = data.getAll('files') as File[];
    setError('');
    try {
      for (const [i, file] of files.entries()) {
        setBusy(`Envoi ${i + 1} / ${files.length} : ${file.name}`);
        const form = new FormData();
        form.set('file', file);
        form.set('kind', kind);
        for (const k of ['view', 'alt', 'credit', 'license', 'licenseUrl', 'sourceUrl']) {
          const v = data.get(k);
          if (v) form.set(k, v as string);
        }
        await api(`/admin/vehicles/${vehicle.id}/media`, { form });
      }
      el.reset();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi');
      await reload();
    }
    setBusy('');
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  };
  const move = (m: Media, delta: number) => {
    const ids = images.map((x) => x.id);
    const i = ids.indexOf(m.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return act(() => api(`/admin/vehicles/${vehicle.id}/media/order`, { method: 'PUT', body: { ids } }));
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={upload} className="grid gap-4 bg-paper p-6 md:grid-cols-3">
        <h2 className="font-medium md:col-span-3">Ajouter des médias</h2>
        <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KINDS)} className={input}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Fichiers" hint="Photo : 40 Mo, 1200 px de large minimum. Vidéo : 200 Mo. GLB : 80 Mo."><input name="files" type="file" required multiple={kind === 'IMAGE' || kind === 'SPIN_FRAME'} accept={ACCEPT[kind]} className={input} /></Field>
        <Field label="Vue"><select name="view" className={input} defaultValue="THREE_QUARTER">{Object.entries(VIEW).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <div className="md:col-span-3"><Field label="Texte alternatif" hint="Décrit ce que montre la photographie."><input name="alt" maxLength={240} required={kind === 'IMAGE'} className={input} /></Field></div>
        <Field label="Crédit (auteur)"><input name="credit" className={input} /></Field>
        <Field label="Licence"><input name="license" className={input} /></Field>
        <Field label="URL de la source"><input name="sourceUrl" type="url" className={input} /></Field>
        <div className="flex items-center gap-4 md:col-span-3"><button className={btnPrimary} disabled={!!busy}>Téléverser</button>{busy && <span role="status" className="text-sm text-steel">{busy}</span>}</div>
        {error && <div className="md:col-span-3"><Notice kind="error">{error}</Notice></div>}
      </form>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Photographies">
        {images.map((m, i) => (
          <li key={m.id} className="bg-paper">
            <Photo media={m} sizes="(min-width:1024px) 33vw, 50vw" className="aspect-[3/2]" />
            <form className="grid gap-2 p-3" onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() => api(`/admin/media/${m.id}`, { method: 'PATCH', body: { alt: f.get('alt'), view: f.get('view'), colorId: f.get('colorId') } }));
            }}>
              <Field label="Texte alternatif"><input name="alt" defaultValue={m.alt} className={input} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vue"><select name="view" defaultValue={m.view} className={input}>{Object.entries(VIEW).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Coloris"><select name="colorId" defaultValue={m.colorId ?? ''} className={input}><option value="">Aucun</option>{vehicle.colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              </div>
              <div className="flex flex-wrap gap-1">
                <button className={btn}>Enregistrer</button>
                <button type="button" className={btn} onClick={() => move(m, -1)} disabled={i === 0} aria-label="Déplacer avant">←</button>
                <button type="button" className={btn} onClick={() => move(m, 1)} disabled={i === images.length - 1} aria-label="Déplacer après">→</button>
                {m.isPrimary ? <span className="flex min-h-10 items-center bg-ink px-3 text-sm text-white">Principale</span> : <button type="button" className={btn} onClick={() => act(() => api(`/admin/media/${m.id}/primary`, { method: 'POST' }))}>Définir principale</button>}
                <ConfirmDelete label="Supprimer" confirmLabel="Confirmer" onConfirm={() => act(() => api(`/admin/media/${m.id}`, { method: 'DELETE' }))} />
              </div>
              <label className={`${btn} cursor-pointer`}>
                {m.cutoutSources?.length ? 'Remplacer le détourage' : 'Ajouter un détourage (fond transparent)'}
                <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.set('file', file);
                  void act(() => api(`/admin/media/${m.id}/cutout`, { form }));
                }} />
              </label>
            </form>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <ul className="grid gap-px bg-line" aria-label="Autres médias">
          {others.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 bg-paper p-3 text-sm">
              <span className="flex items-center gap-3">
                {m.kind === 'SPIN_FRAME' && <Photo media={m} sizes="96px" className="aspect-[3/2] w-24" />}
                {m.kind === 'VIDEO' && <video src={m.sources[0].url} controls preload="none" className="w-40 bg-ink" />}
                {KINDS[m.kind as keyof typeof KINDS]} {m.kind === 'MODEL_3D' && <a className="underline" href={m.sources[0].url}>télécharger</a>}
              </span>
              <ConfirmDelete label="Supprimer" confirmLabel="Confirmer" onConfirm={() => act(() => api(`/admin/media/${m.id}`, { method: 'DELETE' }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
