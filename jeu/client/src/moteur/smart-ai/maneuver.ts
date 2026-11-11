import { VEHICLES, halfWidth, steerLimit, type GameSim, type Input, type Pt } from '../sim.ts';
import type { Detection } from './types.ts';

/**
 * Manœuvres de dégagement, quand la voie est bloquée et qu'aucun contournement n'est possible là où l'on est :
 * - « recul » : marche arrière en ligne droite, pour se donner la place de contourner ;
 * - « demi-tour » : demi-tour en plusieurs fois (marche avant braquée, marche arrière contre-braquée, et ainsi de suite)
 *   pour rebrousser chemin et prendre une autre rue ;
 * - « retour » : dans une rue trop étroite pour faire demi-tour, marche arrière en suivant la voie jusqu'au carrefour précédent ;
 * - « apprise » : rejouer, au pas, le chemin qu'un joueur a pris pour se sortir de ce même endroit (marche avant et arrière).
 * À chaque instant, des sondes vérifient l'espace devant ou derrière le véhicule (murs, véhicules, piétons) :
 * la manœuvre change de sens avant de toucher quoi que ce soit, et se met en pause si quelqu'un passe tout près.
 */
export type ManeuverKind = 'recul' | 'demi-tour' | 'retour' | 'apprise';
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const CREEP = 1.8;

/** L'espace sur « reach » mètres devant (dir = 1) ou derrière (dir = −1) le véhicule est-il libre ? */
export function clearance(sim: GameSim, dets: Detection[], dir: 1 | -1, reach: number) {
  const c = sim.car, spec = VEHICLES[c.kind], hw = halfWidth(c.kind);
  const end = spec.half + spec.radius * 0.6;
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  for (let d = 0.2; d <= reach + 1e-6; d += 0.4) {
    const along = dir * (end + d);
    for (const lat of [-hw, -hw / 2, 0, hw / 2, hw]) {
      const x = c.x + fx * along - fz * lat, z = c.z + fz * along + fx * lat;
      if (sim.solidAt(x, z) || !sim.world.inBounds(x, z)) return false;
      for (const o of dets) {
        if (o.cls === 'feu-rouge' || o.cls === 'nid-de-poule') continue;
        // Les véhicules sont des segments : distance au segment, moins leur demi-largeur.
        const hx = Math.sin(o.heading) * o.length, hz = Math.cos(o.heading) * o.length;
        const len2 = 4 * (hx * hx + hz * hz) || 1;
        const t = Math.max(0, Math.min(1, ((x - (o.x - hx)) * 2 * hx + (z - (o.z - hz)) * 2 * hz) / len2));
        const px = o.x - hx + 2 * hx * t, pz = o.z - hz + 2 * hz * t;
        if (Math.hypot(x - px, z - pz) < o.radius + 0.35) return false;
      }
    }
  }
  return true;
}

export class Maneuver {
  done = false;
  failed = false;
  action = '';
  private phase: 1 | -1;
  private h0: number;
  private travelled = 0;
  private px: number; private pz: number;
  private cycles = 0;
  private wait = 0;
  private behindFor = 0;
  private released = false;
  readonly turn: -1 | 1;
  private distance: number;
  private route: Pt[];
  private dirs: (1 | -1)[];
  private progress = 0;
  /** Corrections en cours de rejeu : petite marche arrière contre-braquée quand l'avant bute (au plus 4). */
  private correcting = 0;
  private corrections = 0;
  private corrStart: Pt = [0, 0];
  private corrSteer = 0;
  /** Temps passé à pousser sans avancer (flanc accroché à un angle de mur). */
  private stalled = 0;
  readonly kind: ManeuverKind;

  /** « turn » : −1 pour un demi-tour par la gauche, 1 par la droite ; « distance » : longueur du recul. */
  constructor(kind: ManeuverKind, sim: GameSim, turn: -1 | 1 = -1, distance = 0, route: Pt[] = [], dirs: (1 | -1)[] = []) {
    this.kind = kind;
    this.route = route;
    this.dirs = dirs;
    this.turn = turn;
    this.distance = distance;
    this.h0 = sim.car.heading;
    this.px = sim.car.x; this.pz = sim.car.z;
    // Un recul commence en arrière ; un demi-tour commence en avant, en braquant.
    this.phase = kind === 'recul' ? -1 : 1;
  }

