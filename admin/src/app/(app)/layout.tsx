'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, SITE_URL } from '@/lib/admin';

const NAV = [['/', 'Véhicules'], ['/categories', 'Catégories'], ['/accueil', 'Accueil et coordonnées'], ['/demandes', 'Demandes']];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<{ email: string } | null>(null);
  useEffect(() => { api<{ email: string }>('/admin/auth/me').then(setMe).catch(() => {}); }, []);
  if (!me) return <p className="p-8 text-sm text-steel" role="status">Vérification de la session…</p>;
  async function logout() {
    await api('/admin/auth/logout', { method: 'POST' });
    window.location.assign('/connexion');
  }
  return (
    <div>
      <header className="on-dark bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
          <Link href="/" className="text-sm font-semibold tracking-[0.2em]">CHANGAN <span className="font-normal opacity-60">ADMIN</span></Link>
          <nav aria-label="Administration" className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1">
            {NAV.map(([href, label]) => {
              const on = href === '/' ? pathname === href || pathname.startsWith('/vehicules') : pathname.startsWith(href);
              return <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`flex min-h-10 shrink-0 items-center px-3 text-sm ${on ? 'bg-white text-ink' : 'hover:bg-white/15'}`}>{label}</Link>;
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href={SITE_URL} target="_blank" className="hover:underline">Voir le site</Link>
            <button type="button" onClick={logout} className="min-h-10 hover:underline">Déconnexion</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
