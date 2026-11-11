import { TWO_WHEELS, VEHICLES, halfWidth, type GameSim, type VehicleKind } from '../sim.ts';
import { pointAt, project } from './route.ts';
import type { Detection, ObjectClass, Path } from './types.ts';

/** Ce que voit un capteur à un instant : la simulation, la trajectoire prévue, la portée d'analyse. */
export type PerceptionContext = { sim: GameSim; path: Path | null; range: number };

/**
 * Un capteur produit des détections. Le jeu fournit aujourd'hui GameStateSensor, qui lit l'état réel de la simulation.
 * Un capteur de vision (image de la caméra du véhicule passée à YOLO, par ONNX Runtime Web, ou à OpenCV.js)
 * implémentera la même interface et sera ajouté à EnvironmentDetector : ses détections, moins sûres (confidence < 1),
 * sont fusionnées avec les autres sans rien changer à l'analyse du risque ni à la décision.
 */
export interface Sensor {
  readonly name: string;
  detect(ctx: PerceptionContext): Detection[];
}

const classOf = (k: VehicleKind): ObjectClass => (TWO_WHEELS.has(k) ? 'moto' : k === 'minibus' || k === 'fourgon' || k === 'pickup' ? 'camion' : 'voiture');

/** Capteur « état du jeu » : piétons, circulation, véhicules garés, nids-de-poule, feux et obstacles fixes, tels que la simulation les connaît. */
export class GameStateSensor implements Sensor {
  readonly name = 'jeu';

  detect({ sim, path, range }: PerceptionContext): Detection[] {
    const c = sim.car;
    const near = (x: number, z: number) => Math.abs(x - c.x) < range && Math.abs(z - c.z) < range && Math.hypot(x - c.x, z - c.z) < range;
    const out: Detection[] = [];
    const base = { source: this.name, confidence: 1 };
    sim.walkers.forEach((w, i) => {
      if (!near(w.x, w.z)) return;
      out.push({ ...base, id: `pieton-${i}`, cls: 'pieton', x: w.x, z: w.z, vx: Math.sin(w.heading) * w.speed, vz: Math.cos(w.heading) * w.speed, heading: w.heading, radius: 0.35, length: 0.3, fixed: false });
    });
    sim.traffic.forEach((t, i) => {
      if (!near(t.x, t.z)) return;
      const s = VEHICLES[t.kind];
      out.push({ ...base, id: `vehicule-${i}`, cls: classOf(t.kind), x: t.x, z: t.z, vx: Math.sin(t.heading) * t.speed, vz: Math.cos(t.heading) * t.speed, heading: t.heading, radius: halfWidth(t.kind), length: s.half + s.radius * 0.6, fixed: false });
    });
    sim.parked.forEach((p, i) => {
      if (p.kind === 'helico' || !near(p.x, p.z)) return;
      const s = VEHICLES[p.kind];
      out.push({ ...base, id: `gare-${i}`, cls: 'vehicule-gare', x: p.x, z: p.z, vx: 0, vz: 0, heading: p.heading, radius: halfWidth(p.kind), length: s.half + s.radius * 0.6, fixed: true });
    });
    sim.potholes.forEach((p, i) => {
      if (!near(p.x, p.z)) return;
      out.push({ ...base, id: `nid-${i}`, cls: 'nid-de-poule', x: p.x, z: p.z, vx: 0, vz: 0, heading: 0, radius: p.r, length: p.r, fixed: true });
    });
    if (!path) return out;
    const me = project(path, c.x, c.z);
    // Feux : un carrefour sur la trajectoire dont le feu n'est pas vert pour notre direction devient une ligne d'arrêt.
    sim.world.junctions.forEach((j, index) => {
      if (!near(j.x, j.z)) return;
      const p = project(path, j.x, j.z);
      if (Math.abs(p.d) > j.r || p.s - me.s < j.r) return;
      const stop = p.s - j.r - 1.5;
      const at = pointAt(path, stop);
      const state = sim.lightAt(index, Math.atan2(at.dx, at.dz));
      if (state === 'green') return;
      out.push({ ...base, id: `feu-${index}-${state}`, cls: 'feu-rouge', x: at.x, z: at.z, vx: 0, vz: 0, heading: 0, radius: 0, length: 0, fixed: true });
    });
    // Obstacles fixes (murs, poteaux, arbres) sur la trajectoire : le premier rencontré, au centre de la voie ou sur ses bords.
    // solidAt garde déjà 25 cm de marge autour des murs : on sonde aux flancs exacts du véhicule.
    const w = halfWidth(c.kind) - 0.25;
    for (let s = me.s + 2; s < me.s + Math.min(range, 45); s += 1.5) {
      const at = pointAt(path, s);
      const hit = [-w, 0, w].find((l) => sim.solidAt(at.x - at.dz * l, at.z + at.dx * l));
      if (hit === undefined) continue;
      out.push({ ...base, id: `obstacle-${Math.round(at.x)}-${Math.round(at.z)}`, cls: 'obstacle', x: at.x - at.dz * hit, z: at.z + at.dx * hit, vx: 0, vz: 0, heading: 0, radius: 0.15, length: 0.15, fixed: true });
      break;
    }
    return out;
  }
}

/** EnvironmentDetector : réunit les détections de tous les capteurs, et fusionne celles qui désignent le même objet. */
export class EnvironmentDetector {
  private sensors: Sensor[];
  constructor(sensors: Sensor[] = [new GameStateSensor()]) { this.sensors = sensors; }

  addSensor(s: Sensor) { this.sensors.push(s); }

  detect(ctx: PerceptionContext): Detection[] {
    const all = this.sensors.flatMap((s) => s.detect(ctx));
    if (this.sensors.length < 2) return all;
    // Même classe, à moins d'un mètre : on garde la détection la plus sûre.
    const kept: Detection[] = [];
    for (const d of all.sort((a, b) => b.confidence - a.confidence)) {
      if (!kept.some((k) => k.cls === d.cls && Math.hypot(k.x - d.x, k.z - d.z) < 1)) kept.push(d);
    }
    return kept;
  }
}
