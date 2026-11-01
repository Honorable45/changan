import Link from 'next/link';
import { fcfa, energyLine } from '@/lib/labels';
import type { VehicleCard as V } from '@/lib/types';
import { Car } from './Car';

/** Panneau de catalogue : le véhicule sur son sol, le nom au-dessus de lui. */
export function VehicleCard({ v, sizes, large, className = '' }: { v: V; sizes: string; large?: boolean; className?: string }) {
  return (
    <Link href={`/vehicules/${v.slug}`} data-reveal className={`glass-rim group relative flex h-full flex-col overflow-hidden rounded-[28px] bg-mist p-5 transition-colors duration-300 hover:bg-line md:p-7 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={`mega ${large ? 'text-[clamp(2.5rem,6.5vw,6.5rem)]' : 'text-[clamp(1.75rem,3.6vw,3.5rem)]'}`}>{v.name}</h3>
          <p className="mt-3 text-sm text-steel">{v.category.name}{v.energies.length > 0 && ` · ${energyLine(v.energies)}`}</p>
          {v.priceFromFcfa != null && <p className="num mt-1 text-sm">À partir de {fcfa(v.priceFromFcfa)}</p>}
        </div>
        <span aria-hidden="true" className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-drive group-hover:translate-x-1">→</span>
      </div>
      <div className={`relative mt-6 min-h-0 flex-1 transition-transform duration-700 ease-drive group-hover:scale-[1.025] ${large ? 'min-h-[15rem] md:min-h-[26rem]' : 'min-h-[13rem] md:min-h-[18rem]'}`}>
        <div className="absolute inset-0"><Car media={v.image} sizes={sizes} label={`CHANGAN ${v.name}`} /></div>
      </div>
    </Link>
  );
}
