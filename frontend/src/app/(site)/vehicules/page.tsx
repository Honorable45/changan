import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogFilters } from '@/components/CatalogFilters';
import { VehicleCard } from '@/components/VehicleCard';
import { getCategories, getFacets, getVehicles } from '@/lib/api';

export const metadata: Metadata = {
  title: 'La gamme',
  description: 'SUV, berlines et pick-up CHANGAN : parcourez la gamme présentée au Togo et ouvrez chaque fiche détaillée.',
  alternates: { canonical: '/vehicules' },
};

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Catalogue({ searchParams }: P) {
  const p = await searchParams;
  const [vehicles, categories, facets] = await Promise.all([
    getVehicles({ q: p.q, category: p.categorie, energy: p.energie, availability: p.dispo, maxPrice: p.budget }),
    getCategories(), getFacets(),
  ]);
  const filtered = Boolean(p.q || p.categorie || p.energie || p.dispo || p.budget);
  const spans = ['md:col-span-12', 'md:col-span-7', 'md:col-span-5', 'md:col-span-5', 'md:col-span-7', 'md:col-span-12'];
  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="mega text-[clamp(2rem,11vw,10rem)]">La gamme</h1>
      
      <div className="mt-10 border-y border-line py-6 md:mt-14"><CatalogFilters categories={categories} facets={facets} query={p} /></div>
      <h2 className="sr-only">Modèles</h2>
      <p className="num mt-6 text-sm text-steel" role="status">{vehicles.length} {vehicles.length > 1 ? 'modèles' : 'modèle'}</p>
      {vehicles.length === 0 ? (
        <div className="py-24">
          <h2 className="display text-3xl md:text-5xl">Aucun véhicule ne correspond.</h2>
          <p className="mt-4 text-steel">Essayez un autre nom de modèle ou retirez un filtre.</p>
          <Link href="/vehicules" className="btn btn-primary mt-8">Voir toute la gamme</Link>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-12">
          {vehicles.map((v, i) => {
            const cls = filtered && vehicles.length < 3 ? 'md:col-span-6' : spans[i % spans.length];
            const large = cls === 'md:col-span-12';
            return <div key={v.id} className={cls}><VehicleCard v={v} large={large} sizes={large ? '94vw' : '(min-width:768px) 55vw, 94vw'} /></div>;
          })}
        </div>
      )}
    </div>
  );
}
