'use client';
import { useEffect } from 'react';

/** Une seule observation pour toute la page ; le contenu reste visible sans JavaScript. */
export function RevealManager() {
  useEffect(() => {
    document.documentElement.classList.add('js-reveal');
    if ('chrome' in window && matchMedia('(min-width: 768px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('liquid');
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    const scan = () => document.querySelectorAll('[data-reveal]').forEach((el) => {
      if (!seen.has(el)) { seen.add(el); io.observe(el); }
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
