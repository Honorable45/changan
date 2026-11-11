import { TWO_WHEELS, VEHICLES, halfWidth, type GameSim, type Pt, type TrafficCar, type VehicleKind } from '../sim.ts';
import { RiskAnalyzer } from './risk.ts';
import type { Detection, ObjectClass, Path, Threat } from './types.ts';

/**
 * SMART AI pour toute la circulation : chaque véhicule (voitures, motos, minibus, pick-up, taxis, fourgons) analyse
 * sa propre trajectoire avec le même RiskAnalyzer que la voiture du joueur — piétons, autres véhicules, voiture du joueur,
 * Honorable à pied, véhicules garés — et en déduit une vitesse à ne pas dépasser : suivre à distance, freiner, s'arrêter.
 *
 * Aux croisements, celui qui arriverait le second au point de conflit cède le passage ; à égalité, une règle fixe
 * (l'indice du véhicule) départage ; deux véhicules qui s'attendent l'un l'autre plus de 3 s : le plus petit indice repart au pas.
 *
 * Pour rester fluide sur téléphone, l'analyse de chaque véhicule est rafraîchie 10 fois par seconde, en décalé.
 * FleetSafety fournit aussi le freinage d'urgence du joueur quand il conduit lui-même.
 */
const COMFORT = 5;
const stopSpeed = (room: number) => Math.sqrt(2 * COMFORT * Math.max(0, room));
const classOf = (k: VehicleKind): ObjectClass => (TWO_WHEELS.has(k) ? 'moto' : k === 'minibus' || k === 'fourgon' || k === 'pickup' ? 'camion' : 'voiture');
const RANGE = 45;

type Guard = { limit: number; at: number; waited: number; reason: string; pulledAt: number };

export class FleetSafety {
  private risk = new RiskAnalyzer();
  private guards = new Map<TrafficCar, Guard>();
  private clock = 0;
  private frame = 0;
  private grid = new Map<string, Detection[]>();
  private gridAt = -1;
  /** Interventions depuis le début : ralentissements et arrêts décidés par l'anti-collision. */
  stats = { traffic: 0, emergency: 0, causes: {} as Record<string, number> };

  /** À appeler une fois par pas de simulation, avant la circulation. */
  tick(dt: number) { this.clock += dt; this.frame++; }

  /** Tous les objets en mouvement ou immobiles, rangés par cases de 30 m, reconstruits 10 fois par seconde. */
  private objects(sim: GameSim) {
    if (this.clock - this.gridAt < 0.1 && this.gridAt >= 0) return this.grid;
    this.gridAt = this.clock;
    const grid = new Map<string, Detection[]>();
    const put = (d: Detection) => { const k = `${Math.floor(d.x / 30)},${Math.floor(d.z / 30)}`; const l = grid.get(k); if (l) l.push(d); else grid.set(k, [d]); };
    const base = { source: 'jeu', confidence: 1 };
    sim.traffic.forEach((t, i) => {
      const s = VEHICLES[t.kind];
      put({ ...base, id: `vehicule-${i}`, cls: classOf(t.kind), x: t.x, z: t.z, vx: Math.sin(t.heading) * t.speed, vz: Math.cos(t.heading) * t.speed, heading: t.heading, radius: halfWidth(t.kind), length: s.half + s.radius * 0.6, fixed: false });
    });
    sim.walkers.forEach((w, i) => put({ ...base, id: `pieton-${i}`, cls: 'pieton', x: w.x, z: w.z, vx: Math.sin(w.heading) * w.speed, vz: Math.cos(w.heading) * w.speed, heading: w.heading, radius: 0.35, length: 0.3, fixed: false }));
    sim.parked.forEach((p, i) => {
      if (p.kind === 'helico') return;
      const s = VEHICLES[p.kind];
      put({ ...base, id: `gare-${i}`, cls: 'vehicule-gare', x: p.x, z: p.z, vx: 0, vz: 0, heading: p.heading, radius: halfWidth(p.kind), length: s.half + s.radius * 0.6, fixed: true });
    });
    const c = sim.car;
    if (sim.mode === 'car' && c.y < 2) {
      const s = VEHICLES[c.kind];
      put({ ...base, id: 'joueur', cls: classOf(c.kind), x: c.x, z: c.z, vx: Math.sin(c.heading) * c.speed, vz: Math.cos(c.heading) * c.speed, heading: c.heading, radius: halfWidth(c.kind), length: s.half + s.radius * 0.6, fixed: false });
    } else if (sim.mode === 'foot' && !sim.room) {
      const h = sim.hero;
      put({ ...base, id: 'honorable', cls: 'pieton', x: h.x, z: h.z, vx: Math.sin(h.heading) * h.speed, vz: Math.cos(h.heading) * h.speed, heading: h.heading, radius: 0.35, length: 0.3, fixed: false });
    }
    this.grid = grid;
    return grid;
  }

