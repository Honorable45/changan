import { VEHICLES, steerLimit, type Input, type VehicleKind } from '../sim.ts';
import { pointAt, project } from './route.ts';
import type { Decision, Path } from './types.ts';

export type Car = { x: number; z: number; heading: number; speed: number; kind: VehicleKind };

/**
 * VehicleController : traduit la décision en commandes du jeu, les mêmes que celles du joueur
 * (accélérateur, frein, volant de −1 à 1). La physique du véhicule reste celle de la simulation.
 * - direction : poursuite d'un point de la voie (décalée si contournement), à une distance qui croît avec la vitesse ;
 * - vitesse : accélération ou freinage proportionnels à l'écart avec la consigne ; à l'arrêt, le frein reste serré.
 */
export class VehicleController {
  /** Décalage latéral appliqué, qui rejoint la consigne à 1,6 m/s en roulant (plus vite au pas) : pas de coup de volant. */
  offset = 0;
  /** Dernière action exécutée, pour le tableau de bord. */
  action = 'En attente';

  reset() { this.offset = 0; this.action = 'En attente'; }

  control(path: Path, decision: Decision, car: Car, dt: number): Input {
    const spec = VEHICLES[car.kind];
    const v = car.speed;
    // À faible allure, l'écart se prend plus vite : on braque franchement pour se dégager d'un obstacle proche.
    const rate = Math.max(1.6, 4 - Math.abs(v));
    this.offset += Math.max(-rate * dt, Math.min(rate * dt, decision.offset - this.offset));
    // Direction.
    const me = project(path, car.x, car.z);
    const look = Math.max(5, Math.min(26, 4 + Math.abs(v) * 0.55));
    const p = pointAt(path, me.s + look);
    const tx = p.x - p.dz * this.offset, tz = p.z + p.dx * this.offset;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const dx = tx - car.x, dz = tz - car.z;
    const lat = dx * -fz + dz * fx, fwd = dx * fx + dz * fz;
    const curvature = (2 * lat) / Math.max(1, lat * lat + fwd * fwd);
    const wheel = Math.atan(curvature * spec.wheelbase);
    const steer = Math.max(-1, Math.min(1, wheel / Math.max(0.02, steerLimit(car.kind, Math.abs(v)))));
    // Vitesse.
    const target = Math.max(0, decision.targetSpeed);
    let throttle = 0, brake = 0;
    if (target < 0.3 && v < 0.6) {
      // Le jeu passe en marche arrière si l'on appuie sur le frein à l'arrêt : SMART AI ne freine qu'en roulant ;
      // immobile et sans commande, le véhicule ne bouge pas.
      brake = v > 0.2 ? 1 : 0;
      this.action = v > 0.2 ? 'Arrêt en cours' : 'À l’arrêt';
    } else {
      let want = Math.max(-9, Math.min(spec.accel, (target - v) * 1.4));
      // Arrêt avant un point : décélération exacte pour s'arrêter à la distance voulue (v² / 2d), sans dépasser.
      if (decision.stopIn !== undefined && v > 0.2) {
        const need = (v * v) / (2 * Math.max(0.25, decision.stopIn));
        if (need > 0.8) want = Math.min(want, -Math.min(9, need * 1.15 + 0.3));
      }
      if (want > 0.05) {
        const push = spec.accel * (1 - Math.min(1, (Math.max(v, 0) / spec.max) ** 3)) || 0.1;
        throttle = Math.min(1, want / push + 0.05);
      } else if (want < -0.3 && v > 0.2) brake = Math.min(1, -want / 9 + 0.05);
      this.action = brake > 0 ? (target < 0.5 ? 'Arrêt en cours' : brake > 0.4 ? 'Freinage appuyé' : 'Freinage') : throttle > 0.6 ? 'Accélération' : throttle > 0 ? 'Maintien de la vitesse' : 'Roue libre';
    }
    if (Math.abs(this.offset) > 0.4) this.action += this.offset < 0 ? ' · décalage à gauche' : ' · décalage à droite';
    return { throttle, brake, steer };
  }
}
