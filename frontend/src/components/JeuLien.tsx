'use client';
import { useEffect, useState } from 'react';

/**
 * Lien vers le jeu, qui vit à part du site (dossier jeu/, son propre domaine).
 * NEXT_PUBLIC_JEU_URL en production ; en local, le même hôte sur le port 3004.
 */
export function JeuLien({ className, children }: { className?: string; children: React.ReactNode }) {
  const [href, setHref] = useState(process.env.NEXT_PUBLIC_JEU_URL ?? '');
  useEffect(() => { if (!process.env.NEXT_PUBLIC_JEU_URL) setHref(`${location.protocol}//${location.hostname}:3004/`); }, []);
  return <a href={href || undefined} className={className}>{children}</a>;
}
