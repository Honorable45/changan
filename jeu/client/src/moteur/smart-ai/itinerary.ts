import type { Pt, World } from '../sim.ts';

/**
 * Itinéraire de SMART AI : la suite des rues (arêtes du graphe) qui mène à la destination, calculée une fois
 * par plus court chemin (Dijkstra), puis suivie telle quelle. Il n'est recalculé que si le véhicule s'en écarte
 * ou si une rue se révèle bloquée : jamais arbitrairement.
 *
 * Il sait aussi dire si la destination est « derrière » : le plus court chemin commence alors par la rue
 * dans l'autre sens, ce qui demande un demi-tour.
 */
export type Route = {
  /** Rues à parcourir, dans l'ordre ; la première est celle où se trouve (ou se trouvera après demi-tour) le véhicule. */
  edges: number[];
  goal: Pt;
  /** Le chemin commence par la rue dans l'autre sens : demi-tour nécessaire. */
  behind: boolean;
  length: number;
};

const lengthOf = (p: Pt[]) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]), 0);

export class Itinerary {
  private world: World;
  private out = new Map<number, number[]>();
  private len: number[];
  private reverseOf = new Map<number, number>();

  constructor(world: World) {
    this.world = world;
    world.edges.forEach((e, i) => { const l = this.out.get(e.a); if (l) l.push(i); else this.out.set(e.a, [i]); });
    this.len = world.edges.map((e) => lengthOf(e.p));
    const key = new Map(world.edges.map((e, i) => [`${e.a}-${e.b}`, i]));
    world.edges.forEach((e, i) => { const r = key.get(`${e.b}-${e.a}`); if (r !== undefined) this.reverseOf.set(i, r); });
  }

  reverse(edge: number) { return this.reverseOf.get(edge) ?? -1; }

  /** Distance d'un point à une rue, et position (0 à 1) de son pied le long de la rue. */
  private foot(edge: number, x: number, z: number) {
    const p = this.world.edges[edge]!.p;
    let best = Infinity, at = 0, run = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.max(0, Math.min(l, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l));
      const d = Math.hypot(x - a[0] - ((b[0] - a[0]) * t) / l, z - a[1] - ((b[1] - a[1]) * t) / l);
      if (d < best) { best = d; at = run + t; }
      run += l;
    }
    return { d: best, along: at };
  }

  /** Rues sur lesquelles se trouve la destination (les deux sens d'une rue à double sens). */
  private targets(goal: Pt) {
    let best = Infinity;
    const all = this.world.edges.map((_, i) => ({ i, ...this.foot(i, goal[0], goal[1]) }));
    for (const t of all) best = Math.min(best, t.d);
    return all.filter((t) => t.d < best + 0.5);
  }

  /**
   * Plus court chemin depuis la rue « start », dont il reste « remaining » mètres à parcourir, jusqu'à la destination.
   * Pas de demi-tour aux carrefours (sauf impasse) ; les rues bloquées coûtent très cher, sans être interdites.
   */
  private shortest(start: number, remaining: number, goal: Pt, blocked: (e: number) => boolean) {
    const targets = new Map(this.targets(goal).map((t) => [t.i, t.along]));
    // Destination sur la rue de départ, devant nous.
    const here = targets.get(start);
    const startLen = this.len[start]!;
    if (here !== undefined && here >= startLen - remaining - 1) return { edges: [start], cost: here - (startLen - remaining) };
    const dist = new Map<number, number>([[start, remaining]]);
    const prev = new Map<number, number>();
    const done = new Set<number>();
    let bestEnd = -1, bestCost = Infinity;
    for (;;) {
      let cur = -1, d = Infinity;
      for (const [e, c] of dist) if (!done.has(e) && c < d) { d = c; cur = e; }
      if (cur < 0 || d >= bestCost) break;
      done.add(cur);
      const e = this.world.edges[cur]!;
      const outs = (this.out.get(e.b) ?? []).filter((i) => this.world.edges[i]!.b !== e.a);
      for (const n of outs.length ? outs : this.out.get(e.b) ?? []) {
        const along = targets.get(n);
        const penalty = blocked(n) ? 5000 : 0;
        if (along !== undefined) {
          const c = d + along + penalty;
          if (c < bestCost) { bestCost = c; bestEnd = n; prev.set(n, cur); }
        }
        const c = d + this.len[n]! + penalty;
        if (c < (dist.get(n) ?? Infinity)) { dist.set(n, c); prev.set(n, cur); }
      }
    }
    if (bestEnd < 0) return null;
    const edges = [bestEnd];
    while (edges[0] !== start) edges.unshift(prev.get(edges[0]!)!);
    return { edges, cost: bestCost };
  }

  /**
   * Itinéraire depuis la rue « edge » (le véhicule y est à « along » mètres du début) : tout droit, ou après un demi-tour
   * sur place si « canTurn » et si c'est nettement plus court. Le demi-tour compte pour 40 m.
   */
  plan(edge: number, along: number, goal: Pt, canTurn: boolean, blocked: (e: number) => boolean): Route | null {
    const ahead = this.shortest(edge, this.len[edge]! - along, goal, blocked);
    const rev = this.reverse(edge);
    const back = canTurn && rev >= 0 ? this.shortest(rev, along, goal, blocked) : null;
    if (back && (!ahead || back.cost + 40 < ahead.cost)) return { edges: back.edges, goal, behind: true, length: back.cost };
    if (ahead) return { edges: ahead.edges, goal, behind: false, length: ahead.cost };
    // Pas de chemin devant, et demi-tour impossible ici : l'appelant avance jusqu'à trouver une place pour tourner.
    return null;
  }

  /** La destination est-elle derrière le véhicule, même s'il ne peut pas tourner ici ? */
  behind(edge: number, along: number, goal: Pt, blocked: (e: number) => boolean) {
    const r = this.plan(edge, along, goal, true, blocked);
    return !!r?.behind;
  }
}
