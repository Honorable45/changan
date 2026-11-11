import type { Pt, World } from '../sim.ts';
import type { Path } from './types.ts';

/**
 * Trajectoire de SMART AI : la voie de droite des rues du jeu, celle que suit déjà la circulation
 * (tracé de la rue décalé de « l » vers la droite). Aux carrefours, la voie qui mène vers l'itinéraire demandé,
 * sinon la plus droite.
 */
export class LanePlanner {
  private out = new Map<number, number[]>();
  private world: World;
  /** Rues reconnues bloquées (obstacle infranchissable, impasse), évitées jusqu'à l'instant indiqué. */
  private blocked = new Map<number, number>();
  private clock = 0;

  /** Évite la rue « edge » pendant « seconds » secondes : la trajectoire cherche un autre chemin. */
  block(edge: number, seconds = 90) { this.blocked.set(edge, this.clock + seconds); }
  isBlocked(edge: number) { return (this.blocked.get(edge) ?? -1) > this.clock; }
  tick(dt: number) { this.clock += dt; }
  constructor(world: World) {
    this.world = world;
    world.edges.forEach((e, i) => { const l = this.out.get(e.a); if (l) l.push(i); else this.out.set(e.a, [i]); });
  }

  /** Points de la voie d'une arête, avec la largeur praticable de part et d'autre. */
  private lane(index: number) {
    const e = this.world.edges[index]!;
    const pts: Pt[] = [], left: number[] = [], right: number[] = [];
    for (let i = 1; i < e.p.length; i++) {
      const a = e.p[i - 1]!, b = e.p[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      for (const q of i === 1 ? [a, b] : [b]) {
        pts.push([q[0] - dz * e.l, q[1] + dx * e.l]);
        // La voie est à « l » à droite de l'axe ; les bordures sont à ± r de l'axe.
        left.push(-(e.r + e.l));
        right.push(e.r - e.l);
      }
    }
    return { pts, left, right };
  }

  /** Arête dont la voie passe au plus près du véhicule, dans son sens de marche ; null hors des rues. */
  /**
   * Arête dont la voie passe au plus près du véhicule, dans son sens de marche ; null hors des rues.
   * Les rues bloquées sont écartées s'il y a une autre voie ; « minCos » relâche l'alignement exigé (après une manœuvre).
   */
  private locate(x: number, z: number, heading: number, minCos = 0.5, reach = 4) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const search = (skipBlocked: boolean) => {
      let best = -1, bestD = Infinity, bestSeg = 0, foot: Pt = [x, z];
      this.world.edges.forEach((e, index) => {
        if (skipBlocked && this.isBlocked(index)) return;
        for (let i = 1; i < e.p.length; i++) {
          const a = e.p[i - 1]!, b = e.p[i]!;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
          if (dx * fx + dz * fz < minCos) continue;
          const ax = a[0] - dz * e.l, az = a[1] + dx * e.l;
          const t = Math.max(0, Math.min(len, (x - ax) * dx + (z - az) * dz));
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
          if (d < bestD && d < e.r + e.l + reach) { bestD = d; best = index; bestSeg = i; foot = [ax + dx * t, az + dz * t]; }
        }
      });
      return best < 0 ? null : { edge: best, seg: bestSeg, foot };
    };
    return search(true) ?? search(false);
  }

  /**
   * La voie derrière le véhicule, jusqu'au carrefour précédent : points dans l'ordre où on les parcourt en reculant.
   * Sert à rebrousser chemin en marche arrière dans une rue trop étroite pour faire demi-tour.
   */
  laneBehind(x: number, z: number, heading: number, max = 70): { pts: Pt[]; edge: number } | null {
    const at = this.locate(x, z, heading, 0.5, 4);
    if (!at) return null;
    const lane = this.lane(at.edge).pts;
    const pts: Pt[] = [at.foot];
    let total = 0;
    for (let i = at.seg - 1; i >= 0 && total < max; i--) {
      const q = lane[i]!, prev = pts[pts.length - 1]!;
      total += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      pts.push(q);
    }
    return pts.length > 1 ? { pts, edge: at.edge } : null;
  }

  /** Rue sur laquelle se trouve le véhicule (dans son sens de marche), ou -1. */
  edgeAt(x: number, z: number, heading: number) { return this.locate(x, z, heading)?.edge ?? -1; }

