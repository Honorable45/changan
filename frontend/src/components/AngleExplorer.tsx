'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Media } from '@/lib/types';
import { Car } from './Car';

export function AngleExplorer({ name, slug, angles, immersive }: { name: string; slug: string; angles: { label: string; media: Media }[]; immersive: string | null }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="relative h-[46vw] max-h-[42rem] min-h-[15rem]">
        {angles.map((a, n) => (
          <div key={a.media.id} className={`absolute inset-x-[4%] inset-y-[3%] transition-opacity duration-500 md:inset-x-[14%] ${n === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <Car media={a.media} sizes="(min-width:768px) 72vw, 92vw" />
          </div>
        ))}
      </div>
      <div className="shell mt-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label={`Angles du ${name}`} className="glass seg self-start">
          {angles.map((a, n) => <button key={a.media.id} type="button" onClick={() => setI(n)} aria-pressed={n === i}>{a.label}</button>)}
        </div>
        <Link href={`/vehicules/${slug}#${immersive ?? 'galerie'}`} className="btn btn-ghost shrink-0">{immersive ? 'Lancer l’exploration' : 'Ouvrir toute la galerie'}</Link>
      </div>
    </div>
  );
}