  /** Angle déjà tourné depuis le début de la manœuvre (rad). */
  turned(sim: GameSim) { return Math.abs(wrap(sim.car.heading - this.h0)); }

  step(sim: GameSim, dets: Detection[], dt: number): Input {
    const c = sim.car, v = c.speed;
    this.travelled += Math.hypot(c.x - this.px, c.z - this.pz);
    this.px = c.x; this.pz = c.z;
    if (this.kind === 'apprise') this.phase = this.dirs[Math.min(this.progress, this.dirs.length - 1)] ?? 1;
    const goingBack = this.phase < 0;

    // Quelqu'un tout près, du côté où l'on va : pause.
    const moving = dets.filter((o) => !o.fixed && Math.hypot(o.x - c.x, o.z - c.z) < 7);
    if (moving.length && !clearance(sim, moving, this.phase, 2.5)) {
      this.wait += dt;
      if (this.wait > 20) this.failed = true;
      this.action = `Manœuvre en pause : ${goingBack ? 'quelqu’un derrière' : 'quelqu’un devant'}`;
      return this.halt(v);
    }
    this.wait = 0;

    if (this.kind === 'retour') return this.backTrack(sim, dets, dt);
    if (this.kind === 'apprise') return this.replay(sim, dets, dt);

    if (this.kind === 'recul') {
      const blocked = !clearance(sim, dets, -1, 0.8);
      if (this.travelled >= this.distance || blocked) {
        this.action = 'Recul terminé';
        if (Math.abs(v) < 0.2) { this.done = true; this.failed = blocked && this.travelled < 1; }
        return this.halt(v);
      }
      this.action = `Marche arrière : ${Math.max(0, this.distance - this.travelled).toFixed(1)} m`;
      return this.reverse(v, 0);
    }

    // Demi-tour.
    if (this.turned(sim) > Math.PI - 0.3) {
      this.action = 'Demi-tour terminé';
      if (Math.abs(v) < 0.2) this.done = true;
      return this.halt(v);
    }
    const blocked = !clearance(sim, dets, this.phase, 0.9);
    if (blocked || this.travelled > 7) {
      // Fin de cette passe : on s'arrête, puis on repart dans l'autre sens.
      this.action = goingBack ? 'Demi-tour : fin de la marche arrière' : 'Demi-tour : fin de la marche avant';
      if (Math.abs(v) < 0.2) {
        if (blocked && this.travelled < 0.3 && !clearance(sim, dets, this.phase === 1 ? -1 : 1, 0.9)) { this.failed = true; return this.halt(v); }
        this.phase = this.phase === 1 ? -1 : 1;
        this.travelled = 0;
        this.released = false;
        if (++this.cycles > 8) this.failed = true;
      }
      return this.halt(v);
    }
    const side = this.turn < 0 ? 'gauche' : 'droite';
    if (goingBack) {
      this.action = `Demi-tour : marche arrière, braquage à ${this.turn < 0 ? 'droite' : 'gauche'}`;
      // En marche arrière, le volant contre-braqué continue de faire pivoter le véhicule dans le même sens.
      return this.reverse(v, -this.turn);
    }
    this.action = `Demi-tour : marche avant, braquage à ${side}`;
    return this.forward(v, this.turn);
  }

