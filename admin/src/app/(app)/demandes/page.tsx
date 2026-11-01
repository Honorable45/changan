'use client';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDelete, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';
import { REQUEST_STATUS, REQUEST_TYPE } from '@/lib/labels';

type R = { id: string; type: string; status: string; name: string; phone: string; email: string | null; message: string | null; versionLabel: string | null; createdAt: string; vehicle: { name: string } | null };

export default function Requests() {
  const [rows, setRows] = useState<R[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api<R[]>('/admin/requests').then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const shown = rows?.filter((r) => !filter || r.status === filter);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl">Demandes</h1>
        <label className="flex items-center gap-2 text-sm">Statut
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${input} w-40`}><option value="">Toutes</option>{Object.entries(REQUEST_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>
      <Notice kind="error">{error}</Notice>
      {shown?.length === 0 && <p className="bg-paper p-8 text-steel">Aucune demande.</p>}
      <ul className="grid gap-px bg-line">
        {shown?.map((r) => (
          <li key={r.id} className="grid gap-3 bg-paper p-4 md:grid-cols-[1fr_2fr_auto] md:items-start">
            <div>
              <p className="font-medium">{REQUEST_TYPE[r.type]}</p>
              <p className="text-sm text-steel">{r.vehicle?.name ?? 'Sans modèle'}{r.versionLabel ? ` · ${r.versionLabel}` : ''}</p>
              <p className="num text-sm text-steel">{new Date(r.createdAt).toLocaleString('fr-FR')}</p>
            </div>
            <div className="text-[0.9375rem]">
              <p>{r.name} · <a className="underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>{r.email && <> · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a></>}</p>
              {r.message && <p className="mt-1 whitespace-pre-line text-steel">{r.message}</p>}
            </div>
            <div className="flex gap-2">
              <select aria-label={`Statut de la demande de ${r.name}`} value={r.status} onChange={async (e) => { await api(`/admin/requests/${r.id}`, { method: 'PATCH', body: { status: e.target.value } }); await load(); }} className={`${input} w-36`}>
                {Object.entries(REQUEST_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <ConfirmDelete label="×" confirmLabel="Supprimer" onConfirm={async () => { await api(`/admin/requests/${r.id}`, { method: 'DELETE' }); await load(); }} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
