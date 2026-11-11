import { VEHICLES, halfWidth, type GameSim, type Input, type Pt } from '../sim.ts';
import { AntiBlockage, type BlockCause, type Strategy } from './antiblock.ts';
import { DecisionEngine } from './decision.ts';
import { EnvironmentDetector, type Sensor } from './detector.ts';
import { Itinerary, type Route } from './itinerary.ts';
import type { KnowledgeBase } from './learning.ts';
import { Maneuver, clearance } from './maneuver.ts';
import { RiskAnalyzer, type Ego } from './risk.ts';
import { LanePlanner, pointAt, project } from './route.ts';
import { ACTION_LABEL, CLASS_HEIGHT, CLASS_LABEL, DANGER_LABEL, MANEUVER_LABEL, type Box, type DangerLevel, type Decision, type Detection, type Path, type Telemetry, type Threat, type Visual } from './types.ts';
import { VehicleController } from './vehicle.ts';

/**
 * SmartAIController : active ou coupe la conduite autonome, et fait tourner la chaîne à chaque image :
 * itinéraire (Itinerary) → trajectoire (LanePlanner) → perception (EnvironmentDetector) → risque (RiskAnalyzer)
 * → décision (DecisionEngine) → commandes (VehicleController), sous la surveillance du système anti-blocage (AntiBlockage),
 * qui lance les manœuvres de dégagement (Maneuver).
 * Il ne touche ni à la physique ni aux collisions : il fournit les mêmes commandes que le joueur. Aucune téléportation.
 */
export class SmartAIController {
  active = false;
  readonly detector: EnvironmentDetector;
  private planner: LanePlanner;
  private itinerary: Itinerary;
  private risk = new RiskAnalyzer();
  private decision = new DecisionEngine();
  private vehicle = new VehicleController();
  readonly antiBlock = new AntiBlockage();
  private path: Path | null = null;
  private replan = 0;
  private lastLevel: DangerLevel = 0;
  private alertCooldown = 0;
  private maneuver: Maneuver | null = null;
  private reason = '';
  private escapeAt: Pt = [0, 0];
  /** Depuis combien de temps chaque objet perçu est immobile : un véhicule arrêté depuis 20 s devient un obstacle (panne, embouteillage). */
  private still = new Map<string, number>();
  /** Destination et itinéraire : fixés une fois, recalculés seulement en cas d'écart ou de rue bloquée. */
  private destination: Pt | null = null;
  private route: Route | null = null;
  private navState = 'Conduite libre';
  private turnSearch = 0;
  private telemetry: Telemetry = SmartAIController.idle();
  /** Ce que le jeu dessine : trajectoire visée et zones de danger. */
  visual: Visual = { line: [], dangers: [], boxes: [] };
  lastDecision: Decision | null = null;
  lastThreats: Threat[] = [];
  /** Nombre de calculs d'itinéraire (le premier, puis chaque écart ou rue bloquée). */
  routeCount = 0;
  onAlert?: (level: DangerLevel) => void;
  /** Savoir appris de la conduite des joueurs ; sans lui, SMART AI ne compte que sur ses propres manœuvres. */
  knowledge: KnowledgeBase | null = null;
  private learnedId: string | null = null;
  /** Solution apprise rejouée, en attente de son verdict : réussie si le véhicule s'éloigne de 20 m, ratée s'il rebloque ici. */
  private verdict: { id: string; x: number; z: number } | null = null;

  constructor(sim: GameSim, sensors?: Sensor[]) {
    this.planner = new LanePlanner(sim.world);
    this.itinerary = new Itinerary(sim.world);
    this.detector = new EnvironmentDetector(sensors);
  }

  static idle(): Telemetry {
    return { actif: false, vitesse: 0, objet: 'AUCUN', distance: null, danger: 'AUCUN', niveau: 0, decision: '—', action: 'Conduite manuelle', message: 'SMART AI désactivée : vous conduisez.', couleur: 'vert', percus: 0, trajectoire: '—', navigation: '—', contournements: 0, antiBlocage: '—', passages: '', savoir: '' };
  }

  available(sim: GameSim) { return sim.mode === 'car' && sim.car.kind !== 'helico'; }

