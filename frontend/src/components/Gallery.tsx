'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VIEW } from '@/lib/labels';
import type { Color, Media } from '@/lib/types';
import { hasCutout, largestOf, srcSetOf, withCutout } from '@/lib/media';
import { Car } from './Car';
import { Photo } from './Photo';

export function Gallery({ images, colors, name }: { images: Media[]; colors: Color[]; name: string }) {
  const usableColors = colors.filter((c) => images.some((m) => m.colorId === c.id));
  const [color, setColor] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!color) return images;
    const match = images.filter((m) => m.colorId === color);
    return match.length ? [...match, ...images.filter((m) => !m.colorId)] : images;
  }, [images, color]);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const current = list[Math.min(index, list.length - 1)];
  const go = useCallback((d: number) => setIndex((i) => (i + d + list.length) % list.length), [list.length]);
  if (!current) return null;
  return (
    <div>
      {usableColors.length > 0 && (
        <div role="group" aria-label="Coloris" className="mb-6 flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={!color} onClick={() => { setColor(null); setIndex(0); }} className={`min-h-11 border px-4 text-[0.9375rem] ${!color ? 'border-ink' : 'border-line'}`}>Toutes</button>
          {usableColors.map((c) => (
            <button key={c.id} type="button" aria-pressed={color === c.id} onClick={() => { setColor(c.id); setIndex(0); }} className={`flex min-h-11 items-center gap-2 border px-4 text-[0.9375rem] ${color === c.id ? 'border-ink' : 'border-line'}`}>
              {c.hex && <span aria-hidden="true" className="h-4 w-4 border border-line" style={{ background: c.hex }} />}{c.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <button type="button" onClick={() => setLightbox(true)} aria-label={`Agrandir : ${current.alt}`} className="block w-full cursor-zoom-in">
          <div key={current.id} className={`aspect-[4/3] overflow-hidden rounded-[28px] md:aspect-[16/9] ${hasCutout(current) ? 'stage p-[6%]' : ''}`}><Car media={current} sizes="(min-width:768px) 80vw, 92vw" /></div>
        </button>
        {list.length > 1 && (
          <div className="glass absolute bottom-3 right-3 flex rounded-full p-1">
            <button type="button" onClick={() => go(-1)} aria-label="Photographie précédente" className="h-11 w-11 rounded-full text-lg hover:bg-white/15">←</button>
            <button type="button" onClick={() => go(1)} aria-label="Photographie suivante" className="h-11 w-11 rounded-full text-lg hover:bg-white/15">→</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-steel">
        <p><span className="num">{index + 1} / {list.length}</span> · {VIEW[current.view]}</p>
        <Credit m={current} />
      </div>
      <ul className="scroll-quiet mt-4 flex gap-2 overflow-x-auto pb-1">
        {list.map((m, i) => (
          <li key={m.id} className="shrink-0">
            <button type="button" onClick={() => setIndex(i)} aria-label={`Voir : ${m.alt}`} aria-current={i === index} className={`block w-24 border-b-2 pb-1 md:w-36 ${i === index ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <span className="block aspect-[3/2] overflow-hidden rounded-xl bg-mist p-1"><Car media={m} sizes="144px" /></span>
            </button>
          </li>
        ))}
      </ul>
      {lightbox && <Lightbox list={list.map(withCutout)} index={index} setIndex={setIndex} onClose={() => setLightbox(false)} name={name} />}
    </div>
  );
}

function Credit({ m }: { m: Media }) {
  if (!m.credit) return null;
  return <p>Photo : {m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noopener" className="underline">{m.credit}</a> : m.credit}{m.license && `, ${m.license}`}</p>;
}

const MAX_ZOOM = 5;

function Lightbox({ list, index, setIndex, onClose, name }: { list: Media[]; index: number; setIndex: (fn: (i: number) => number) => void; onClose: () => void; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist?: number; zoom: number; lastX: number; lastY: number; startX: number } | null>(null);
  const current = list[index];

  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const go = useCallback((d: number) => { reset(); setIndex((i) => (i + d + list.length) % list.length); }, [list.length, setIndex]);
  const zoomTo = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => { // Images voisines préchargées en grand pour une navigation sans attente.
    for (const m of [list[(index + 1) % list.length], list[(index - 1 + list.length) % list.length]]) {
      const img = new Image();
      img.sizes = '100vw';
      img.srcset = srcSetOf(m);
    }
  }, [index, list]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === '+' || e.key === '=') zoomTo(zoom + 0.5);
    else if (e.key === '-') zoomTo(zoom - 0.5);
    else if (e.key === '0') reset();
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { zoom, lastX: e.clientX, lastY: e.clientY, startX: e.clientX };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current.dist ??= dist;
      zoomTo(gesture.current.zoom * (dist / gesture.current.dist));
      return;
    }
    if (zoom > 1) {
      setPan((p) => ({ x: p.x + e.clientX - gesture.current!.lastX, y: p.y + e.clientY - gesture.current!.lastY }));
      gesture.current.lastX = e.clientX;
      gesture.current.lastY = e.clientY;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasPinch = pointers.current.size > 1 || gesture.current?.dist;
    pointers.current.delete(e.pointerId);
    if (!wasPinch && zoom === 1 && gesture.current) {
      const dx = e.clientX - gesture.current.startX;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    }
    if (pointers.current.size === 0) gesture.current = null;
  };

  const ctl = 'flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-white hover:bg-white/15 disabled:opacity-40';
  return (
    <dialog ref={dialog} onClose={onClose} onKeyDown={onKey} aria-label={`Photographies du ${name}`} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-[#0b0c0e] text-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 pl-4">
          <p className="num min-w-0 truncate text-sm text-white/70">{index + 1} / {list.length} · {VIEW[current.view]}</p>
          <div className="glass m-2 flex shrink-0 rounded-full p-1">
            <button type="button" className={ctl} onClick={() => zoomTo(zoom - 0.5)} disabled={zoom <= 1} aria-label="Dézoomer">−</button>
            <button type="button" className={`${ctl} num text-sm`} onClick={reset} aria-label="Réinitialiser le zoom">{Math.round(zoom * 100)} %</button>
            <button type="button" className={ctl} onClick={() => zoomTo(zoom + 0.5)} disabled={zoom >= MAX_ZOOM} aria-label="Zoomer">+</button>
            <button type="button" className={`${ctl} text-2xl`} onClick={() => dialog.current?.close()} aria-label="Fermer la visionneuse">×</button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden" style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={() => (zoom > 1 ? reset() : zoomTo(2.5))}
          onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 0.87))}>
          {/* À l'agrandissement, la plus grande variante remplace le srcset : pas de flou inutile. */}
          <img key={current.id} src={largestOf(current)} srcSet={zoom > 1 ? undefined : srcSetOf(current)} sizes="100vw" alt={current.alt} draggable={false}
            className="h-full w-full object-contain" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, background: current.dominantColor ?? undefined }} />
          {list.length > 1 && zoom === 1 && (
            <>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} aria-label="Photographie précédente" className="glass absolute left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full text-lg">←</button>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} aria-label="Photographie suivante" className="glass absolute right-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full text-lg">→</button>
            </>
          )}
        </div>
        <div className="px-4 py-3 text-sm text-white/70">
          <p>{current.alt}</p>
          <Credit m={current} />
        </div>
      </div>
    </dialog>
  );
}