  private near(sim: GameSim, x: number, z: number, skip: string) {
    const grid = this.objects(sim);
    const cx = Math.floor(x / 30), cz = Math.floor(z / 30), out: Detection[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const d of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
      if (d.id !== skip && Math.abs(d.x - x) < RANGE && Math.abs(d.z - z) < RANGE) out.push(d);
    }
    return out;
  }

  /** Trajectoire d'un véhicule : sa position puis ses points de passage, prolongée tout droit, sur 45 m. */
  private pathOf(x: number, z: number, heading: number, targets: Pt[], lane?: { l: number; r: number }): Path {
    const pts: Pt[] = [[x, z]];
    let run = 0;
    for (const q of targets) {
      const p = pts[pts.length - 1]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l < 0.3) continue;
      pts.push(q); run += l;
      if (run > RANGE) break;
    }
    const last = pts[pts.length - 1]!, prev = pts[pts.length - 2];
    const dir = prev ? Math.atan2(last[0] - prev[0], last[1] - prev[1]) : heading;
    if (run < RANGE) pts.push([last[0] + Math.sin(dir) * (RANGE - run + 5), last[1] + Math.cos(dir) * (RANGE - run + 5)]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    // Largeur réelle de la rue (voie à « l » de l'axe, bordures à ± r) : un piéton sur le trottoir n'est pas sur la chaussée.
    const left = lane ? -(lane.r + lane.l) : -4, right = lane ? lane.r - lane.l : 4;
    return { pts, cum, left: pts.map(() => left), right: pts.map(() => right), edge: pts.map(() => 0), deadEnd: false };
  }

  /**
   * Vitesse maximale sûre pour ce véhicule de la circulation, en m/s (Infinity : rien ne gêne).
   * Rafraîchie toutes les 0,1 s, en décalé d'un véhicule à l'autre.
   */
  guard(sim: GameSim, t: TrafficCar, index: number): number {
    const g = this.guards.get(t) ?? { limit: Infinity, at: -1, waited: 0, reason: '', pulledAt: -99 };
    this.guards.set(t, g);
    if (g.at >= 0 && this.clock - g.at < 0.1 && (this.frame + index) % 6 !== 0) return g.limit;
    const dt = g.at < 0 ? 0 : this.clock - g.at;
    g.at = this.clock;
    const spec = VEHICLES[t.kind];
    const e = sim.world.edges[t.edge];
    const path = this.pathOf(t.x, t.z, t.heading, t.targets, e ? { l: e.l, r: e.r } : undefined);
    const ego = { x: t.x, z: t.z, speed: t.speed, halfWidth: halfWidth(t.kind), front: spec.half + spec.radius * 0.6, offset: 0 };
    const threats = this.risk.analyze(this.near(sim, t.x, t.z, `vehicule-${index}`), path, ego, RANGE);
    let limit = Infinity, reason = '';
    for (const th of threats) {
      if (th.level < 2 || !(th.inCorridor || th.crossing)) continue;
      const v = this.limitFor(th, t, index, g);
      if (v < limit) { limit = v; reason = th.det.id; }
    }
    // Attente prolongée : on la mémorise.
    g.waited = limit < 0.5 && t.speed < 0.3 ? g.waited + dt : 0;
    // Deux véhicules qui s'attendent l'un l'autre depuis plus de 3 s (petits ronds-points, voies qui convergent) :
    // celui de plus petit indice repart au pas, l'autre continue d'attendre. Jamais face à un piéton ni au joueur.
    if (g.waited > 3 && reason.startsWith('vehicule-')) {
      const other = Number(reason.slice(9)), og = this.guards.get(sim.traffic[other]!);
      if (og && og.waited > 1.5 && og.reason === `vehicule-${index}` && index < other) limit = 3;
    }
    if (limit < t.speed - 0.5 && limit !== g.limit) {
      this.stats.traffic++;
      const cause = reason.split('-')[0] ?? '';
      this.stats.causes[cause] = (this.stats.causes[cause] ?? 0) + 1;
    }
    g.limit = limit; g.reason = reason;
    return limit;
  }