  setActive(on: boolean, sim: GameSim) {
    if (on && !this.available(sim)) return false;
    this.active = on;
    this.path = null;
    this.replan = 0;
    this.lastLevel = 0;
    this.decision.reset();
    this.decision.bypassCount = 0;
    this.vehicle.reset();
    this.antiBlock.reset();
    this.maneuver = null;
    this.route = null;
    this.still.clear();
    this.visual = { line: [], dangers: [], boxes: [] };
    if (on && !sim.engineOn) sim.startEngine();
    if (!on) { sim.indicator = 0; this.telemetry = SmartAIController.idle(); }
    return this.active;
  }

  /** Destination de l'itinéraire (null : conduite libre). Elle reste fixée jusqu'à ce qu'on la change. */
  setDestination(p: Pt | null) {
    const same = p && this.destination && Math.hypot(p[0] - this.destination[0], p[1] - this.destination[1]) < 5;
    if (same || (!p && !this.destination)) return;
    this.destination = p;
    this.route = null;
    this.path = null;
    this.replan = 0;
    this.navState = p ? 'Calcul de l’itinéraire' : 'Conduite libre';
  }
  get currentRoute() { return this.route; }

  get status(): Telemetry { return this.telemetry; }

  update(sim: GameSim, dt: number, goal: Pt | null = null): Input | null {
    if (!this.active) return null;
    if (!this.available(sim)) { this.setActive(false, sim); return null; }
    if (goal) this.setDestination(goal);
    this.planner.tick(dt);
    if (this.maneuver) return this.runManeuver(sim, dt);
    const c = sim.car;
    this.pos = [c.x, c.z];
    const v = Math.max(0, c.speed);
    const spec = VEHICLES[c.kind];
    const ego: Ego = { x: c.x, z: c.z, speed: c.speed, halfWidth: halfWidth(c.kind), front: spec.half + spec.radius * 0.6, offset: this.vehicle.offset };

    // Itinéraire : calculé une fois ; s'il commence derrière le véhicule, demi-tour dès qu'un endroit s'y prête.
    if (this.destination && this.navState !== 'Destination atteinte') {
      const started = this.navigate(sim, dt);
      if (started) return this.runManeuver(sim, dt);
    }

    // Trajectoire, recalculée 4 fois par seconde.
    this.replan -= dt;
    if (this.replan <= 0 || !this.path) {
      const length = Math.max(120, v * 7);
      let fresh = this.planner.plan(c.x, c.z, c.heading, length, this.route?.goal ?? null, this.route?.edges);
      // Le véhicule n'est plus sur son itinéraire (contournement large, manœuvre) : on le recalcule depuis là où il est.
      if (!fresh && this.route) { this.reroute(sim, 'écart à l’itinéraire'); fresh = this.planner.plan(c.x, c.z, c.heading, length, this.route?.goal ?? null, this.route?.edges); }
      if (!fresh && !this.route) fresh = this.planner.plan(c.x, c.z, c.heading, length, null);
      // En plein virage, la voie peut ne pas être retrouvée : on garde la trajectoire en cours tant qu'on la suit de près.
      const keep = !fresh && this.path && Math.abs(project(this.path, c.x, c.z).d) < 6 && project(this.path, c.x, c.z).s < this.path.cum[this.path.cum.length - 1]! - 10;
      this.path = fresh ?? (keep ? this.path : null);
      this.replan = 0.25;
    }
    const range = Math.max(150, v * 8);
    const dets = this.detector.detect({ sim, path: this.path, range });
    this.trackStill(dets, dt);
    const threats = this.path ? this.risk.analyze(dets, this.path, ego, range) : [];
    const decision = this.decision.decide(threats, dets, this.path, ego, sim, dt);
    const input: Input = this.path ? this.vehicle.control(this.path, decision, c, dt) : { throttle: 0, brake: v > 0.2 ? 1 : 0, steer: 0 };
    if (!this.path) this.vehicle.action = v > 0.2 ? 'Arrêt en cours' : 'À l’arrêt';
    sim.indicator = Math.abs(decision.offset) > 0.8 ? (decision.offset < 0 ? -1 : 1) : Math.abs(this.vehicle.offset) > 0.8 ? sim.indicator : 0;
    this.lastDecision = decision;
    this.lastThreats = threats;
    if (this.path?.goalS !== undefined && project(this.path, c.x, c.z).s > this.path.goalS - 3 && v < 0.3) this.navState = 'Destination atteinte';
    // Verdict d'une solution apprise : le véhicule s'est éloigné de 20 m de l'endroit où il était bloqué.
    if (this.verdict && Math.hypot(c.x - this.verdict.x, c.z - this.verdict.z) > 20) { this.knowledge?.result(this.verdict.id, true); this.verdict = null; }

    // Anti-blocage : cause d'un arrêt sans issue, ou véhicule qui n'avance plus alors qu'il le devrait.
    const t = decision.threat;
    const waitingPedestrian = t?.det.cls === 'pieton' && (this.still.get(t.det.id) ?? 0) > 5;
    const atGoal = this.navState === 'Destination atteinte';
    const cause: BlockCause | null = decision.action !== 'ARRET' || v > 0.3 || atGoal ? null
      : !this.path ? 'voie' : waitingPedestrian ? 'pieton' : !t ? (this.path.deadEnd ? 'impasse' : null) : t.det.fixed && t.det.cls !== 'feu-rouge' ? 'obstacle' : null;
    const blocked = atGoal ? null : this.antiBlock.watch(dt, c.x, c.z, v, decision.targetSpeed, cause);
    if (blocked && this.escape(sim, dets, ego, decision, blocked)) return this.runManeuver(sim, dt);

    // Danger affiché : celui qui motive la décision, sinon le plus haut perçu.
    const main = decision.threat ?? threats[0] ?? null;
    const level: DangerLevel = decision.threat ? (Math.max(decision.threat.level, 1) as DangerLevel) : main && main.level >= 2 ? main.level : threats.length ? 1 : 0;
    this.alertCooldown -= dt;
    if (level >= 3 && this.alertCooldown <= 0) { this.onAlert?.(level); this.alertCooldown = level === 4 ? 1.2 : 2.5; }
    this.lastLevel = level;
    const message = this.antiBlock.halted ? this.antiBlock.message : this.reason && decision.action === 'ARRET' && this.antiBlock.state.startsWith('Blocage') ? this.reason : decision.reason;
    this.telemetry = {
      actif: true, vitesse: Math.round(Math.abs(c.speed) * 3.6),
      objet: main && level >= 1 ? CLASS_LABEL[main.det.cls] : 'AUCUN', distance: main && level >= 1 ? Math.max(0, Math.round(main.gap)) : null,
      danger: DANGER_LABEL[level], niveau: level, decision: ACTION_LABEL[decision.action], action: this.vehicle.action, message,
      couleur: this.antiBlock.halted || level >= 4 || (decision.action === 'ARRET' && level >= 3) ? 'rouge' : level >= 2 || decision.action !== 'CONTINUER' ? 'orange' : 'vert',
      percus: dets.length, trajectoire: this.trajectoryLabel(), navigation: this.navLabel(), contournements: this.decision.bypassCount,
      antiBlocage: this.antiBlock.state, passages: this.optionsLabel(), savoir: this.knowledgeLabel(),
    };
    this.visual = this.draw(sim, threats, decision, dets);
    return input;
  }

