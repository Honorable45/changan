/**
 * Savoir appris de la conduite des joueurs, commun au client et au serveur : format et validation.
 * Une démonstration est le chemin qu'un joueur a pris pour se sortir d'un point critique, sans choc.
 */

/** Point d'une démonstration : x, z, et sens de marche (1 marche avant, −1 marche arrière). */
export type DemoPoint = [number, number, 1 | -1];
export type Demonstration = { id: string; pts: DemoPoint[]; ok: number; ko: number; at: number };
export type Critical = { x: number; z: number; heading: number; cause: string; at: number };
export type Knowledge = { demos: Demonstration[]; critiques: Critical[] };

const lengthOf = (pts: DemoPoint[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/** Une démonstration plausible : 10 à 800 points, pas de saut de plus de 8 m, 15 à 300 m de long. */
export function validDemo(pts: unknown): pts is DemoPoint[] {
  if (!Array.isArray(pts) || pts.length < 10 || pts.length > 800) return false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as unknown[];
    if (!Array.isArray(p) || p.length !== 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || (p[2] !== 1 && p[2] !== -1)) return false;
    if (Math.abs(p[0] as number) > 20000 || Math.abs(p[1] as number) > 20000) return false;
    const q = pts[i - 1] as number[] | undefined;
    if (q && Math.hypot((p[0] as number) - q[0]!, (p[1] as number) - q[1]!) > 8) return false;
  }
  const len = lengthOf(pts as DemoPoint[]);
  return len >= 15 && len <= 300;
}

/** Un point critique plausible. */
export function validCritical(c: unknown): c is Critical {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return [o.x, o.z, o.heading].every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 20000) && typeof o.cause === 'string' && o.cause.length < 40;
}