  /** Vitesse permise face à un danger, selon sa nature. */
  private limitFor(th: Threat, t: TrafficCar, index: number, g: Guard): number {
    const d = th.det;
    if (d.cls === 'pieton') return stopSpeed(th.gap - 4);
    if (d.fixed) return stopSpeed(th.gap - 3);
    const otherIndex = d.id.startsWith('vehicule-') ? Number(d.id.slice(9)) : -1;
    // Côte à côte (deux voies qui se rejoignent) : celui qui est un peu derrière cède, l'autre passe ; à égalité, l'indice départage.
    if (th.inCorridor && th.gap < 1.5) {
      // Vraiment côte à côte, chacun peut croire l'autre un peu devant : une règle fixe tranche (le joueur passe toujours).
      const otherAhead = Math.abs(th.s) >= 2.5 ? th.s > 0 : d.id === 'joueur' || otherIndex < index;
      return otherAhead ? 0 : Infinity;
    }
    // Véhicule devant, dans le même sens : 2 secondes de distance, 6 m au moins.
    if (th.along > 0.8 && th.inCorridor) return Math.max(0, Math.min(th.along + (th.gap - (6 + 2 * th.along)) * 0.5, stopSpeed(th.gap - 4)));
    if (th.along < -1 && th.inCorridor) return stopSpeed(th.gap - 5);
    // Véhicule arrêté ou lent devant, dans notre voie : on s'arrête derrière lui, avec la marge que demande le freinage progressif.
    if (th.inCorridor) return stopSpeed(th.gap - 4.5);
    // Croisement : qui arrive le premier au point de conflit ? L'autre cède.
    const vlat = Math.abs(Math.hypot(d.vx, d.vz) ** 2 - th.along ** 2) ** 0.5;
    const mine = th.gap / Math.max(t.speed, 1);
    const theirs = vlat > 0.2 ? Math.max(0, Math.abs(th.d) - th.corridor) / vlat : Infinity;
    // Écart de moins de 0,8 s : égalité, tranchée par une règle fixe (le joueur passe, puis le plus petit indice),
    // pour que les deux véhicules arrivent à la même conclusion malgré leurs estimations un peu différentes.
    const otherFirst = Math.abs(theirs - mine) <= 0.8 ? d.id === 'joueur' || otherIndex < index : theirs < mine;
    return otherFirst ? stopSpeed(th.gap - 4) : Infinity;
  }

  /**
   * Freinage d'urgence de la voiture du joueur quand il conduit lui-même : un danger dans sa trajectoire
   * (piéton, véhicule, obstacle) atteint dans moins de 1,5 s, ou demandant plus de 5,5 m/s² de freinage. Renvoie ce qu'il a vu, ou null.
   */
  emergency(sim: GameSim): string | null {
    const c = sim.car;
    if (sim.mode !== 'car' || c.kind === 'helico' || c.speed < 2) return null;
    const spec = VEHICLES[c.kind];
    const reach = Math.min(RANGE, 8 + c.speed * 1.6);
    const ahead: Pt[] = [];
    for (let s = 0; s <= reach; s += 3) ahead.push([c.x + Math.sin(c.heading) * s, c.z + Math.cos(c.heading) * s]);
    const path = this.pathOf(c.x, c.z, c.heading, ahead.slice(1));
    const ego = { x: c.x, z: c.z, speed: c.speed, halfWidth: halfWidth(c.kind), front: spec.half + spec.radius * 0.6, offset: 0 };
    for (const th of this.risk.analyze(this.near(sim, c.x, c.z, 'joueur'), path, ego, reach)) {
      if (!(th.inCorridor || th.crossing) || th.gap > reach) continue;
      if (th.ttc < 1.5 || th.decel > 5.5) { this.stats.emergency++; return th.det.cls; }
    }
    return null;
  }
}
