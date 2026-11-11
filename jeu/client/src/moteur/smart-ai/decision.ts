import { pointAt, project } from './route.ts';
import type { Action, Decision, Detection, Path, Threat } from './types.ts';
import type { Ego } from './risk.ts';

/** Ce que la décision peut interroger dans le monde : obstacles fixes et terrain praticable. */
export type World3 = { solidAt: (x: number, z: number) => boolean; drivable: (x: number, z: number) => boolean };

/** Un passage envisagé pour contourner un obstacle, avec la raison de son rejet ou sa note. */
export type Option = { offset: number; side: 'gauche' | 'droite'; offroad: boolean; margin: number; score: number; ok: boolean; why: string };

const COMFORT = 4.5;
/** Vitesse pour s'arrêter en douceur à « room » mètres : v = √(2·a·d). */
const stopSpeed = (room: number) => Math.sqrt(2 * COMFORT * Math.max(0, room));
/** Consigne d'arrêt avant un point situé à « room » mètres de l'avant du véhicule. */
const stop = (room: number) => ({ targetSpeed: stopSpeed(room), stopIn: Math.max(0, room) });
/** Allure de contournement : au pas tant que l'écart n'est pas pris près de l'obstacle, puis la vitesse plafond du passage. */
const bypassSpeed = (gap: number, remaining: number, cap: number) => Math.min(cap, remaining > 0.4 && gap < 3 * remaining + 4 ? 1.5 : 25 / 3.6);
const RANK: Record<Action, number> = { CONTINUER: 0, CONTOURNER: 1, RALENTIR: 2, FREINER: 3, ARRET: 4 };

/**
 * DecisionEngine : à partir des dangers, choisit l'action et la consigne (vitesse, décalage latéral).
 * - CONTINUER : rien ne gêne ; vitesse de croisière, réduite dans les virages ; arrêt à la destination.
 * - RALENTIR : vigilance (piéton au bord de la chaussée, véhicule devant, nid-de-poule).
 * - FREINER / ARRET : collision possible, obstacle bloquant ou danger immédiat ; arrêt avant le point dangereux.
 * - CONTOURNER : un obstacle immobile, ou un piéton arrêté, seulement par un passage vérifié.
 *   Plusieurs passages sont comparés (gauche, droite, sur la chaussée ou sur un bas-côté praticable) :
 *   marge aux obstacles, ampleur de l'écart, nature du terrain, véhicules venant en face. Le plus sûr l'emporte.
 * En cas de doute, ralentir ou s'arrêter. La reprise après un arrêt attend que la voie reste libre un instant.
 */
export class DecisionEngine {
  cruise = 50 / 3.6;
  private hold = 0;
  private last: Decision | null = null;
  /** Contournement en cours : l'objet dépassé, le décalage choisi, et s'il passe par le bas-côté. */
  private bypass: { id: string; offset: number; offroad: boolean } | null = null;
  /** Passages comparés lors du dernier choix, pour le tableau de bord. */
  lastOptions: Option[] = [];
  /** Nombre de contournements engagés depuis l'activation. */
  bypassCount = 0;
  /** Le véhicule a dépassé l'obstacle et attend que sa voie soit libre pour y revenir. */
  returning = false;

  private clock = 0;
  private cache: { id: string; at: number; list: Option[] } | null = null;

  reset() { this.cache = null; this.hold = 0; this.last = null; this.bypass = null; this.lastOptions = []; this.returning = false; }
  get bypassing() { return this.bypass; }

