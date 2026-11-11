import { pointAt, project } from './route.ts';
import type { DangerLevel, Detection, Path, Threat } from './types.ts';

export type Ego = { x: number; z: number; speed: number; halfWidth: number; front: number; offset: number };

/**
 * RiskAnalyzer : chaque objet perçu est ramené à la trajectoire prévue.
 * - distance libre devant le véhicule (gap) ;
 * - écart latéral au couloir, maintenant et prédit quand le véhicule arrivera à sa hauteur (un piéton qui traverse, une moto qui coupe) ;
 * - temps avant collision et décélération nécessaire pour l'éviter.
 * Le niveau de danger en découle ; l'incertitude penche toujours vers le niveau le plus prudent.
 */
export class RiskAnalyzer {
  analyze(dets: Detection[], path: Path, ego: Ego, range: number): Threat[] {
    const me = project(path, ego.x, ego.z);
    const v = Math.max(0, ego.speed);
    const out: Threat[] = [];
    for (const det of dets) {
      // Les véhicules sont des segments : on retient leur extrémité la plus proche du couloir et la plus proche de nous.
      const hx = Math.sin(det.heading) * det.length, hz = Math.cos(det.heading) * det.length;
      const ends = det.length > 0.6 ? [project(path, det.x + hx, det.z + hz), project(path, det.x - hx, det.z - hz)] : [project(path, det.x, det.z)];
      const centre = project(path, det.x, det.z);
      let sNear = Math.min(...ends.map((e) => e.s)) - me.s, sFar = Math.max(...ends.map((e) => e.s)) - me.s;
      // Dans un virage, les deux bouts peuvent tomber sur des parties éloignées de la trajectoire : on se fie alors au centre.
      if (sFar - sNear > det.length * 2 + 3) { sNear = centre.s - me.s - det.length; sFar = centre.s - me.s + det.length; }
      if (sFar < -1 || sNear > range) continue;
      const s = centre.s - me.s;
      // Écart à notre couloir : le véhicule peut rouler décalé de sa voie (contournement en cours).
      const lat = ends.map((e) => e.d - ego.offset);
      const d = lat.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
      const across = lat.length === 2 && Math.sign(lat[0]!) !== Math.sign(lat[1]!) ? 0 : d;
      const tan = pointAt(path, Math.max(0, centre.s));
      const along = det.vx * tan.dx + det.vz * tan.dz;
      const vlat = det.vx * -tan.dz + det.vz * tan.dx;
      const corridor = ego.halfWidth + det.radius + (det.cls === 'pieton' ? 0.6 : 0.35);
      const gap = sNear - ego.front;
      const tReach = gap > 0 ? gap / Math.max(v - Math.max(along, 0), 0.5) : 0;
      const dPred = across + vlat * Math.min(tReach, 4);
      // Un piéton sur le trottoir (au-delà de la bordure de chaussée) n'est pas sur la trajectoire, sauf s'il se dirige vers la chaussée.
      const laneLat = d + ego.offset;
      const onWalk = det.cls === 'pieton' && (laneLat > tan.right + 0.2 || laneLat < tan.left - 0.2);
      const towardRoad = laneLat * vlat < -0.2;
      const inCorridor = det.cls === 'feu-rouge' || (Math.abs(across) < corridor && !(onWalk && !towardRoad));
      const crossing = !inCorridor && Math.abs(vlat) > 0.25 && (!onWalk || towardRoad) && (Math.abs(dPred) < corridor || Math.sign(dPred) !== Math.sign(across));
      const closing = v - along;
      const ttc = closing > 0.1 && gap > 0 ? gap / closing : gap <= 0 && inCorridor ? 0 : Infinity;
      const decel = gap <= 0.2 ? (closing > 0 ? 99 : 0) : closing > 0 ? (v * v - Math.max(along, 0) ** 2) / (2 * gap) : 0;
      out.push({ det, gap, s, d: across, dPred, corridor, along, closing, ttc, decel, inCorridor, crossing, level: this.level(det, gap, decel, ttc, inCorridor, crossing, Math.abs(across) - corridor, across * vlat < -0.1) });
    }
    return out.sort((a, b) => b.level - a.level || a.gap - b.gap);
  }

  private level(det: Detection, gap: number, decel: number, ttc: number, inCorridor: boolean, crossing: boolean, margin: number, approaching: boolean): DangerLevel {
    if (det.cls === 'feu-rouge') return decel > 4 ? 4 : decel > 1 || gap < 25 ? 3 : 2;
    if (det.cls === 'nid-de-poule') return inCorridor && gap < 30 ? 2 : 1;
    if (inCorridor || crossing) {
      if (gap < 3 || decel > 6 || ttc < 1.2) return 4;
      if (decel > 2.5 || ttc < 3 || gap < 8) return 3;
      if (gap < 45) return 2;
      return 1;
    }
    // À côté du couloir : un piéton ou une moto qui s'en approchent appellent la vigilance ; immobiles ou parallèles, seulement tout près.
    const watch = (det.cls === 'pieton' || det.cls === 'moto') && approaching ? 2.5 : 0.5;
    return margin < watch && gap < 30 && gap > -2 ? 2 : 1;
  }
}
