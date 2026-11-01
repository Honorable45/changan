'use client';
import { useState } from 'react';
import type { AdminVehicle } from '@/app/(app)/vehicules/[id]/page';
import { api } from '@/lib/admin';
import { SPEC_GROUP } from '@/lib/labels';
import { btnPrimary, ConfirmDelete, Field, input, Notice } from './ui';

const VERIFICATION: Record<string, string> = { INTERNATIONAL_SOURCE: 'Source internationale', CONFIRMED_TOGO: 'Confirmé pour le Togo' };

export function SpecsEditor({ vehicle, reload }: { vehicle: AdminVehicle; reload: () => Promise<void> }) {
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await reload(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return false; }
  };
  return (
    <div className="grid gap-px bg-line">
      <p className="bg-paper p-4 text-sm text-steel">La clé technique (facultative) aligne la ligne dans le comparateur : engine, power, length, width, height, wheelbase, seats… Sans valeur vérifiée, n’ajoutez pas la ligne : elle restera masquée.</p>
      {[...vehicle.specifications, null].map((s, i) => (
        <form key={s?.id ?? 'new'} className="grid items-end gap-3 bg-paper p-4 md:grid-cols-[1.3fr_1fr_1.3fr_2fr_1.3fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const f = new FormData(el);
            const body = { group: f.get('group'), key: f.get('key'), label: f.get('label'), value: f.get('value'), position: s?.position ?? i, verification: f.get('verification'), sourceLabel: f.get('sourceLabel'), sourceUrl: f.get('sourceUrl') };
            const ok = await run(() => s ? api(`/admin/specifications/${s.id}`, { method: 'PUT', body }) : api(`/admin/vehicles/${vehicle.id}/specifications`, { body }));
            if (ok && !s) el.reset();
          }}>
          <Field label="Groupe"><select name="group" defaultValue={s?.group ?? 'POWERTRAIN'} className={input}>{SPEC_GROUP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Clé"><input name="key" defaultValue={s?.key ?? ''} className={input} /></Field>
          <Field label="Libellé"><input name="label" required defaultValue={s?.label} className={input} /></Field>
          <Field label="Valeur"><input name="value" required defaultValue={s?.value} className={input} /></Field>
          <Field label="Vérification"><select name="verification" defaultValue={s?.verification ?? 'INTERNATIONAL_SOURCE'} className={input}>{Object.entries(VERIFICATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <span className="flex gap-2"><button className={btnPrimary}>{s ? 'OK' : 'Ajouter'}</button>{s && <ConfirmDelete label="×" confirmLabel="Supprimer" onConfirm={() => { void run(() => api(`/admin/specifications/${s.id}`, { method: 'DELETE' })); }} />}</span>
          <input type="hidden" name="sourceLabel" defaultValue={s?.sourceLabel ?? ''} />
          <input type="hidden" name="sourceUrl" defaultValue={s?.sourceUrl ?? ''} />
        </form>
      ))}
      {error && <div className="bg-paper p-4"><Notice kind="error">{error}</Notice></div>}
    </div>
  );
}
