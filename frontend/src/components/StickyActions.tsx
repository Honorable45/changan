'use client';
import { useEffect, useState } from 'react';

/** Barre d'action mobile : n'apparaît qu'une fois les boutons de tête sortis de l'écran, pour ne jamais les recouvrir. */
export function StickyActions({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById('actions-fiche');
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return <div className={`glass sticky bottom-3 z-30 mx-3 overflow-hidden rounded-full p-1.5 transition-[opacity,visibility] duration-200 md:hidden ${show ? 'visible opacity-100' : 'invisible opacity-0'}`}>{children}</div>;
}
