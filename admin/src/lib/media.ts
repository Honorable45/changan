import type { Media } from './types';

const numeric = (m: Media) => m.sources.filter((s) => /^\d+$/.test(s.size));
export const srcSetOf = (m: Media) => numeric(m).map((s) => `${s.url} ${s.size}w`).join(', ');
export const largestOf = (m: Media) => [...numeric(m)].sort((a, b) => Number(b.size) - Number(a.size))[0]?.url;

/** En deçà, la rotation serait saccadée : le visualiseur 360° n'est pas proposé. */
export const SPIN_MIN_FRAMES = 12;

/** Version détourée quand elle existe, photographie d'origine sinon. */
export const withCutout = (m: Media): Media => (m.cutoutSources?.length ? { ...m, sources: m.cutoutSources, width: m.cutoutWidth ?? m.width, height: m.cutoutHeight ?? m.height, dominantColor: null } : m);
export const hasCutout = (m?: Media | null) => Boolean(m?.cutoutSources?.length);
