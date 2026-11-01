'use client';
import { useEffect, useRef, useState } from 'react';
import { largestOf } from '@/lib/media';
import type { Media } from '@/lib/types';

/** Rotation réelle à partir d'une série de photographies. N'est proposée que si la série est complète. */
export function Spin360({ frames, name }: { frames: Media[]; name: string }) {
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [touched, setTouched] = useState(false);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const urls = frames.map((f) => largestOf(f)!);

  useEffect(() => { // Chargement différé : la série ne démarre qu'à l'approche de l'écran.
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      urls.forEach((u) => { const i = new Image(); i.onload = i.onerror = () => setLoaded((n) => n + 1); i.src = u; });
    }, { rootMargin: '300px' });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = frames.length;
  const wrap = (i: number) => ((i % n) + n) % n;
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const perFrame = box.current.clientWidth / n / 0.8;
    setFrame(wrap(drag.current.start - Math.round((e.clientX - drag.current.x) / perFrame)));
  };
  return (
    <div>
      <div ref={box} data-testid="spin" role="slider" tabIndex={0} aria-label={`Rotation du ${name}`} aria-valuemin={1} aria-valuemax={n} aria-valuenow={frame + 1}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') setFrame((f) => wrap(f + 1)); if (e.key === 'ArrowLeft') setFrame((f) => wrap(f - 1)); }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, start: frame }; setTouched(true); }}
        onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        className="relative aspect-[16/9] cursor-grab touch-pan-y select-none overflow-hidden bg-mist active:cursor-grabbing">
        <img src={urls[frame]} alt={`${name}, vue ${frame + 1} sur ${n}`} draggable={false} className="h-full w-full object-contain" style={{ transform: `scale(${zoom})` }} />
        {!touched && <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm"><span className="bg-paper px-3 py-2">Faites glisser pour tourner autour du véhicule</span></p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))} aria-label="Zoomer" className="h-11 w-11 border border-line">+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Dézoomer" className="h-11 w-11 border border-line">−</button>
        <button type="button" onClick={() => { setFrame(0); setZoom(1); }} className="h-11 border border-line px-4">Réinitialiser la vue</button>
        {loaded < n && <span className="num ml-2 text-steel" role="status">Chargement {Math.round((loaded / n) * 100)} %</span>}
      </div>
    </div>
  );
}
