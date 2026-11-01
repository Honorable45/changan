'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { MediaManager } from '@/components/MediaManager';
import { SpecsEditor } from '@/components/SpecsEditor';
import { btn, btnPrimary, Check, ConfirmDelete, Field, input, Notice } from '@/components/ui';
import { api, SITE_URL } from '@/lib/admin';
import { AVAILABILITY, COMMERCIAL, ENERGY } from '@/lib/labels';
import type { Media } from '@/lib/types';

export type AdminVersion = { id: string; name: string; year: number | null; priceFcfa: number | null; priceVisible: boolean; position: number };
export type AdminSpec = { id: string; group: string; key: string | null; label: string; value: string; position: number; verification: string; sourceLabel: string | null; sourceUrl: string | null };
export type AdminColor = { id: string; name: string; hex: string | null; confirmed: boolean; position: number };
export type AdminVehicle = {
  id: string; name: string; slug: string; categoryId: string; tagline: string | null; summary: string | null; energies: string[]; published: boolean; isNew: boolean; isDemo: boolean;
  commercialStatus: string; availability: string; position: number; versions: AdminVersion[]; specifications: AdminSpec[]; colors: AdminColor[]; media: Media[];
};

const EMPTY = { name: '', slug: '', categoryId: '', tagline: '', summary: '', energies: [] as string[], published: false, isNew: false, isDemo: false, commercialStatus: 'TO_CONFIRM', availability: 'UNCONFIRMED', position: 100 };
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TABS = [['infos', 'Informations'], ['versions', 'Versions et prix'], ['specs', 'Caractéristiques'], ['media', 'Médias'], ['colors', 'Coloris']] as const;

