import { hasCutout, withCutout } from '@/lib/media';
import type { Media } from '@/lib/types';
import { Photo } from './Photo';

/** Véhicule détouré posé sur son ombre de contact, à sa proportion exacte. Sans détourage : la photographie remplit le cadre. */
export function Car({ media, sizes, priority, label, className = '' }: { media: Media | null; sizes: string; priority?: boolean; label?: string; className?: string }) {
  if (!media || !hasCutout(media)) return <Photo media={media} sizes={sizes} priority={priority} label={label} className={`h-full w-full ${className}`} />;
  const m = withCutout(media);
  const ratio = (m.width ?? 3) / (m.height ?? 2);
  return (
    <div className={`car-box h-full w-full ${className}`}>
      <div className="relative" style={{ width: `min(100cqw, calc(100cqh * ${ratio.toFixed(4)}))`, aspectRatio: String(ratio) }}>
        <span className="car-shadow" aria-hidden="true" />
        <Photo media={m} sizes={sizes} priority={priority} label={label} bare fit="contain" className="relative h-full w-full" />
      </div>
    </div>
  );
}
