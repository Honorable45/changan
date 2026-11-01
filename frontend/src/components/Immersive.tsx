'use client';
import dynamic from 'next/dynamic';
import type { Media } from '@/lib/types';
import { Photo } from './Photo';
import { Spin360 } from './Spin360';

const Model3D = dynamic(() => import('./Model3D').then((m) => m.Model3D), { ssr: false });

export function Immersive({ model, frames, name, fallback }: { model: Media | null; frames: Media[]; name: string; fallback: Media | null }) {
  return (
    <div className="grid gap-12">
      {frames.length > 0 && <Spin360 frames={frames} name={name} />}
      {model && <Model3D url={model.sources[0].url} name={name} fallback={<Photo media={fallback} sizes="100vw" className="aspect-[16/9]" />} />}
    </div>
  );
}