  decide(threats: Threat[], dets: Detection[], path: Path | null, ego: Ego, world: World3, dt: number): Decision {
    this.clock += dt;
    if (!path) return this.commit({ action: 'ARRET', targetSpeed: 0, offset: 0, threat: null, reason: 'Voie introuvable : arrêt par prudence.' }, dt);
    const me = project(path, ego.x, ego.z);
    let best: Decision = { action: 'CONTINUER', targetSpeed: Math.min(this.cruise, this.curveSpeed(path, me.s, ego.speed)), offset: 0, threat: null, reason: 'Route dégagée : circulation normale.' };
    const consider = (d: Decision) => {
      // La consigne la plus prudente l'emporte : vitesse la plus basse, puis l'action la plus forte.
      if (d.targetSpeed < best.targetSpeed - 0.05 || (Math.abs(d.targetSpeed - best.targetSpeed) <= 0.05 && RANK[d.action] > RANK[best.action])) best = { ...d, offset: best.offset };
      // Le point d'arrêt le plus proche reste connu, même si une autre consigne est plus basse.
      if (d.stopIn !== undefined && (best.stopIn === undefined || d.stopIn < best.stopIn)) best.stopIn = d.stopIn;
    };
    let offset = 0;

    // Destination de l'itinéraire : arrêt à sa hauteur.
    if (path.goalS !== undefined) {
      const left = path.goalS - me.s;
      if (left < 80) consider({ action: left < 6 ? 'ARRET' : 'FREINER', ...stop(left - 0.5), offset: 0, threat: null, reason: left < 3 ? 'Destination atteinte : arrêt.' : 'Destination en vue : arrêt à sa hauteur.' });
    }
    // Impasse sans itinéraire : arrêt avant le bout de la rue (le système anti-blocage fera demi-tour).
    if (path.deadEnd) {
      const left = path.cum[path.cum.length - 1]! - me.s - ego.front;
      if (left < 120) consider({ action: left < 12 ? 'ARRET' : 'FREINER', ...stop(left - 4), offset: 0, threat: null, reason: 'Fin de la rue : arrêt avant le demi-tour.' });
    }

    // Contournement déjà engagé : on garde l'écart tant que l'objet n'est pas dépassé et que le passage reste libre ;
    // une fois dépassé, on ne regagne la voie que si elle est libre.
    this.returning = false;
    if (this.bypass) {
      const b = this.bypass;
      const t = threats.find((x) => x.det.id === b.id);
      const passed = !t || t.s < -(t.det.length + ego.front + 2);
      if (passed) {
        const back = this.check(path, me.s, 18, 0, ego, dets, world, b.id, false);
        if (back.ok) this.bypass = null;
        else { offset = b.offset; this.returning = true; consider({ action: 'CONTOURNER', targetSpeed: 12 / 3.6, offset, threat: null, reason: `Obstacle dépassé : retour dans la voie dès qu’elle sera libre (${back.why}).` }); }
      } else if (this.check(path, me.s, Math.max(0, t.gap) + t.det.length * 2 + ego.front + 6, b.offset, ego, dets, world, t.det.cls === 'pieton' ? '' : t.det.id, b.offroad).ok) {
        offset = b.offset;
        const cap = t.det.cls === 'pieton' ? 12 / 3.6 : b.offroad ? 15 / 3.6 : 25 / 3.6;
        consider({ action: 'CONTOURNER', targetSpeed: bypassSpeed(t.gap, Math.abs(offset - ego.offset), cap), offset, threat: t, reason: 'Contournement en cours : passage vérifié.' });
      } else {
        this.bypass = null;
        consider({ action: 'ARRET', ...stop(t.gap - 2), offset: 0, threat: t, reason: 'Le passage de contournement se ferme : arrêt.' });
      }
    }

    for (const t of threats) {
      if (t.level < 2) continue;
      const c = t.det.cls;
      const conflict = t.inCorridor || t.crossing;
      // L'objet contourné n'est plus réexaminé… sauf un piéton : il peut se remettre à marcher.
      if (this.bypass?.id === t.det.id && offset && c !== 'pieton') continue;
      if (c === 'feu-rouge') {
        consider({ action: t.gap < 12 ? 'ARRET' : 'FREINER', ...stop(t.gap - 0.3), offset: 0, threat: t, reason: `Feu ${t.det.id.endsWith('amber') ? 'orange' : 'rouge'} : arrêt à la ligne.` });
        continue;
      }
      if (!conflict) {
        consider({ action: 'RALENTIR', targetSpeed: Math.max(6, this.cruise * 0.6), offset: 0, threat: t, reason: c === 'pieton' ? 'Piéton qui s’approche de la chaussée : vigilance.' : `${c === 'moto' ? 'Moto' : 'Objet'} au bord de la voie : vigilance.` });
        continue;
      }
      if (c === 'nid-de-poule') {
        const o = t.gap < 30 ? this.choose(t, path, me.s, ego, dets, world, 1.6, false) : null;
        if (o) { offset = this.engage(t, o); consider({ action: 'CONTOURNER', targetSpeed: 30 / 3.6, offset, threat: t, reason: `Nid-de-poule évité par la ${o.side} : passage vérifié.` }); }
        else consider({ action: 'RALENTIR', targetSpeed: t.gap < 25 ? 15 / 3.6 : 30 / 3.6, offset: 0, threat: t, reason: 'Nid-de-poule sur la voie, pas de passage libre : passage au ralenti.' });
        continue;
      }
      if (c === 'pieton') {
        // Un piéton qui traverse ou qui marche : on s'arrête et on attend. Arrêté, il peut se contourner, largement et au pas.
        const still = Math.hypot(t.det.vx, t.det.vz) < 0.4 && !t.crossing;
        const o = still && t.gap < 30 ? this.choose(t, path, me.s, ego, dets, world, 4, true) : null;
        if (o) {
          offset = this.engage(t, o);
          consider({ action: 'CONTOURNER', targetSpeed: bypassSpeed(t.gap, Math.abs(o.offset - ego.offset), 12 / 3.6), offset, threat: t, reason: `Piéton arrêté sur la voie : contourné largement par la ${o.side}${o.offroad ? ', sur le bas-côté' : ''}, au pas.` });
          continue;
        }
        const room = t.gap - 4;
        consider({ action: t.gap < 15 || stopSpeed(room) < 2 ? 'ARRET' : 'FREINER', ...stop(room), offset: 0, threat: t, reason: t.crossing ? 'Piéton qui traverse devant : arrêt avant son passage.' : still ? 'Piéton sur la voie, aucun passage sûr : arrêt et attente.' : 'Piéton sur la trajectoire : arrêt avant lui.' });
        continue;
      }
      if (t.det.fixed) {
        // Obstacle immobile (véhicule garé ou en panne, mur, poteau) : le passage le plus sûr, sinon l'arrêt.
        const o = t.gap < 45 ? this.choose(t, path, me.s, ego, dets, world, 6, true) : null;
        const what = c === 'vehicule-gare' ? 'Véhicule garé' : c === 'obstacle' ? 'Obstacle' : 'Véhicule immobilisé';
        if (o) {
          offset = this.engage(t, o);
          consider({ action: 'CONTOURNER', targetSpeed: bypassSpeed(t.gap, Math.abs(o.offset - ego.offset), o.offroad ? 15 / 3.6 : 25 / 3.6), offset, threat: t, reason: `${what} contourné par la ${o.side}${o.offroad ? ', sur le bas-côté praticable' : ''} : passage vérifié (marge ${o.margin.toFixed(1)} m).` });
        } else {
          // Arrêt à 7 m : assez de place pour braquer et contourner quand un passage se libérera.
          consider({ action: t.gap < 12 ? 'ARRET' : 'FREINER', ...stop(t.gap - 7), offset: 0, threat: t, reason: `${what} sur la voie, aucun passage sûr : arrêt.` });
        }
        continue;
      }
      // Véhicule en mouvement : jamais contourné.
      if (t.along < -1) consider({ action: 'ARRET', ...stop(t.gap - 6), offset: 0, threat: t, reason: 'Véhicule en face sur la trajectoire : arrêt.' });
      else if (t.crossing) consider({ action: 'FREINER', ...stop(t.gap - 3), offset: 0, threat: t, reason: `${c === 'moto' ? 'Moto' : 'Véhicule'} qui coupe la trajectoire : freinage.` });
      else if (t.along > 0.8) {
        // Véhicule devant dans le même sens : distance de sécurité de 2 secondes, 6 m au moins.
        const want = 6 + t.along * 2;
        const v = Math.max(0, Math.min(t.along + (t.gap - want) * 0.5, stopSpeed(t.gap - 4)));
        consider({ action: v < ego.speed - 0.5 ? (t.level >= 3 ? 'FREINER' : 'RALENTIR') : 'CONTINUER', targetSpeed: v, offset: 0, threat: t, reason: `${c === 'moto' ? 'Moto' : c === 'camion' ? 'Camion' : 'Véhicule'} devant à ${Math.round(t.gap)} m : distance de sécurité.` });
      } else consider({ action: t.gap < 12 ? 'ARRET' : 'FREINER', ...stop(t.gap - 4), offset: 0, threat: t, reason: `${c === 'moto' ? 'Moto' : 'Véhicule'} arrêté sur la voie : arrêt derrière lui.` });
    }
    best.offset = offset;
    if (offset && best.action === 'CONTINUER') best = { ...best, action: 'CONTOURNER', targetSpeed: Math.min(best.targetSpeed, (this.bypass?.offroad ? 15 : 25) / 3.6), reason: this.returning ? best.reason : 'Contournement en cours : passage vérifié.' };
    return this.commit(best, dt);
  }