export default function VehicleEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nouveau';
  const router = useRouter();
  const [vehicle, setVehicle] = useState<AdminVehicle | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('infos');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (isNew) return;
    const v = await api<AdminVehicle>(`/admin/vehicles/${id}`);
    setVehicle(v);
    setForm({ name: v.name, slug: v.slug, categoryId: v.categoryId, tagline: v.tagline ?? '', summary: v.summary ?? '', energies: v.energies, published: v.published, isNew: v.isNew, isDemo: v.isDemo, commercialStatus: v.commercialStatus, availability: v.availability, position: v.position });
  }, [id, isNew]);
  useEffect(() => {
    Promise.all([api<{ id: string; name: string }[]>('/admin/categories').then(setCategories), reload()])
      .catch((e) => setMsg({ kind: 'error', text: e.message })).finally(() => setLoading(false));
  }, [reload]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      if (isNew) {
        const created = await api<{ id: string }>('/admin/vehicles', { body: form });
        router.replace(`/vehicules/${created.id}`);
      } else {
        await api(`/admin/vehicles/${id}`, { method: 'PUT', body: form });
        setMsg({ kind: 'ok', text: 'Modifications enregistrées.' });
        await reload();
      }
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Erreur' });
    }
  }

  if (loading) return <p role="status" className="text-sm text-steel">Chargement…</p>;
  return (
    <>
      <p className="text-sm"><Link href="/" className="text-steel underline">Véhicules</Link></p>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">{isNew ? 'Nouveau véhicule' : form.name}</h1>
        {!isNew && <div className="flex flex-wrap gap-2">
          {form.published && <Link className={btn} target="_blank" href={`${SITE_URL}/vehicules/${form.slug}`}>Voir la fiche</Link>}
          <ConfirmDelete onConfirm={async () => { await api(`/admin/vehicles/${id}`, { method: 'DELETE' }); router.replace('/'); }} label="Supprimer le véhicule" />
        </div>}
      </div>
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {!isNew && (
        <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto">
          {TABS.map(([k, label]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 shrink-0 px-3 text-sm ${tab === k ? 'bg-ink text-white' : 'bg-paper hover:bg-line'}`}>{label}</button>)}
        </div>
      )}
      {tab === 'infos' && (
        <form onSubmit={save} className="grid gap-5 bg-paper p-6 md:grid-cols-2">
          <Field label="Nom du modèle"><input required value={form.name} onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, slug: isNew ? slugify(name) : f.slug })); }} className={input} /></Field>
          <Field label="Adresse de la fiche" hint={`/vehicules/${form.slug || '…'}`}><input required value={form.slug} onChange={(e) => set('slug', e.target.value)} className={input} /></Field>
          <Field label="Catégorie">
            <select required value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={input}>
              <option value="">Choisir…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Ordre d’affichage"><input type="number" value={form.position} onChange={(e) => set('position', Number(e.target.value))} className={input} /></Field>
          <div className="md:col-span-2"><Field label="Accroche courte"><input maxLength={160} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} className={input} /></Field></div>
          <fieldset className="md:col-span-2">
            <legend className="mb-1 text-sm font-medium">Motorisations proposées</legend>
            <div className="flex flex-wrap gap-x-5">
              {Object.entries(ENERGY).map(([k, label]) => <Check key={k} label={label} checked={form.energies.includes(k)} onChange={(on) => set('energies', on ? [...form.energies, k] : form.energies.filter((x) => x !== k))} />)}
            </div>
          </fieldset>
          <Field label="Commercialisation au Togo" hint="À ne passer en « commercialisé » qu’après confirmation.">
            <select value={form.commercialStatus} onChange={(e) => set('commercialStatus', e.target.value)} className={input}>
              {Object.entries(COMMERCIAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Disponibilité" hint="« Disponible » suppose un stock confirmé.">
            <select value={form.availability} onChange={(e) => set('availability', e.target.value)} className={input}>
              {Object.entries(AVAILABILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap gap-x-6 md:col-span-2">
            <Check label="Publié sur le site" checked={form.published} onChange={(v) => set('published', v)} />
            <Check label="Nouveauté" checked={form.isNew} onChange={(v) => set('isNew', v)} />
            <Check label="Donnée de démonstration" checked={form.isDemo} onChange={(v) => set('isDemo', v)} />
          </div>
          <div className="md:col-span-2"><button className={btnPrimary}>{isNew ? 'Créer le véhicule' : 'Enregistrer'}</button></div>
        </form>
      )}
      {vehicle && tab === 'versions' && <VersionsEditor vehicle={vehicle} reload={reload} />}
      {vehicle && tab === 'specs' && <SpecsEditor vehicle={vehicle} reload={reload} />}
      {vehicle && tab === 'media' && <MediaManager vehicle={vehicle} reload={reload} />}
      {vehicle && tab === 'colors' && <ColorsEditor vehicle={vehicle} reload={reload} />}
    </>
  );
}

function useAction(reload: () => Promise<void>) {
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await reload(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return false; }
  };
  return { error, run };
}

function VersionsEditor({ vehicle, reload }: { vehicle: AdminVehicle; reload: () => Promise<void> }) {
  const { error, run } = useAction(reload);
  const payload = (f: FormData, position: number) => ({
    name: f.get('name'), year: f.get('year') ? Number(f.get('year')) : null, priceFcfa: f.get('price') ? Number(f.get('price')) : null, priceVisible: f.get('visible') === 'on', position,
  });
  return (
    <div className="grid gap-px bg-line">
      {[...vehicle.versions, null].map((v, i) => (
        <form key={v?.id ?? 'new'} className="grid items-end gap-3 bg-paper p-4 md:grid-cols-[2fr_1fr_1.5fr_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const body = payload(new FormData(el), v?.position ?? i);
            const ok = await run(() => v ? api(`/admin/versions/${v.id}`, { method: 'PUT', body }) : api(`/admin/vehicles/${vehicle.id}/versions`, { body }));
            if (ok && !v) el.reset();
          }}>
          <Field label="Version"><input name="name" required defaultValue={v?.name} className={input} /></Field>
          <Field label="Année"><input name="year" type="number" min={1980} defaultValue={v?.year ?? ''} className={input} /></Field>
          <Field label="Prix (FCFA)"><input name="price" type="number" min={0} defaultValue={v?.priceFcfa ?? ''} className={input} /></Field>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input name="visible" type="checkbox" defaultChecked={v?.priceVisible} className="h-4 w-4" />Prix public</label>
          <span className="flex gap-2"><button className={btnPrimary}>{v ? 'Enregistrer' : 'Ajouter'}</button>{v && <ConfirmDelete label="×" confirmLabel="Supprimer" onConfirm={() => { void run(() => api(`/admin/versions/${v.id}`, { method: 'DELETE' })); }} />}</span>
        </form>
      ))}
      {error && <div className="bg-paper p-4"><Notice kind="error">{error}</Notice></div>}
    </div>
  );
}

function ColorsEditor({ vehicle, reload }: { vehicle: AdminVehicle; reload: () => Promise<void> }) {
  const { error, run } = useAction(reload);
  return (
    <div className="grid gap-px bg-line">
      <p className="bg-paper p-4 text-sm text-steel">Seuls les coloris confirmés ET associés à une photographie (onglet Médias) sont proposés sur la fiche : aucune teinte n’est simulée.</p>
      {[...vehicle.colors, null].map((c, i) => (
        <form key={c?.id ?? 'new'} className="grid items-end gap-3 bg-paper p-4 md:grid-cols-[2fr_1fr_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const f = new FormData(el);
            const body = { name: f.get('name'), hex: f.get('hex') || null, confirmed: f.get('confirmed') === 'on', position: c?.position ?? i };
            const ok = await run(() => c ? api(`/admin/colors/${c.id}`, { method: 'PUT', body }) : api(`/admin/vehicles/${vehicle.id}/colors`, { body }));
            if (ok && !c) el.reset();
          }}>
          <Field label="Nom du coloris"><input name="name" required defaultValue={c?.name} className={input} /></Field>
          <Field label="Couleur (#RRGGBB)"><input name="hex" pattern="#[0-9a-fA-F]{6}" defaultValue={c?.hex ?? ''} className={input} /></Field>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input name="confirmed" type="checkbox" defaultChecked={c?.confirmed} className="h-4 w-4" />Confirmé</label>
          <span className="flex gap-2"><button className={btnPrimary}>{c ? 'Enregistrer' : 'Ajouter'}</button>{c && <ConfirmDelete label="×" confirmLabel="Supprimer" onConfirm={() => { void run(() => api(`/admin/colors/${c.id}`, { method: 'DELETE' })); }} />}</span>
        </form>
      ))}
      {error && <div className="bg-paper p-4"><Notice kind="error">{error}</Notice></div>}
    </div>
  );
}
