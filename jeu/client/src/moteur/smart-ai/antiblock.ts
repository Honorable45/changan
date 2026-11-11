/**
 * Système anti-blocage : il surveille que le véhicule avance quand il le doit, identifie la cause d'un blocage,
 * propose la manœuvre suivante sans répéter celle qui vient d'échouer au même endroit, et décide d'un arrêt sécurisé
 * après plusieurs échecs (pas de boucle infinie, pas de va-et-vient).
 */
export type BlockCause = 'obstacle' | 'pieton' | 'impasse' | 'immobilise' | 'voie';
export type Strategy = 'apprise' | 'recul' | 'recul-pieton' | 'attente' | 'demi-tour' | 'retour';

const CAUSE_LABEL: Record<BlockCause, string> = {
  obstacle: 'obstacle infranchissable', pieton: 'piéton immobile devant', impasse: 'rue sans issue',
  immobilise: 'véhicule immobilisé malgré la commande', voie: 'voie introuvable',
};
export const STRATEGY_LABEL: Record<Strategy, string> = {
  apprise: 'solution apprise d’un joueur',
  recul: 'marche arrière pour contourner', 'recul-pieton': 'recul pour laisser passer le piéton', attente: 'attente',
  'demi-tour': 'demi-tour', retour: 'marche arrière jusqu’au carrefour',
};

export class AntiBlockage {
  /** État affiché : surveillance, blocage détecté, manœuvre n°, arrêt sécurisé. */
  state = 'Surveillance';
  /** Arrêt sécurisé déclenché : SMART AI ne manœuvre plus, le conducteur doit reprendre la main. */
  halted = false;
  message = '';
  private clock = 0;
  private stuckFor = 0;
  private trail: { t: number; x: number; z: number; want: number }[] = [];
  private attempts: { kind: Strategy; x: number; z: number; t: number }[] = [];
  private movingFor = 0;
  /** Nombre maximal de manœuvres en 3 minutes avant l'arrêt sécurisé. */
  static readonly MAX = 5;

  reset() { this.state = 'Surveillance'; this.halted = false; this.message = ''; this.stuckFor = 0; this.trail = []; this.attempts = []; this.movingFor = 0; }

  /** Après une manœuvre : la surveillance du progrès repart de la nouvelle position (pas de faux blocage). */
  afterManeuver() { this.trail = []; this.stuckFor = 0; }

  get count() { return this.attempts.filter((a) => this.clock - a.t < 180).length; }

  /**
   * À chaque image : renvoie la cause d'un blocage avéré, ou null.
   * - « stopped » : la décision immobilise le véhicule faute de solution (cause fournie) ;
   * - sinon, si la consigne demande d'avancer mais que le véhicule n'a pas parcouru 0,8 m en 4 s : immobilisé.
   */
  watch(dt: number, x: number, z: number, speed: number, target: number, stopped: BlockCause | null): BlockCause | null {
    this.clock += dt;
    this.trail.push({ t: this.clock, x, z, want: Math.max(0, target) * dt });
    while (this.trail.length && this.clock - this.trail[0]!.t > 4) this.trail.shift();
    // Cinq secondes de route normale : les tentatives passées sont oubliées.
    this.movingFor = speed > 3 ? this.movingFor + dt : 0;
    if (this.movingFor > 5 && this.attempts.length) { this.attempts = []; if (!this.halted) this.state = 'Surveillance'; }
    if (this.halted) return null;
    if (stopped) {
      this.stuckFor += dt;
      this.state = `Blocage détecté : ${CAUSE_LABEL[stopped]} (${this.stuckFor.toFixed(0)} s)`;
      if (this.stuckFor > 2) { this.stuckFor = 0; return stopped; }
      return null;
    }
    this.stuckFor = 0;
    const first = this.trail[0];
    // Il devait avancer : en 4 secondes, moins de 0,8 m, ou moins du quart du chemin que demandaient les consignes successives.
    const expected = this.trail.reduce((a, p) => a + p.want, 0);
    if (first && target > 1 && expected > 2 && this.clock - first.t > 3.9 && Math.hypot(x - first.x, z - first.z) < Math.max(0.8, expected * 0.25)) {
      this.trail = [];
      this.state = `Blocage détecté : ${CAUSE_LABEL.immobilise}`;
      return 'immobilise';
    }
    if (!this.attempts.length) this.state = 'Surveillance';
    return null;
  }

  /** Cette manœuvre a-t-elle déjà été tentée ici (à moins de 8 m, dans les 90 dernières secondes) ? */
  tried(kind: Strategy, x: number, z: number) {
    return this.attempts.some((a) => a.kind === kind && this.clock - a.t < 90 && Math.hypot(a.x - x, a.z - z) < 8);
  }

  /** Enregistre une manœuvre ; renvoie false (et déclenche l'arrêt sécurisé) si les tentatives sont épuisées. */
  record(kind: Strategy, x: number, z: number, cause: BlockCause) {
    if (this.count >= AntiBlockage.MAX) { this.halt(cause); return false; }
    this.attempts.push({ kind, x, z, t: this.clock });
    this.state = `Manœuvre ${this.count}/${AntiBlockage.MAX} : ${STRATEGY_LABEL[kind]}`;
    return true;
  }

  /** Arrêt sécurisé : plus aucune manœuvre, avec un message qui explique le problème. */
  halt(cause: BlockCause) {
    this.halted = true;
    const tried = [...new Set(this.attempts.map((a) => STRATEGY_LABEL[a.kind]))].join(', ');
    this.state = 'Arrêt sécurisé';
    this.message = `Arrêt sécurisé : ${CAUSE_LABEL[cause]}${tried ? ` ; déjà essayé : ${tried}` : ''}. Aucune manœuvre sûre ne reste : reprenez le volant.`;
  }
}
