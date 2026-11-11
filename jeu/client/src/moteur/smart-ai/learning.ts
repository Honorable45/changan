import type { GameSim } from '../sim.ts';

/**
 * Apprentissage par l'exemple : SMART AI s'améliore grâce à la conduite des joueurs.
 *
 * 1. Là où SMART AI reste bloquée, elle note un point critique (lieu, cap, cause).
 * 2. Quand un joueur conduit lui-même, ses dernières secondes de conduite sont gardées (positions, marche avant ou arrière).
 * 3. S'il traverse un point critique et s'en sort sans aucun choc, ce morceau de conduite devient une démonstration.
 * 4. Bloquée de nouveau près de ce point, SMART AI rejoue la démonstration au pas, sondes de sécurité actives ;
 *    chaque réussite ou échec est compté, et une démonstration qui échoue est abandonnée au profit des autres.
 * Les démonstrations et points critiques sont partagés par le serveur du jeu entre tous les joueurs.
 * Aucune donnée personnelle : seulement des positions dans la ville.
 */

import { validDemo, type Critical, type DemoPoint, type Demonstration, type Knowledge } from '../../../../partage/savoir.ts';
export { validDemo, type Critical, type DemoPoint, type Demonstration, type Knowledge };

const MAX_DEMOS = 80, MAX_CRITICAL = 150;
const lengthOf = (pts: DemoPoint[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
const newId = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Base de savoir : démonstrations et points critiques, connus localement et partagés par le serveur. */
export class KnowledgeBase {
  demos: Demonstration[] = [];
  critiques: Critical[] = [];
  /** Appelé quand le savoir change : le jeu le sauvegarde et l'envoie au serveur. */
  onDemo?: (d: Demonstration) => void;
  onCritical?: (c: Critical) => void;
  onResult?: (id: string, ok: boolean) => void;

  load(k: Partial<Knowledge> | null | undefined) {
    if (!k) return;
    for (const d of k.demos ?? []) if (validDemo(d.pts) && !this.demos.some((x) => x.id === d.id)) this.demos.push({ id: String(d.id), pts: d.pts, ok: Math.max(0, d.ok | 0), ko: Math.max(0, d.ko | 0), at: Number(d.at) || 0 });
    for (const c of k.critiques ?? []) if (Number.isFinite(c.x) && Number.isFinite(c.z) && !this.critiques.some((x) => Math.hypot(x.x - c.x, x.z - c.z) < 6)) this.critiques.push({ x: c.x, z: c.z, heading: Number(c.heading) || 0, cause: String(c.cause ?? ''), at: Number(c.at) || 0 });
    this.trim();
  }

  toJSON(): Knowledge { return { demos: this.demos, critiques: this.critiques }; }

  private trim() {
    // Les démonstrations qui échouent sans jamais réussir partent les premières.
    this.demos = this.demos.filter((d) => !(d.ko >= 2 && d.ok === 0)).sort((a, b) => b.ok - b.ko - (a.ok - a.ko) || b.at - a.at).slice(0, MAX_DEMOS);
    this.critiques = this.critiques.sort((a, b) => b.at - a.at).slice(0, MAX_CRITICAL);
  }

  /** Nouveau point critique (un seul par zone de 6 m). */
  addCritical(x: number, z: number, heading: number, cause: string) {
    if (this.critiques.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) return;
    const c = { x, z, heading, cause, at: Date.now() };
    this.critiques.push(c);
    this.trim();
    this.onCritical?.(c);
  }

  /** Nouvelle démonstration ; une démonstration qui suit presque le même chemin qu'une autre ne l'ajoute pas. */
  addDemo(pts: DemoPoint[]) {
    if (!validDemo(pts)) return null;
    const a = pts[0]!, b = pts[pts.length - 1]!;
    if (this.demos.some((d) => Math.hypot(d.pts[0]![0] - a[0], d.pts[0]![1] - a[1]) < 3 && Math.hypot(d.pts[d.pts.length - 1]![0] - b[0], d.pts[d.pts.length - 1]![1] - b[1]) < 3)) return null;
    const d: Demonstration = { id: newId(), pts, ok: 0, ko: 0, at: Date.now() };
    this.demos.push(d);
    this.trim();
    this.onDemo?.(d);
    return d;
  }

  /**
   * La meilleure démonstration utilisable d'ici : elle passe à moins de 6 m du véhicule, dans le même sens (à 50° près),
   * et continue au moins 15 m au-delà. Renvoie aussi l'indice du point d'où la reprendre.
   */
  find(x: number, z: number, heading: number): { demo: Demonstration; from: number } | null {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best: { demo: Demonstration; from: number; score: number } | null = null;
    for (const d of this.demos) {
      if (d.ko >= 2 && d.ok === 0) continue;
      let from = -1, bestD = 6;
      for (let i = 0; i < d.pts.length - 1; i++) {
        const p = d.pts[i]!, q = d.pts[i + 1]!;
        const dist = Math.hypot(p[0] - x, p[1] - z);
        if (dist >= bestD) continue;
        // Sens de marche de la démonstration à cet endroit (en marche arrière, le véhicule regarde à l'opposé).
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const dirX = ((q[0] - p[0]) / l) * p[2], dirZ = ((q[1] - p[1]) / l) * p[2];
        if (dirX * fx + dirZ * fz < Math.cos((50 * Math.PI) / 180)) continue;
        bestD = dist; from = i;
      }
      if (from < 0 || lengthOf(d.pts.slice(from)) < 15) continue;
      const score = d.ok - 2 * d.ko - bestD * 0.2;
      if (!best || score > best.score) best = { demo: d, from, score };
    }
    return best ? { demo: best.demo, from: best.from } : null;
  }

  /** Résultat d'une démonstration rejouée par SMART AI : c'est ainsi que le savoir s'améliore. */
  result(id: string, ok: boolean) {
    const d = this.demos.find((x) => x.id === id);
    if (!d) return;
    if (ok) d.ok++; else d.ko++;
    this.trim();
    this.onResult?.(id, ok);
  }
}

/**
 * Enregistreur de la conduite du joueur (SMART AI coupée) : un point tous les 50 cm, sur la dernière minute.
 * Quand le joueur a franchi un point critique et s'en est éloigné de 25 m sans choc, le morceau qui l'entoure
 * (de 20 m avant le point à maintenant) devient une démonstration.
 */
export class DrivingRecorder {
  private trail: { x: number; z: number; dir: 1 | -1; t: number }[] = [];
  private hits: number[] = [];
  private clock = 0;
  /** Points critiques en cours de franchissement : moment et indice du passage au plus près. */
  private passing = new Map<Critical, number>();

  /** Un choc pendant la conduite du joueur : le morceau qui le contient ne sera jamais appris. */
  noteHit() { this.hits.push(this.clock); }

  reset() { this.trail = []; this.passing.clear(); }

  sample(sim: GameSim, dt: number, kb: KnowledgeBase): DemoPoint[] | null {
    this.clock += dt;
    const c = sim.car;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(c.x - last.x, c.z - last.z) >= 0.5) this.trail.push({ x: c.x, z: c.z, dir: c.speed < -0.1 ? -1 : 1, t: this.clock });
    while (this.trail.length && this.clock - this.trail[0]!.t > 60) this.trail.shift();
    this.hits = this.hits.filter((t) => this.clock - t < 70);
    for (const k of kb.critiques) {
      const d = Math.hypot(k.x - c.x, k.z - c.z);
      if (d < 6 && !this.passing.has(k)) this.passing.set(k, this.clock);
      const since = this.passing.get(k);
      if (since === undefined) continue;
      // Joueur reparti du point critique de plus de 25 m : on extrait ce qu'il a fait.
      if (d > 25) {
        this.passing.delete(k);
        const near = this.trail.reduce((best, p, i) => (Math.hypot(p.x - k.x, p.z - k.z) < Math.hypot(this.trail[best]!.x - k.x, this.trail[best]!.z - k.z) ? i : best), 0);
        let start = near, run = 0;
        while (start > 0 && run < 20) { run += Math.hypot(this.trail[start]!.x - this.trail[start - 1]!.x, this.trail[start]!.z - this.trail[start - 1]!.z); start--; }
        const piece = this.trail.slice(start);
        const t0 = piece[0]?.t ?? this.clock;
        if (this.hits.some((t) => t >= t0 - 1)) continue;
        const pts: DemoPoint[] = piece.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, p.dir]);
        if (validDemo(pts)) return pts;
      }
      if (this.clock - since > 120) this.passing.delete(k);
    }
    return null;
  }
}
