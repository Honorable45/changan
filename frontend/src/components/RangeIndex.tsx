import Link from 'next/link';
import type { Category, VehicleCard as V } from '@/lib/types';
import { VehicleCard } from './VehicleCard';

const SPANS = ['md:col-span-7', 'md:col-span-5', 'md:col-span-5', 'md:col-span-7', 'md:col-span-6', 'md:col-span-6'];

export function RangeIndex({ vehicles, categories }: { vehicles: V[]; categories: Category[] }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 id="gamme-titre" className="display text-[clamp(2.5rem,6vw,6rem)]">La gamme</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 pb-2">
          {categories.map((c) => <li key={c.id}><Link href={`/vehicules?categorie=${c.slug}`} className="link-line inline-block py-1 text-[0.9375rem]">{c.name} <span className="num text-steel">{c.count}</span></Link></li>)}
        </ul>
      </div>
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-12">
        {vehicles.map((v, i) => <div key={v.id} className={SPANS[i % SPANS.length]}><VehicleCard v={v} sizes="(min-width:768px) 55vw, 94vw" /></div>)}
      </div>
    </>
  );
}