  /** Engage (ou poursuit) le contournement par le passage « o » ; renvoie le décalage à appliquer. */
  private engage(t: Threat, o: Option) {
    if (this.bypass?.id !== t.det.id) this.bypassCount++;
    this.bypass = { id: t.det.id, offset: o.offset, offroad: o.offroad };
    return o.offset;
  }

  /** Reprise prudente : après un arrêt ou un freinage, la voie doit rester libre 0,8 s avant de repartir. */
  private commit(d: Decision, dt: number): Decision {
    const prev = this.last;
    if (prev && (prev.action === 'ARRET' || prev.action === 'FREINER') && d.targetSpeed > prev.targetSpeed + 0.5 && RANK[d.action] < RANK[prev.action]) {
      this.hold += dt;
      if (this.hold < 0.8) return { ...prev, reason: `${prev.reason.replace(/ Reprise imminente\.$/, '')} Reprise imminente.` };
    }
    this.hold = 0;
    this.last = d;
    return d;
  }

  /** Vitesse tenable dans les virages à venir : accélération latérale limitée à 3 m/s². */
  private curveSpeed(path: Path, s0: number, v: number) {
    let limit = Infinity;
    const reach = Math.max(25, v * 4);
    for (let s = s0 + 4; s < s0 + reach; s += 4) {
      const a = pointAt(path, s - 3), b = pointAt(path, s + 3);
      const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
      if (turn < 0.02) continue;
      const k = turn / 6;
      // On ralentit d'autant plus tôt que le virage est loin : la vitesse permise remonte avec la distance.
      limit = Math.min(limit, Math.sqrt(3 / k) + (s - s0) * 0.25);
    }
    return Math.max(5, limit);
  }

