'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { driveDistance, drivePitch, driveProgress, TYRE_TO_RIM, type DriveView } from '@/lib/drive';
import type { VehicleCard } from '@/lib/types';
import { megaSize } from './HeroStage';

const SIZES = '(min-width:768px) 80vw, 96vw';
const GAP = 1.1; // Écart entre deux voitures, en largeurs de voiture et en plus de l'écran : une seule passe à la fois.
const EXIT = 0.5; // Marge de sortie, pour que le faisceau des phares quitte aussi l'écran.

/** Première impression : une voiture attend sur scène, démarre au premier défilement, puis les autres couleurs passent à sa suite. */
export function HeroDrive({ vehicle, view }: { vehicle: VehicleCard; view: DriveView }) {
  const root = useRef<HTMLElement>(null);
  const cars = useRef<(HTMLDivElement | null)[]>([]);
  const title = useRef<HTMLHeadingElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const lights = useRef<(HTMLDivElement | null)[]>([]);
  const wheels = useRef<(HTMLImageElement | null)[]>([]);
  const parked = useRef(0); // Voiture affichée quand le système demande moins d'animations.
  const repaint = useRef<() => void>(() => {});
  const [color, setColor] = useState(0);
  const [ready, setReady] = useState(false); // Les autres voitures ne se chargent qu'après la première image.
  const count = view.colors.length;
  const perCar = view.wheels.length;

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let current = 0;

    const paint = () => {
      const width = cars.current[0]?.offsetWidth ?? 0;
      const gap = window.innerWidth + width * GAP;
      const exit = (window.innerWidth + width) / 2 + width * EXIT;
      const travelled = motion.matches ? parked.current * gap : ((count - 1) * gap + exit) * driveDistance(current);
      const pitch = 0.3 * drivePitch(current);
      cars.current.forEach((car, i) => {
        if (!car) return;
        const x = i * gap - travelled;
        const onStage = Math.abs(x) < exit;
        car.style.visibility = onStage ? 'visible' : 'hidden';
        car.style.transform = `translate3d(${x.toFixed(1)}px, ${(x * view.slope).toFixed(1)}px, 0) rotate(${pitch.toFixed(3)}deg)`;
        const light = lights.current[i];
        if (light) light.style.opacity = String(Math.min(current / 0.01, 1));
        view.wheels.forEach((wheel, w) => {
          const img = wheels.current[i * perCar + w];
          if (!img || !onStage) return;
          const angle = -travelled / (((width * wheel.rx) / 100) * TYRE_TO_RIM);
          img.style.transform = `scaleX(${wheel.aspect}) rotate(${angle.toFixed(4)}rad) scaleX(${1 / wheel.aspect})`;
        });
      });
      if (hint.current) hint.current.style.opacity = String(Math.max(1 - current / 0.01, 0));
      if (title.current) title.current.style.transform = `translate3d(${(travelled * 0.015).toFixed(1)}px, 0, 0)`;
      setColor(Math.min(Math.max(Math.round(travelled / (gap || 1)), 0), count - 1));
    };
    repaint.current = paint;
    const target = () => {
      const box = root.current?.getBoundingClientRect();
      if (!box) return 0;
      return Math.min(Math.max(-box.top / Math.max(box.height - window.innerHeight, 1), 0), 1);
    };
    // Un léger amorti absorbe les crans de la molette sans décrocher du défilement.
    // Il dépend du temps écoulé pour que les voitures suivent aussi vite sur un appareil lent.
    let last = 0;
    const tick = (now: number) => {
      const goal = target();
      current += (goal - current) * (1 - Math.exp(-Math.min(now - last, 100) / 70));
      last = now;
      if (Math.abs(goal - current) < 0.0002) current = goal;
      paint();
      frame = current === goal ? 0 : requestAnimationFrame(tick);
    };
    const request = () => { if (!frame) { last = performance.now() - 16; frame = requestAnimationFrame(tick); } };
    const start = () => {
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request);
      current = target();
      paint();
    };
    const stop = () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      cancelAnimationFrame(frame);
      frame = 0;
      current = 0;
      paint();
    };
    const sync = () => { stop(); if (!motion.matches) start(); };
    sync();
    motion.addEventListener('change', sync);
    return () => { motion.removeEventListener('change', sync); stop(); };
  }, [view, count, perCar, ready]);

  /** Amène la voiture choisie au centre de la scène. */
  const goTo = (index: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      parked.current = index;
      repaint.current();
      return;
    }
    const box = root.current?.getBoundingClientRect();
    const width = cars.current[0]?.offsetWidth ?? 0;
    if (!box) return;
    const gap = window.innerWidth + width * GAP;
    const exit = (window.innerWidth + width) / 2 + width * EXIT;
    const progress = index ? driveProgress((index * gap) / ((count - 1) * gap + exit)) : 0;
    window.scrollTo({ top: window.scrollY + box.top + progress * (box.height - window.innerHeight) });
  };

  return (
    <section ref={root} className="drive -mt-20" aria-labelledby="hero-titre">
      <div className="stage drive-stage flex flex-col text-white">
        <div className="relative min-h-0 flex-1">
          <h1 ref={title} id="hero-titre" className="mega hero-rise absolute inset-x-0 top-[calc(5rem+9%)] whitespace-nowrap text-center text-white md:top-[calc(5rem+4%)]" style={{ fontSize: megaSize(vehicle.name) }}>{vehicle.name}</h1>
          {view.colors.map((c, i) => (i === 0 || ready) && (
            <div key={c.id} className="absolute inset-x-0 bottom-[24%] flex justify-center md:bottom-[7%]">
              <div ref={(el) => { cars.current[i] = el; }} data-car={c.id} className="drive-car relative" style={{ aspectRatio: String(view.ratio), ...(i ? { visibility: 'hidden' as const } : {}) }}>
                <span className="car-shadow drive-shadow" aria-hidden="true" />
                <div ref={(el) => { lights.current[i] = el; }} className="absolute inset-0 opacity-0" aria-hidden="true">
                  <span className="drive-beam" style={{ top: `${view.headlight.y}%`, right: `${100 - view.headlight.x}%` }} />
                  <span className="drive-tail" style={{ top: `${view.taillight.y}%`, left: `${view.taillight.x}%` }} />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} srcSet={c.srcSet} sizes={SIZES} alt={`CHANGAN ${vehicle.name}, vue de profil, ${c.label.toLowerCase()}`} fetchPriority={i ? undefined : 'high'} decoding="async" className="relative block h-full w-full" />
                {view.wheels.map((wheel, w) => (
                  <div key={w} className="absolute inset-0" aria-hidden="true" style={{ clipPath: `ellipse(${wheel.rx}% ${wheel.ry}% at ${wheel.cx}% ${wheel.cy}%)` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={(el) => { wheels.current[i * perCar + w] = el; }} src={c.src} srcSet={c.srcSet} sizes={SIZES} alt="" decoding="async" className="drive-wheel block h-full w-full" style={{ transformOrigin: `${wheel.cx}% ${wheel.cy}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p ref={hint} className="drive-hint absolute inset-x-0 bottom-1 text-center text-sm text-white/70">Faites défiler pour démarrer</p>
        </div>
        <div className="shell relative z-10 grid gap-5 pb-6 pt-3 md:grid-cols-12 md:items-end md:pb-8">
          <div className="md:col-span-7">
            <p className="max-w-md text-[1.0625rem] leading-snug text-white/75">{vehicle.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div role="group" aria-label="Choisir une couleur" className="glass flex items-center gap-0.5 rounded-full p-0.5">
                {view.colors.map((c, i) => (
                  <button key={c.id} type="button" aria-label={c.label} aria-pressed={i === color} onClick={() => goTo(i)} className="grid h-11 w-9 place-items-center">
                    <span className={`block h-6 w-6 rounded-full border border-white/40 ${i === color ? 'outline outline-2 outline-offset-2 outline-white' : ''}`} style={{ background: c.swatch }} />
                  </button>
                ))}
              </div>
              <p className="text-sm text-white/70"><span className="text-white">{view.colors[color]?.label}</span>{color > 0 ? ' · teinte simulée' : ' · photo d’origine'}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:col-span-5 md:justify-end">
            <Link href={`/vehicules/${vehicle.slug}`} className="btn btn-light whitespace-nowrap">Découvrir le modèle</Link>
            <Link href="/vehicules" className="btn btn-ghost whitespace-nowrap">Explorer la gamme</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