  /** Itinéraire : le calculer, détecter un point de passage derrière, chercher un endroit où faire demi-tour. Renvoie true si un demi-tour démarre. */
  private navigate(sim: GameSim, dt: number) {
    const c = sim.car;
    this.turnSearch -= dt;
    if (this.route && !(this.route.behind === false && this.navState.startsWith('Recherche') && this.turnSearch <= 0)) return false;
    const edge = this.planner.edgeAt(c.x, c.z, c.heading);
    if (edge < 0) { this.navState = 'Hors des rues : retour vers la voie'; return false; }
    const along = this.alongEdge(sim, edge);
    const canTurn = this.uturnRoom(sim) && !this.antiBlock.halted;
    const route = this.itinerary.plan(edge, along, this.destination!, canTurn, (e) => this.planner.isBlocked(e));
    if (!route) { this.navState = 'Aucun itinéraire vers la destination'; return false; }
    if (!this.route || route.behind) this.routeCount++;
    this.route = route;
    this.path = null;
    this.replan = 0;
    if (route.behind) {
      // Le prochain point de l'itinéraire est derrière : demi-tour sur place, ici la rue le permet.
      this.navState = 'Demi-tour pour rejoindre l’itinéraire';
      this.reason = 'Le prochain point de l’itinéraire est derrière le véhicule : demi-tour pour le rejoindre.';
      this.maneuver = new Maneuver('demi-tour', sim, this.turnSide(sim));
      return true;
    }
    // Destination derrière mais pas la place de tourner ici : on avance en cherchant un endroit plus large.
    if (!canTurn && this.itinerary.behind(edge, along, this.destination!, (e) => this.planner.isBlocked(e))) {
      this.navState = 'Recherche d’un endroit pour faire demi-tour';
      this.turnSearch = 1;
    } else this.navState = 'Suivi de l’itinéraire';
    return false;
  }