  /** Marche arrière guidée le long de la voie : on vise un point 4 m plus loin derrière, comme en marche avant mais à rebours. */
  private backTrack(sim: GameSim, dets: Detection[], dt: number): Input {
    const c = sim.car, v = c.speed, spec = VEHICLES[c.kind];
    const end = this.route[this.route.length - 1]!;
    if (Math.hypot(end[0] - c.x, end[1] - c.z) < 2.5) {
      this.action = 'Retour au carrefour terminé';
      if (Math.abs(v) < 0.2) this.done = true;
      return this.halt(v);
    }
    if (!clearance(sim, dets, -1, 0.8)) {
      this.behindFor += dt;
      if (this.behindFor > 15) this.failed = true;
      this.action = `Marche arrière en pause : obstacle derrière (${Math.ceil(15 - this.behindFor)} s)`;
      return this.halt(v);
    }
    this.behindFor = 0;
    let i = 0, best = Infinity;
    this.route.forEach((q, k) => { const d = Math.hypot(q[0] - c.x, q[1] - c.z); if (d < best) { best = d; i = k; } });
    let target = this.route[this.route.length - 1]!;
    for (let k = i; k < this.route.length; k++) { const q = this.route[k]!; if (Math.hypot(q[0] - c.x, q[1] - c.z) > 4) { target = q; break; } }
    // En reculant, le véhicule avance dans la direction cap + π ; braquer à droite fait pivoter cette direction dans l'autre sens qu'en marche avant.
    const travel = c.heading + Math.PI;
    const e = wrap(Math.atan2(target[0] - c.x, target[1] - c.z) - travel);
    const dist = Math.max(2, Math.hypot(target[0] - c.x, target[1] - c.z));
    const wheel = Math.atan((2 * Math.sin(e) * spec.wheelbase) / dist);
    const steer = Math.max(-1, Math.min(1, wheel / Math.max(0.02, steerLimit(c.kind, Math.abs(v)))));
    this.action = `Marche arrière jusqu’au carrefour : ${Math.round(Math.hypot(end[0] - c.x, end[1] - c.z))} m`;
    return this.reverse(v, steer);
  }

