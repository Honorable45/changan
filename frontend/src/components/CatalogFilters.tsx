'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { AVAILABILITY, ENERGY, fcfa } from '@/lib/labels';
import type { Category, Facets } from '@/lib/types';

/** Les filtres vivent dans l'URL : partageables, et le catalogue reste rendu côté serveur. */
export function CatalogFilters({ categories, facets, query }: { categories: Category[]; facets: Facets; query: Record<string, string | undefined> }) {
  const router = useRouter();
  const pathname = usePathname();
  // Valeurs reçues du serveur : la barre est présente dès le HTML initial, sans décalage de la grille.
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  useEffect(() => {
    if (q === (params.get('q') ?? '')) return;
    const t = setTimeout(() => set('q', q.trim() || null), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (key: string, value: string | null, label: string) => {
    const on = (params.get(key) ?? null) === value;
    return (
      <button key={value ?? 'tout'} type="button" aria-pressed={on} onClick={() => set(key, value)}
        className={`glass min-h-11 whitespace-nowrap rounded-full px-5 text-[0.9375rem] transition-colors ${on ? '!bg-white !text-[#0b0c0e]' : 'hover:!bg-white/20'}`}>{label}</button>
    );
  };

  return (
    <div className={`grid gap-6 transition-opacity lg:grid-cols-12 lg:items-end ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
      <div className="lg:col-span-3">
        <label htmlFor="recherche" className="text-sm text-steel">Rechercher un modèle</label>
        <input id="recherche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="UNI-K, Hunter…" className="field" />
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 lg:col-span-9">
        <div role="group" aria-label="Catégorie"><p className="mb-2 text-sm text-steel">Catégorie</p><div className="flex flex-wrap gap-2">{chip('categorie', null, 'Toutes')}{categories.map((c) => chip('categorie', c.slug, c.name))}</div></div>
        {facets.energies.length > 1 && (
          <div>
            <label htmlFor="energie" className="mb-1 block text-sm text-steel">Motorisation</label>
            <select id="energie" value={params.get('energie') ?? ''} onChange={(e) => set('energie', e.target.value || null)} className="field min-w-48">
              <option value="">Toutes</option>
              {facets.energies.map((e) => <option key={e} value={e}>{ENERGY[e]}</option>)}
            </select>
          </div>
        )}
        {facets.availabilities.length > 0 && (
          <div>
            <label htmlFor="dispo" className="mb-1 block text-sm text-steel">Disponibilité</label>
            <select id="dispo" value={params.get('dispo') ?? ''} onChange={(e) => set('dispo', e.target.value || null)} className="field min-w-48">
              <option value="">Toutes</option>
              {facets.availabilities.map((a) => <option key={a} value={a}>{AVAILABILITY[a]}</option>)}
            </select>
          </div>
        )}
        {facets.priceRange && facets.priceRange.max > facets.priceRange.min && (
          <div>
            <label htmlFor="budget" className="mb-1 block text-sm text-steel">Budget maximum</label>
            <select id="budget" value={params.get('budget') ?? ''} onChange={(e) => set('budget', e.target.value || null)} className="field min-w-48">
              <option value="">Tous</option>
              {[0.25, 0.5, 0.75, 1].map((r) => {
                const { min, max } = facets.priceRange!;
                const v = Math.round((min + (max - min) * r) / 100000) * 100000;
                return <option key={r} value={v}>{fcfa(v)}</option>;
              })}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