  /** Recalcul de l'itinéraire (écart, rue bloquée) : depuis la position actuelle, vers la même destination. */
  private reroute(sim: GameSim, why: string) {
    if (!this.destination) return;
    const c = sim.car;
    const edge = this.planner.edgeAt(c.x, c.z, c.heading);
    if (edge < 0) return;
    const route = this.itinerary.plan(edge, this.alongEdge(sim, edge), this.destination, false, (e) => this.planner.isBlocked(e));
    if (!route) return;
    this.route = route;
    this.routeCount++;
    this.navState = `Itinéraire recalculé (${why})`;
  }

  private alongEdge(sim: GameSim, edge: number) {
    const p = sim.world.edges[edge]!.p;
    let run = 0, best = Infinity, at = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.max(0, Math.min(l, ((sim.car.x - a[0]) * (b[0] - a[0]) + (sim.car.z - a[1]) * (b[1] - a[1])) / l));
      const d = Math.hypot(sim.car.x - a[0] - ((b[0] - a[0]) * t) / l, sim.car.z - a[1] - ((b[1] - a[1]) * t) / l);
      if (d < best) { best = d; at = run + t; }
      run += l;
    }
    return at;
  }

  /** Place libre de chaque côté (m), sondée tous les 25 cm : murs, clôtures, eau. */
  private sideRoom(sim: GameSim, side: number) {
    const c = sim.car, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let d = 0.25;
    for (; d <= 8; d += 0.25) if (!sim.drivable(c.x - fz * side * d + fx * 2, c.z + fx * side * d + fz * 2)) break;
    return d - 0.25;
  }
  /** Assez de place pour un demi-tour en quelques fois : 7 m praticables d'un bord à l'autre. */
  private uturnRoom(sim: GameSim) { return this.sideRoom(sim, -1) + this.sideRoom(sim, 1) >= 7; }
  private turnSide(sim: GameSim): -1 | 1 { return this.sideRoom(sim, -1) >= this.sideRoom(sim, 1) ? -1 : 1; }

  /** Immobilité des objets perçus ; un véhicule arrêté depuis 20 s (hors feu) devient un obstacle fixe. */
  private trackStill(dets: Detection[], dt: number) {
    const seen = new Set<string>();
    for (const d of dets) {
      if (d.cls !== 'voiture' && d.cls !== 'moto' && d.cls !== 'camion' && d.cls !== 'pieton') continue;
      seen.add(d.id);
      const t = Math.hypot(d.vx, d.vz) < 0.2 ? (this.still.get(d.id) ?? 0) + dt : 0;
      this.still.set(d.id, t);
      // Un piéton immobile n'est jamais un obstacle fixe : on le contourne largement ou on lui laisse le passage.
      if (t > 20 && d.cls !== 'pieton') d.fixed = true;
    }
    for (const id of this.still.keys()) if (!seen.has(id)) this.still.delete(id);
  }

  /**
   * Chercher une issue, selon la cause, sans répéter ce qui vient d'échouer au même endroit :
   * piéton immobile → recul pour lui laisser le passage ; obstacle → recul pour se donner la place de contourner,
   * attente si seule la circulation en face gêne, sinon rebrousser chemin ; impasse, voie perdue, véhicule immobilisé → demi-tour
   * ou marche arrière jusqu'au carrefour. Renvoie true si une manœuvre démarre.
   */
  private escape(sim: GameSim, dets: Detection[], ego: Ego, decision: Decision, cause: BlockCause) {
    const c = sim.car, t = decision.threat;
    this.escapeAt = [c.x, c.z];
    // Rebloqué là où une solution apprise vient d'être rejouée : elle a échoué.
    if (this.verdict && Math.hypot(c.x - this.verdict.x, c.z - this.verdict.z) < 10) { this.knowledge?.result(this.verdict.id, false); this.verdict = null; }
    // Ce lieu pose problème : il devient un point critique, que la conduite des joueurs pourra résoudre.
    this.knowledge?.addCritical(c.x, c.z, c.heading, cause);
    // D'abord, une solution apprise d'un joueur qui s'est sorti de ce même endroit.
    const learned = cause !== 'pieton' ? this.knowledge?.find(c.x, c.z, c.heading) : null;
    if (learned && !this.antiBlock.tried('apprise', c.x, c.z) && this.antiBlock.record('apprise', c.x, c.z, cause)) {
      const pts = learned.demo.pts.slice(learned.from);
      this.maneuver = new Maneuver('apprise', sim, -1, 0, pts.map((p) => [p[0], p[1]] as Pt), pts.map((p) => p[2]));
      this.learnedId = learned.demo.id;
      this.reason = `Passage appris de la conduite d’un joueur${learned.demo.ok ? ` (déjà réussi ${learned.demo.ok} fois)` : ''} : SMART AI le rejoue au pas.`;
      return true;
    }
    const plans: Strategy[] = [];
    if (cause === 'pieton') plans.push('recul-pieton', 'attente');
    if (cause === 'obstacle' && t && this.path) {
      const room = this.decision.roomToBypass(t, this.path, ego, dets, sim);
      const back = room === null ? 0 : room - t.gap + 0.5;
      if (room !== null && back <= 0) plans.push('attente');
      else if (room !== null && back < 10) plans.push('recul');
      else if (room === null && this.decision.roomToBypass(t, this.path, ego, dets.filter((d) => d.fixed), sim) !== null && !this.antiBlock.tried('attente', c.x, c.z)) plans.push('attente');
    }
    if (cause === 'immobilise') plans.push('recul');
    plans.push(this.uturnRoom(sim) ? 'demi-tour' : 'retour', this.uturnRoom(sim) ? 'retour' : 'demi-tour');
    for (const plan of plans) {
      if (plan !== 'attente' && this.antiBlock.tried(plan, c.x, c.z)) continue;
      if (plan === 'attente') {
        this.antiBlock.record('attente', c.x, c.z, cause);
        this.reason = t ? `${CLASS_LABEL[t.det.cls]} sur la voie : contournement dès que la circulation sera passée.` : 'Attente.';
        return false;
      }
      if (plan === 'recul-pieton' || plan === 'recul') {
        const dist = plan === 'recul-pieton' ? 5 : cause === 'immobilise' ? 3 : Math.min(10, (this.path && t ? (this.decision.roomToBypass(t, this.path, ego, dets, sim) ?? 0) - t.gap : 0) + 0.5);
        if (dist <= 0 || !clearance(sim, dets, -1, Math.max(1, dist))) continue;
        if (!this.antiBlock.record(plan, c.x, c.z, cause)) return false;
        this.maneuver = new Maneuver('recul', sim, -1, dist);
        this.reason = plan === 'recul-pieton' ? 'Piéton immobile devant : recul de 5 m pour lui laisser le passage.' : cause === 'immobilise' ? 'Le véhicule n’avance plus : marche arrière contrôlée de 3 m, puis nouvelle trajectoire.' : `${t ? CLASS_LABEL[t.det.cls] : 'Obstacle'} trop proche pour le contourner : marche arrière de ${dist.toFixed(1)} m, puis contournement.`;
        return true;
      }
      // Rebrousser chemin : la rue bloquée est évitée, l'itinéraire est recalculé après la manœuvre.
      if (plan === 'demi-tour' && !this.uturnRoom(sim)) continue;
      if (!this.antiBlock.record(plan, c.x, c.z, cause)) return false;
      if (this.path) {
        const me = project(this.path, c.x, c.z);
        const at = t ? pointAt(this.path, me.s + Math.max(0, t.gap) + ego.front) : pointAt(this.path, this.path.cum[this.path.cum.length - 1]!);
        this.planner.block(at.edge);
      }
      const what = t ? CLASS_LABEL[t.det.cls] : cause === 'impasse' ? 'Rue sans issue' : 'Voie introuvable';
      if (plan === 'retour') {
        const behind = this.planner.laneBehind(c.x, c.z, c.heading);
        if (!behind) continue;
        this.planner.block(behind.edge);
        this.maneuver = new Maneuver('retour', sim, -1, 0, behind.pts);
        this.reason = `${what} : rue trop étroite pour un demi-tour, marche arrière jusqu’au carrefour, puis autre chemin.`;
      } else {
        this.maneuver = new Maneuver('demi-tour', sim, this.turnSide(sim));
        this.reason = `${what} : aucun passage sûr, demi-tour pour prendre un autre chemin.`;
      }
      if (this.route) this.route = null;
      return true;
    }
    this.antiBlock.halt(cause);
    return false;
  }

  /** Exécute la manœuvre en cours, en continuant de percevoir l'environnement. */
  private runManeuver(sim: GameSim, dt: number): Input {
    const m = this.maneuver!;
    const dets = this.detector.detect({ sim, path: null, range: 30 });
    this.trackStill(dets, dt);
    const input = m.step(sim, dets, dt);
    sim.indicator = m.kind === 'demi-tour' ? m.turn : 0;
    if (m.done || m.failed) {
      this.maneuver = null;
      this.antiBlock.afterManeuver();
      this.path = null;
      this.replan = 0;
      this.decision.reset();
      this.vehicle.reset();
      sim.indicator = 0;
      if (m.failed) this.reason = 'Manœuvre interrompue : pas assez de place sans risque.';
      // Une solution apprise rejouée : sa réussite ou son échec améliore le savoir de tous.
      if (m.kind === 'apprise' && this.learnedId) { this.verdict = { id: this.learnedId, x: this.escapeAt[0], z: this.escapeAt[1] }; this.learnedId = null; this.reason = 'Passage appris rejoué : reprise de la conduite.'; }
      // Après un demi-tour vers l'itinéraire, celui-ci reste le même ; après une issue de secours, il est recalculé.
      if (this.destination && !this.route) this.navState = 'Calcul de l’itinéraire';
      else if (this.route?.behind) { this.route = { ...this.route, behind: false }; this.navState = 'Itinéraire rejoint : suivi'; }
    }
    const near = dets.filter((d) => d.cls !== 'feu-rouge').sort((a, b) => Math.hypot(a.x - sim.car.x, a.z - sim.car.z) - Math.hypot(b.x - sim.car.x, b.z - sim.car.z))[0];
    const dist = near ? Math.hypot(near.x - sim.car.x, near.z - sim.car.z) : null;
    this.telemetry = {
      actif: true, vitesse: Math.round(Math.abs(sim.car.speed) * 3.6),
      objet: near && dist !== null && dist < 15 ? CLASS_LABEL[near.cls] : 'AUCUN', distance: near && dist !== null && dist < 15 ? Math.round(dist) : null,
      danger: DANGER_LABEL[2], niveau: 2, decision: MANEUVER_LABEL[m.kind], action: m.action, message: this.reason,
      couleur: 'orange', percus: dets.length, trajectoire: `Manœuvre : ${m.action.toLowerCase()}`, navigation: this.navLabel(), contournements: this.decision.bypassCount,
      antiBlocage: this.antiBlock.state, passages: this.optionsLabel(), savoir: this.knowledgeLabel(),
    };
    this.visual = { line: [], dangers: dets.filter((d) => Math.hypot(d.x - sim.car.x, d.z - sim.car.z) < 12 && d.cls !== 'nid-de-poule').map((d) => ({ x: d.x, z: d.z, r: Math.max(d.radius, d.length) + 0.6, level: 2 as DangerLevel })), boxes: this.boxes(sim, dets, []) };
    return input;
  }

  private knowledgeLabel() {
    const k = this.knowledge;
    if (!k) return '';
    return `${k.demos.length} passage${k.demos.length > 1 ? 's' : ''} appris des joueurs · ${k.critiques.length} point${k.critiques.length > 1 ? 's' : ''} critique${k.critiques.length > 1 ? 's' : ''}`;
  }

  private trajectoryLabel() {
    const b = this.decision.bypassing, o = this.vehicle.offset;
    if (this.decision.returning) return 'Retour dans la voie dès qu’elle est libre';
    if (b) return `Contournement par la ${b.offset < 0 ? 'gauche' : 'droite'}${b.offroad ? ', bas-côté' : ''} (${Math.abs(b.offset).toFixed(1)} m)`;
    if (Math.abs(o) > 0.3) return 'Retour progressif dans la voie';
    return this.path ? (this.route ? 'Voie de droite, sur l’itinéraire' : 'Voie de droite') : 'Aucune';
  }

  private navLabel() {
    if (!this.destination) return 'Conduite libre (pas de destination)';
    // Distance restante quand la destination est sur la trajectoire planifiée.
    const left = this.path?.goalS !== undefined ? Math.max(0, Math.round(this.path.goalS - project(this.path, this.pos[0], this.pos[1]).s)) : null;
    return left !== null && this.navState.startsWith('Suivi') ? `${this.navState} · ${left} m` : this.navState;
  }
  private pos: Pt = [0, 0];

  private optionsLabel() {
    const o = this.decision.lastOptions;
    if (!o.length) return '';
    // Un résumé par côté : le meilleur passage praticable, sinon la raison du refus la plus parlante.
    return (['gauche', 'droite'] as const).map((side) => {
      const mine = o.filter((x) => x.side === side);
      const ok = mine.filter((x) => x.ok).sort((a, b) => b.score - a.score)[0];
      if (ok) return `${side}${ok.offroad ? ' (bas-côté)' : ''} ✓ marge ${ok.margin.toFixed(1)} m`;
      const why = mine.find((x) => x.why !== 'trop loin de la voie')?.why ?? mine[0]?.why ?? 'aucun';
      return `${side} ✗ ${why}`;
    }).join(' · ') + ` (${o.length} passages évalués)`;
  }

  /** Trajectoire visée (40 m devant, décalage compris) et zones de danger, pour la scène. */
  /** Cadres de détection : les objets perçus à moins de 70 m (les plus proches d'abord), avec le niveau de danger de chacun. */
  private boxes(sim: GameSim, dets: Detection[], threats: Threat[]): Box[] {
    const level = new Map(threats.map((t) => [t.det.id, t.level]));
    const c = sim.car;
    return dets
      .filter((d) => d.cls !== 'feu-rouge' || level.has(d.id))
      .map((d) => ({ d, dist: Math.hypot(d.x - c.x, d.z - c.z) }))
      .filter((o) => o.dist < 70)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 40)
      .map(({ d, dist }) => ({
        x: d.x, z: d.z, heading: d.heading, radius: Math.max(d.radius, 0.3), length: Math.max(d.length, 0.3), height: CLASS_HEIGHT[d.cls],
        label: CLASS_LABEL[d.cls], level: (level.get(d.id) ?? 0) as DangerLevel, distance: Math.round(dist),
      }));
  }

  private draw(sim: GameSim, threats: Threat[], decision: Decision, dets: Detection[]): Visual {
    const line: Pt[] = [];
    if (this.path) {
      const me = project(this.path, sim.car.x, sim.car.z);
      for (let s = 0; s <= 40; s += 2) {
        const at = pointAt(this.path, me.s + s);
        // Le décalage rejoint progressivement la consigne : la ligne montre la courbe de raccordement.
        const k = Math.min(1, s / 12);
        const off = this.vehicle.offset + (decision.offset - this.vehicle.offset) * k;
        line.push([at.x - at.dz * off, at.z + at.dx * off]);
      }
    }
    const dangers = threats.filter((t) => t.level >= 2 && t.gap < 60).slice(0, 12).map((t) => ({ x: t.det.x, z: t.det.z, r: Math.max(t.det.radius, t.det.length) + 0.8, level: t.level }));
    return { line, dangers, boxes: this.boxes(sim, dets, threats) };
  }
}