  /** Comme locate, mais seulement parmi les rues de l'itinéraire (tolérance plus large) : on ne saute pas sur une rue voisine. */
  private locateOn(x: number, z: number, heading: number, route: number[]) {
    const keep = new Set(route);
    const all = this.locate.bind(this);
    // On cherche d'abord avec la tolérance normale parmi toutes les rues, en ne gardant le résultat que s'il est sur l'itinéraire.
    const a = all(x, z, heading);
    if (a && keep.has(a.edge)) return a;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best: { edge: number; seg: number; foot: Pt } | null = null, bestD = Infinity;
    for (const index of route) {
      const e = this.world.edges[index]!;
      for (let i = 1; i < e.p.length; i++) {
        const p = e.p[i - 1]!, q = e.p[i]!;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len;
        if (dx * fx + dz * fz < -0.2) continue;
        const ax = p[0] - dz * e.l, az = p[1] + dx * e.l;
        const t = Math.max(0, Math.min(len, (x - ax) * dx + (z - az) * dz));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < bestD && d < e.r + e.l + 9) { bestD = d; best = { edge: index, seg: i, foot: [ax + dx * t, az + dz * t] }; }
      }
    }
    return best;
  }

  /** Coupe la trajectoire au pied de la destination sur la dernière rue, et note son abscisse. */
  private cutAtGoal(path: Path, goal: Pt) {
    let best = Infinity, cut = path.pts.length - 1, foot: Pt = path.pts[cut]!;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1]!, b = path.pts[i]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.max(0, Math.min(l, ((goal[0] - a[0]) * (b[0] - a[0]) + (goal[1] - a[1]) * (b[1] - a[1])) / l));
      const fx = a[0] + ((b[0] - a[0]) * t) / l, fz = a[1] + ((b[1] - a[1]) * t) / l;
      const d = Math.hypot(goal[0] - fx, goal[1] - fz);
      if (d < best) { best = d; cut = i; foot = [fx, fz]; }
    }
    path.pts.length = cut; path.cum.length = cut; path.left.length = cut; path.right.length = cut; path.edge.length = cut;
    const prev = path.pts[cut - 1]!;
    path.pts.push(foot); path.cum.push(path.cum[cut - 1]! + Math.hypot(foot[0] - prev[0], foot[1] - prev[1]));
    path.left.push(path.left[cut - 1]!); path.right.push(path.right[cut - 1]!); path.edge.push(path.edge[cut - 1]!);
    // Un peu de trajectoire au-delà, pour que le volant reste stable à l'arrivée.
    const dx = foot[0] - prev[0], dz = foot[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    path.goalS = path.cum[path.cum.length - 1]!;
    path.pts.push([foot[0] + (dx / l) * 10, foot[1] + (dz / l) * 10]); path.cum.push(path.goalS + 10);
    path.left.push(path.left[cut]!); path.right.push(path.right[cut]!); path.edge.push(path.edge[cut]!);
  }

  /** Arête suivante au bout de « index » : vers l'itinéraire s'il y en a un, sinon la plus droite ; -1 en impasse. */
  private next(index: number, goal: Pt | null) {
    const e = this.world.edges[index]!;
    // Pas de demi-tour : au bout d'une impasse, la trajectoire s'arrête.
    const all = (this.out.get(e.b) ?? []).filter((i) => this.world.edges[i]!.b !== e.a);
    // Une rue reconnue bloquée n'est reprise que s'il n'y a vraiment pas d'autre chemin.
    const open = all.filter((i) => !this.isBlocked(i));
    const list = open.length ? open : all;
    if (!list.length) return -1;
    const end = e.p[e.p.length - 1]!, before = e.p[e.p.length - 2] ?? e.p[0]!;
    const inDir = Math.atan2(end[0] - before[0], end[1] - before[1]);
    let best = list[0]!, bestScore = Infinity;
    for (const i of list) {
      const p = this.world.edges[i]!.p;
      const q = p[1] ?? p[0]!;
      const outDir = Math.atan2(q[0] - p[0]![0], q[1] - p[0]![1]);
      let score: number;
      if (goal) {
        const far = p[p.length - 1]!;
        score = Math.hypot(goal[0] - far[0], goal[1] - far[1]);
      } else {
        let turn = outDir - inDir;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        score = Math.abs(turn);
      }
      // Une rue qui finit en impasse n'est prise que s'il n'y a pas d'autre choix.
      const after = this.world.edges[i]!;
      if (!(this.out.get(after.b) ?? []).some((k) => this.world.edges[k]!.b !== after.a)) score += 1000;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /**
   * Trajectoire d'au moins « length » mètres devant le véhicule. Avec un itinéraire (« route »), elle en suit les rues
   * dans l'ordre et s'arrête à la destination ; sans itinéraire, elle prend aux carrefours la rue la plus droite.
   * Renvoie null hors des rues, ou si le véhicule n'est sur aucune rue de l'itinéraire.
   */
  plan(x: number, z: number, heading: number, length: number, goal: Pt | null, route?: number[]): Path | null {
    // Après une manœuvre, le véhicule peut être de biais ou hors de sa voie : on relâche l'alignement et la distance.
    const at = (route ? this.locateOn(x, z, heading, route) : null) ?? this.locate(x, z, heading) ?? this.locate(x, z, heading, -0.2, 9);
    if (!at) return null;
    let k = route ? route.indexOf(at.edge) : -1;
    if (route && k < 0) return null;
    // La trajectoire part du pied du véhicule sur la voie : un décalage en cours reste mesuré par rapport à la voie.
    const path: Path = { pts: [at.foot], cum: [0], left: [], right: [], edge: [at.edge], deadEnd: false };
    let index = at.edge, first = true, guard = 0;
    while (path.cum[path.cum.length - 1]! < length && index >= 0 && guard++ < 40) {
      const lane = this.lane(index);
      // Sur la première arête, on part du segment où se trouve le véhicule.
      const from = first ? at.seg : 1;
      if (first) { path.left.push(lane.left[0]!); path.right.push(lane.right[0]!); }
      for (let i = from; i < lane.pts.length; i++) {
        const q = lane.pts[i]!, prev = path.pts[path.pts.length - 1]!;
        const step = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        if (step < 0.5) continue;
        path.pts.push(q);
        path.cum.push(path.cum[path.cum.length - 1]! + step);
        path.left.push(lane.left[i]!);
        path.right.push(lane.right[i]!);
        path.edge.push(index);
      }
      first = false;
      if (route) {
        // Dernière rue de l'itinéraire : la trajectoire s'arrête à la destination.
        if (k === route.length - 1 && goal) { this.cutAtGoal(path, goal); break; }
        index = route[++k] ?? -1;
      } else {
        index = this.next(index, goal);
        if (index < 0) path.deadEnd = true;
      }
    }
    return path.pts.length > 1 ? path : null;
  }
}

/** Projection d'un point sur la trajectoire : abscisse, écart latéral (positif à droite) et segment. */
export function project(path: Path, x: number, z: number) {
  let best = { s: 0, d: Infinity, i: 0 }, bestDist = Infinity;
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1]!, b = path.pts[i]!;
    const len = path.cum[i]! - path.cum[i - 1]! || 1;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const t = (x - a[0]) * dx + (z - a[1]) * dz;
    const tc = Math.max(i === 1 ? -1e9 : 0, Math.min(i === path.pts.length - 1 ? 1e9 : len, t));
    const px = a[0] + dx * tc, pz = a[1] + dz * tc;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < bestDist) { bestDist = dist; best = { s: path.cum[i - 1]! + tc, d: (x - px) * -dz + (z - pz) * dx, i }; }
  }
  return best;
}

/** Point de la trajectoire à l'abscisse s, sa direction, et la largeur praticable à cet endroit. */
export function pointAt(path: Path, s: number) {
  const n = path.pts.length;
  let i = 1;
  while (i < n - 1 && path.cum[i]! < s) i++;
  const a = path.pts[i - 1]!, b = path.pts[i]!;
  const len = path.cum[i]! - path.cum[i - 1]! || 1;
  const t = s - path.cum[i - 1]!;
  const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  return { x: a[0] + dx * t, z: a[1] + dz * t, dx, dz, left: Math.max(path.left[i - 1]!, path.left[i]!), right: Math.min(path.right[i - 1]!, path.right[i]!), edge: path.edge[i]! };
}
