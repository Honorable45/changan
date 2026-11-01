'use client';
import { useCallback, useEffect, useState } from 'react';
import { btnPrimary, ConfirmDelete, Field, input, Notice } from '@/components/ui';
import { api } from '@/lib/admin';

type C = { id: string; name: string; slug: string; position: number; _count: { vehicles: number } };

export default function Categories() {
  const [rows, setRows] = useState<C[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api<C[]>('/admin/categories').then(setRows), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await load(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return false; }
  };
  return (
    <>
      <h1 className="display mb-6 text-3xl">Catégories</h1>
      <div className="grid gap-px bg-line">
        {[...rows, null].map((c, i) => (
          <form key={c?.id ?? 'new'} className="grid items-end gap-3 bg-paper p-4 md:grid-cols-[2fr_2fr_1fr_auto]" onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const f = new FormData(el);
            const body = { name: f.get('name'), slug: f.get('slug'), position: Number(f.get('position')) };
            const ok = await run(() => c ? api(`/admin/categories/${c.id}`, { method: 'PUT', body }) : api('/admin/categories', { body }));
            if (ok && !c) el.reset();
          }}>
            <Field label="Nom"><input name="name" required defaultValue={c?.name} className={input} /></Field>
            <Field label="Adresse"><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={c?.slug} className={input} /></Field>
            <Field label="Ordre"><input name="position" type="number" required defaultValue={c?.position ?? i} className={input} /></Field>
            <span className="flex gap-2"><button className={btnPrimary}>{c ? 'Enregistrer' : 'Ajouter'}</button>{c && c._count.vehicles === 0 && <ConfirmDelete label="×" confirmLabel="Supprimer" onConfirm={() => { void run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' })); }} />}</span>
          </form>
        ))}
      </div>
      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
    </>
  );
}
