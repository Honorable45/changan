'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Photo } from '@/components/Photo';
import { btnPrimary, Notice } from '@/components/ui';
import { api } from '@/lib/admin';
import { AVAILABILITY } from '@/lib/labels';
import type { Media } from '@/lib/types';

type Row = { id: string; name: string; slug: string; published: boolean; isDemo: boolean; availability: string; category: { name: string }; media: Media[]; _count: { media: number; specifications: number; versions: number } };

export default function Vehicles() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Row[]>('/admin/vehicles').then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="display text-3xl">Véhicules</h1>
        <Link href="/vehicules/nouveau" className={btnPrimary}>Nouveau véhicule</Link>
      </div>
      <Notice kind="error">{error}</Notice>
      {!rows && !error && <p role="status" className="text-sm text-steel">Chargement…</p>}
      {rows?.length === 0 && <p className="bg-paper p-8 text-steel">Aucun véhicule pour l’instant.</p>}
      <ul className="grid gap-px bg-line">
        {rows?.map((v) => (
          <li key={v.id} className="bg-paper">
            <Link href={`/vehicules/${v.id}`} className="grid grid-cols-[6rem_1fr] items-center gap-4 p-3 hover:bg-mist md:grid-cols-[7rem_2fr_1fr_1fr_1fr]">
              <Photo media={v.media[0] ?? null} sizes="112px" className="aspect-[3/2]" label="Sans photo" />
              <span><strong className="font-medium">{v.name}</strong>{v.isDemo && <span className="ml-2 bg-mist px-1.5 py-0.5 text-xs text-steel">démo</span>}<span className="block text-sm text-steel">{v.category.name}</span></span>
              <span className="col-start-2 text-sm md:col-start-auto">{v.published ? 'Publié' : 'Brouillon'}</span>
              <span className="col-start-2 text-sm text-steel md:col-start-auto">{AVAILABILITY[v.availability]}</span>
              <span className="num col-start-2 text-sm text-steel md:col-start-auto">{v._count.media} médias · {v._count.specifications} caract.</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
