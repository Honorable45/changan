'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';

const NAV = [
  { href: '/vehicules', label: 'Véhicules' },
  { href: '/comparer', label: 'Comparer' },
  { href: '/marque', label: 'La marque' },
  { href: '/services', label: 'Services' },
  { href: '/contact', label: 'Contact' },
];

export function Header({ logoUrl }: { logoUrl: string | null }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="pointer-events-none sticky top-0 z-40 h-20 text-white">
      <div className={`shell flex h-full items-center transition-[padding] duration-300 ${scrolled ? 'max-w-[1240px]' : ''}`}>
        <div className={`glass glass-refract pointer-events-auto flex w-full items-center justify-between rounded-full pl-5 pr-2 transition-[height] duration-300 ${scrolled ? 'h-[3.25rem]' : 'h-[3.75rem]'}`}>
          <Link href="/" aria-label="Accueil CHANGAN Togo" className="relative z-10 flex min-h-11 items-center"><Logo url={logoUrl} className="!text-[.9rem]" /></Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => {
              const on = pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                  className={`flex min-h-10 items-center rounded-full px-4 text-[0.9375rem] transition-colors ${on ? 'bg-white/20 shadow-[inset_0_1px_0_rgb(255_255_255/.35)]' : 'hover:bg-white/10'}`}>{n.label}</Link>
              );
            })}
          </nav>
          <Link href="/contact?demande=essai" className="hidden min-h-10 items-center rounded-full bg-white px-5 text-[0.9375rem] font-medium text-[#0b0c0e] transition-colors hover:bg-[#d9dbde] lg:flex">
            Réserver un essai
          </Link>
          <button ref={toggle} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="menu-mobile" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="relative z-10 flex h-11 w-11 flex-col items-center justify-center gap-[7px] rounded-full hover:bg-white/10 lg:hidden">
            <span className={`h-px w-5 bg-current transition-transform duration-300 ${open ? 'translate-y-1 rotate-45' : ''}`} />
            <span className={`h-px w-5 bg-current transition-transform duration-300 ${open ? '-translate-y-1 -rotate-45' : ''}`} />
          </button>
        </div>
      </div>
      <div id="menu-mobile" inert={!open}
        className={`pointer-events-auto fixed inset-0 -z-10 bg-[#0b0c0e]/75 text-white backdrop-blur-2xl transition-[opacity,visibility] duration-300 lg:hidden ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <nav aria-label="Navigation mobile" className="shell flex h-full flex-col justify-between overflow-y-auto pb-8 pt-24">
          <ul>
            {NAV.map((n) => (
              <li key={n.href} className="border-b border-white/15">
                <Link href={n.href} className="display flex min-h-16 items-center text-3xl">{n.label}</Link>
              </li>
            ))}
          </ul>
          <Link href="/contact?demande=essai" className="btn btn-light mt-8 w-full">Réserver un essai</Link>
        </nav>
      </div>
    </header>
  );
}