  /**
   * Passages possibles autour de l'objet « t » : de chaque côté, au plus près de l'objet puis plus largement,
   * sur la chaussée ou (si « offroad ») sur un bas-côté praticable. Chacun est vérifié sur toute la manœuvre, puis noté.
   */
  options(t: Threat, path: Path, s0: number, ego: Ego, dets: Detection[], world: World3, max: number, offroad: boolean, ignoreRoom = false): Option[] {
    const need = t.corridor + (t.det.cls === 'pieton' ? 1.2 : 0.3);
    const obj = t.d + ego.offset;
    const length = Math.max(0, t.gap) + t.det.length * 2 + ego.front + 8;
    const out: Option[] = [];
    // Positions latérales essayées : juste à côté de l'objet de chaque côté, puis plus largement, puis tout l'espace
    // de −6 à +6 m par pas de 50 cm (une barrière longue n'a pas de « côté » proche).
    const tries: [string, number, number][] = [];
    for (const [side, dir] of [['gauche', -1], ['droite', 1]] as const) for (const more of [0, 0.8]) tries.push([side, dir, obj + dir * (need + more)]);
    if (t.det.cls === 'obstacle') for (let off = -6; off <= 6; off += 0.5) if (Math.abs(off - obj) >= need) tries.push([off < obj ? 'gauche' : 'droite', off < obj ? -1 : 1, off]);
    for (const [sideName, dir, off] of tries) {
      const side = sideName as 'gauche' | 'droite';
      {
        if (Math.abs(off) > max) { out.push({ offset: off, side, offroad: false, margin: 0, score: -Infinity, ok: false, why: 'trop loin de la voie' }); continue; }
        const shift = Math.abs(off - ego.offset);
        // Il faut la place de braquer : environ 1,8 m d'avance par mètre d'écart ; un mur qui frôle le flanc demande un simple décalage.
        const scrape = t.det.cls === 'obstacle' && Math.abs(t.d) > ego.halfWidth * 0.5 && shift < 1.2;
        if (!ignoreRoom && !scrape && t.gap < 1.8 * shift + 1) { out.push({ offset: off, side, offroad: false, margin: 0, score: -Infinity, ok: false, why: 'trop près pour braquer' }); continue; }
        // Un piéton reste dans la vérification, avec sa propre marge d'un mètre : il peut repartir à tout moment.
        const r = this.check(path, s0, length, off, ego, dets, world, t.det.cls === 'pieton' ? '' : t.det.id, offroad);
        // Note : la marge compte le plus, puis un petit écart ; le bas-côté est pénalisé, la droite un peu (on dépasse par la gauche).
        const score = r.ok ? 3 * Math.min(r.margin, 2) - 0.4 * shift - (r.offroad ? 2.5 : 0) - (dir < 0 ? 0 : 0.3) : -Infinity;
        out.push({ offset: off, side, offroad: r.offroad, margin: r.margin, score, ok: r.ok, why: r.why });
      }
    }
    return out;
  }