  /**
   * Rejouer une démonstration : on suit ses points dans l'ordre, dans le sens où le joueur roulait (marche avant ou arrière),
   * en s'arrêtant à chaque changement de sens. Allure : 9 km/h en avant, 5 km/h en arrière. Un obstacle fixe qui bloque plus de 3 s fait échouer.
   */
  private replay(sim: GameSim, dets: Detection[], dt: number): Input {
    const c = sim.car, v = c.speed, spec = VEHICLES[c.kind];
    const n = this.route.length;
    // Avancement : le point le plus proche, sans jamais revenir en arrière dans la démonstration.
    for (let k = this.progress; k < Math.min(n, this.progress + 12); k++) {
      if (Math.hypot(this.route[k]![0] - c.x, this.route[k]![1] - c.z) < Math.hypot(this.route[this.progress]![0] - c.x, this.route[this.progress]![1] - c.z)) this.progress = k;
    }
    const end = this.route[n - 1]!;
    if (Math.hypot(end[0] - c.x, end[1] - c.z) < 2.5 || this.progress >= n - 2) {
      this.action = 'Solution apprise suivie jusqu’au bout';
      if (Math.abs(v) < 0.2) this.done = true;
      return this.halt(v);
    }
    const dir = this.dirs[this.progress] ?? 1;
    // Correction en cours : reculer de 2 m en contre-braquant, comme un conducteur qui reprend son virage.
    if (this.correcting) {
      const back = Math.hypot(c.x - this.corrStart[0], c.z - this.corrStart[1]);
      if (back >= 2 || !clearance(sim, dets, (-dir) as 1 | -1, 0.6)) {
        this.action = 'Solution apprise : reprise du virage';
        if (Math.abs(v) < 0.2) { this.correcting = 0; this.released = false; }
        return this.halt(v);
      }
      this.action = `Solution apprise : correction ${this.corrections}/4, recul contre-braqué`;
      return dir > 0 ? this.reverse(v, this.corrSteer) : this.forward(v, this.corrSteer);
    }
    // On pousse sans avancer depuis 1,5 s : un flanc accroche, on corrige comme si l'avant butait.
    this.stalled = Math.abs(v) < 0.15 ? this.stalled + dt : 0;
    const stuck = this.stalled > 1.5;
    if (stuck) this.stalled = 0;
    const blocked = stuck || !clearance(sim, dets, dir, 0.9);
    if (blocked) {
      if (Math.abs(v) > 0.2) { this.action = 'Solution apprise : obstacle proche'; return this.halt(v); }
      // L'avant bute : correction, si possible ; sinon, après 3 s, échec.
      if (this.corrections < 4 && clearance(sim, dets, (-dir) as 1 | -1, 0.8)) {
        this.corrections++;
        this.correcting = 1;
        this.corrStart = [c.x, c.z];
        const tp = this.route[Math.min(n - 1, this.progress + 6)]!;
        const travel = dir > 0 ? c.heading : c.heading + Math.PI;
        const e = wrap(Math.atan2(tp[0] - c.x, tp[1] - c.z) - travel);
        // En sens inverse, le volant braqué de l'autre côté fait pivoter le véhicule vers le chemin.
        this.corrSteer = e < 0 ? -1 : 1;
        this.released = false;
        return this.halt(v);
      }
      this.behindFor += dt;
      if (this.behindFor > 3) this.failed = true;
      this.action = 'Solution apprise : obstacle sur le chemin';
      return this.halt(v);
    }
    this.behindFor = 0;
    // Point visé : 3 m plus loin dans la démonstration, sans dépasser le prochain changement de sens.
    let target = this.progress, run = 0;
    while (target < n - 1 && run < 3 && (this.dirs[target + 1] ?? dir) === dir) { run += Math.hypot(this.route[target + 1]![0] - this.route[target]![0], this.route[target + 1]![1] - this.route[target]![1]); target++; }
    const tp = this.route[target]!;
    // Arrivé au changement de sens : on s'arrête avant de repartir dans l'autre.
    if ((this.dirs[target + 1] ?? dir) !== dir && Math.hypot(tp[0] - c.x, tp[1] - c.z) < 1) {
      this.progress = target + 1;
      this.released = false;
      this.action = 'Solution apprise : changement de sens';
      return this.halt(v);
    }
    const travel = dir > 0 ? c.heading : c.heading + Math.PI;
    const e = wrap(Math.atan2(tp[0] - c.x, tp[1] - c.z) - travel);
    const dist = Math.max(2, Math.hypot(tp[0] - c.x, tp[1] - c.z));
    // En marche avant, braquer à droite fait tourner le cap dans un sens ; en arrière, dans l'autre.
    const wheel = Math.atan((2 * Math.sin(e) * spec.wheelbase) / dist) * (dir > 0 ? -1 : 1);
    const steer = Math.max(-1, Math.min(1, wheel / Math.max(0.02, steerLimit(c.kind, Math.abs(v)))));
    this.action = `Solution apprise : ${dir > 0 ? 'marche avant' : 'marche arrière'} (${Math.round((this.progress / n) * 100)} %)`;
    if (dir > 0) return v < -0.1 ? { throttle: 1, brake: 0, steer } : { throttle: v < 2.5 ? 0.35 : 0, brake: v > 3.2 ? 0.4 : 0, steer };
    return this.reverse(v, steer);
  }

  /** S'immobiliser : frein en avançant, accélérateur pour arrêter une marche arrière. */
  private halt(v: number): Input {
    this.released = false;
    if (v > 0.2) return { throttle: 0, brake: 1, steer: 0 };
    if (v < -0.2) return { throttle: 1, brake: 0, steer: 0 };
    return { throttle: 0, brake: 0, steer: 0 };
  }

  private forward(v: number, steer: number): Input {
    if (v < -0.1) return { throttle: 1, brake: 0, steer };
    return { throttle: v < CREEP ? 0.35 : 0, brake: v > CREEP + 0.6 ? 0.4 : 0, steer };
  }

  /**
   * Marche arrière du jeu : à l'arrêt, relâcher le frein un instant puis le maintenir enclenche la marche arrière ;
   * il reste appuyé (même légèrement) tant que l'on recule.
   */
  private reverse(v: number, steer: number): Input {
    if (v > 0.2) return { throttle: 0, brake: 1, steer };
    if (!this.released && v > -0.1) { this.released = true; return { throttle: 0, brake: 0, steer }; }
    return { throttle: 0, brake: v > -CREEP ? 0.6 : 0.05, steer };
  }
}
