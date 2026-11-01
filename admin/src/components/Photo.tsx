'use client';
import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { largestOf, srcSetOf } from '@/lib/media';
import type { Media } from '@/lib/types';


/** Photographie responsive : couleur dominante en attente, panneau sobre si le fichier manque (jamais d'icône cassée). */
export function Photo({ media, sizes, priority, className = '', fit = 'cover', position, label, bare }: {
  media: Media | null; sizes: string; priority?: boolean; className?: string; fit?: 'cover' | 'contain'; position?: string; label?: string; bare?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  // Image principale de la page : annoncée dans le <head> pour démarrer avant le CSS et le JavaScript.
  if (priority && media?.sources.length) {
    preload(largestOf(media)!, { as: 'image', imageSrcSet: srcSetOf(media), imageSizes: sizes, fetchPriority: 'high' });
  }
  useEffect(() => {
    const img = ref.current;
    // Une image différée non chargée a aussi une largeur nulle : seule l'image prioritaire est vérifiée ici.
    if (priority && img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [priority]);
  if (!media || failed || !media.sources.length) {
    return (
      <div className={`flex items-end bg-mist p-4 text-sm text-steel ${className}`} role="img" aria-label={label ?? 'Photographie indisponible'}>
        {label ?? 'Photographie à venir'}
      </div>
    );
  }
  return (
    <div className={`overflow-hidden ${className}`} style={bare ? undefined : { backgroundColor: media.dominantColor ?? '#1b1d21' }}>
      <img
        ref={ref}
        src={largestOf(media)}
        srcSet={srcSetOf(media)}
        sizes={sizes}
        alt={media.alt}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        style={{ objectPosition: position }}
      />
    </div>
  );
}