  /** Le passage le plus sûr parmi les praticables, ou null. */
  private choose(t: Threat, path: Path, s0: number, ego: Ego, dets: Detection[], world: World3, max: number, offroad: boolean): Option | null {
    // Le calcul des passages est réutilisé 0,25 s pour le même objet : il coûte quelques milliers de sondes.
    const cached = this.cache && this.cache.id === t.det.id && this.clock - this.cache.at < 0.25 ? this.cache.list : null;
    const list = cached ?? this.options(t, path, s0, ego, dets, world, max, offroad);
    if (!cached) this.cache = { id: t.det.id, at: this.clock, list };
    this.lastOptions = list;
    return list.filter((o) => o.ok).sort((a, b) => b.score - a.score)[0] ?? null;
  }

  /**
   * Distance libre qu'il faudrait devant l'objet pour le contourner, si un passage existe quelle que soit la place ;
   * null sinon. Sert au système anti-blocage pour décider d'un recul.
   */
  roomToBypass(t: Threat, path: Path, ego: Ego, dets: Detection[], world: World3): number | null {
    const s0 = project(path, ego.x, ego.z).s;
    const best = this.options(t, path, s0, ego, dets, world, 6, true, true).filter((o) => o.ok).sort((a, b) => b.score - a.score)[0];
    return best ? 1.8 * Math.abs(best.offset - ego.offset) + 1.5 : null;
  }

