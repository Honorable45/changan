'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { VehicleCard } from '@/lib/types';
import { Car } from './Car';

export const megaSize = (name: string) => `min(${(118 / Math.max(name.length, 4)).toFixed(1)}vw, 34svh)`;

/** Première impression : le nom en très grand derrière le véhicule, et la gamme à portée de clic. */
export function HeroStage({ vehicles, initial }: { vehicles: VehicleCard[]; initial: string }) {
  const start = Math.max(vehicles.findIndex((v) => v.id === initial), 0);
  const [index, setIndex] = useState(start);
  const [ready, setReady] = useState(false); // Les autres modèles ne se chargent qu'après la première image.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const v = vehicles[index];
  if (!v) return null;
  return (
    <section className="stage -mt-20 flex min-h-[100svh] flex-col text-white" aria-labelledby="hero-titre">
      <div className="relative min-h-0 flex-1 pt-20">
        {vehicles.map((x, i) => (
          <div key={x.id} aria-hidden={i !== index} className={`absolute inset-x-0 bottom-0 top-20 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            {i === index
              ? <h1 id="hero-titre" className="mega hero-rise absolute inset-x-0 top-[4%] whitespace-nowrap text-center text-white" style={{ fontSize: megaSize(x.name) }}>{x.name}</h1>
              : <p className="mega absolute inset-x-0 top-[4%] whitespace-nowrap text-center text-white" style={{ fontSize: megaSize(x.name) }}>{x.name}</p>}
            {(i === index || i === start || ready) && (
              <div className={`absolute inset-x-[3%] bottom-[5%] top-[20%] transition-transform duration-1000 ease-drive md:inset-x-[11%] md:top-[14%] ${i === index ? 'translate-x-0' : 'translate-x-6'}`}>
                <Car media={x.image} sizes="(min-width:768px) 78vw, 94vw" priority={i === start} label={`CHANGAN ${x.name}`} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="shell relative z-10 grid gap-5 pb-6 md:grid-cols-12 md:items-end md:pb-8">
        <div className="md:col-span-7">
          <p className="max-w-md text-[1.0625rem] leading-snug text-white/75">{v.tagline}</p>
          <div role="group" aria-label="Choisir un modèle" className="glass seg mt-4">
            {vehicles.map((x, i) => <button key={x.id} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>{x.name}</button>)}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:col-span-5 md:justify-end">
          <Link href={`/vehicules/${v.slug}`} className="btn btn-light whitespace-nowrap">Découvrir le modèle</Link>
          <Link href="/vehicules" className="btn btn-ghost whitespace-nowrap">Explorer la gamme</Link>
        </div>
      </div>
    </section>
  );
}