  /**
   * Le couloir décalé de « off » est-il libre sur « length » mètres ? Chaussée (ou terrain praticable hors chaussée si permis),
   * murs et obstacles fixes, objets perçus et leur mouvement pendant toute la manœuvre, véhicules venant en face.
   * Renvoie aussi la plus petite marge latérale aux objets, et la raison d'un refus.
   */
  check(path: Path, s0: number, length: number, off: number, ego: Ego, dets: Detection[], world: World3, skip: string, offroad: boolean) {
    const w = ego.halfWidth + 0.3;
    let usesShoulder = false;
    // Sondes tous les 50 cm le long du passage : un mur d'un mètre d'épaisseur ne passe pas entre deux.
    for (let s = s0; s <= s0 + length; s += 0.5) {
      const at = pointAt(path, s);
      // La voie elle-même est toujours la référence : dans les rues étroites, la carte la fait déborder de la chaussée.
      if (Math.abs(off) > 0.3 && (off - w < at.left || off + w > at.right)) {
        if (!offroad) return { ok: false, margin: 0, offroad: false, why: 'bordure de chaussée' };
        // Hors chaussée : au plus 3,5 m au-delà de la bordure, et chaque point du passage doit être praticable.
        if (off - w < at.left - 3.5 || off + w > at.right + 3.5) return { ok: false, margin: 0, offroad: true, why: 'trop loin de la chaussée' };
        for (const l of [off - w, off - w / 2, off, off + w / 2, off + w]) if (!world.drivable(at.x - at.dz * l, at.z + at.dx * l)) return { ok: false, margin: 0, offroad: true, why: 'terrain impraticable' };
        usesShoulder = true;
      }
      // Sondes tous les 40 cm sur la largeur du véhicule : un mur ou une clôture minces ne passent pas entre deux.
      for (let l = off - w; l <= off + w + 1e-6; l += (2 * w) / Math.ceil((2 * w) / 0.4)) if (world.solidAt(at.x - at.dz * l, at.z + at.dx * l)) return { ok: false, margin: 0, offroad: usesShoulder, why: 'mur ou obstacle fixe' };
    }
    // Durée de la manœuvre à l'allure de contournement, retour dans la voie compris (le décalage se fait à 1,6 m/s).
    const v = Math.max(3, Math.min(ego.speed, 25 / 3.6));
    const duration = length / v + Math.abs(off) / 1.6 + 1;
    let margin = 3;
    for (const d of dets) {
      if (d.id === skip || d.cls === 'feu-rouge') continue;
      const p = project(path, d.x, d.z);
      const s = p.s - s0;
      if (s < -12 || s > length + 120) continue;
      const tan = pointAt(path, Math.max(0, p.s));
      const along = d.vx * tan.dx + d.vz * tan.dz, vlat = d.vx * -tan.dz + d.vz * tan.dx;
      // Véhicule qui arrive en face dans le couloir visé : il doit rester au-delà de la manœuvre, avec 3 secondes de marge.
      if (along < -0.5 && Math.abs(p.d - off) < w + d.radius + 1.5 && s + along * (duration + 3) < length + 10) return { ok: false, margin: 0, offroad: usesShoulder, why: 'véhicule en face' };
      const safety = d.cls === 'pieton' ? 1.0 : 0.4;
      // Position de l'objet pendant toute la manœuvre : elle ne doit jamais croiser le couloir décalé.
      for (let k = 0; k <= 4; k++) {
        const time = (duration * k) / 4;
        const sObj = s + along * time, latObj = p.d + vlat * time;
        const sMe = Math.min(length, v * time);
        const gapLat = Math.abs(latObj - off) - (w + d.radius);
        const near = Math.abs(sObj - sMe) < d.length + ego.front + 6 || (sObj > sMe - 3 && sObj < length + 3);
        if (near) margin = Math.min(margin, gapLat);
        if (near && gapLat < safety) return { ok: false, margin: gapLat, offroad: usesShoulder, why: d.cls === 'pieton' ? 'piéton sur le passage' : 'véhicule ou objet sur le passage' };
      }
    }
    return { ok: true, margin, offroad: usesShoulder, why: 'libre' };
  }
}
