import type { Pt } from '../sim.ts';

/**
 * SMART AI : conduite autonome du véhicule du joueur.
 * Chaîne : capteurs → EnvironmentDetector (objets) → RiskAnalyzer (dangers) → DecisionEngine (action) → VehicleController (commandes).
 * Convention du jeu : le cap h donne l'avant (sin h, cos h) ; la droite du véhicule est (−cos h, sin h) ; un décalage latéral positif est à droite.
 */

export type ObjectClass = 'pieton' | 'moto' | 'voiture' | 'camion' | 'vehicule-gare' | 'obstacle' | 'nid-de-poule' | 'feu-rouge';
export const CLASS_LABEL: Record<ObjectClass, string> = {
  pieton: 'PIÉTON', moto: 'MOTO', voiture: 'VOITURE', camion: 'CAMION', 'vehicule-gare': 'VÉHICULE GARÉ',
  obstacle: 'OBSTACLE', 'nid-de-poule': 'NID-DE-POULE', 'feu-rouge': 'FEU ROUGE',
};

/** Un objet perçu, dans le repère du monde. Les véhicules sont des segments (centre ± demi-longueur selon leur cap). */
export type Detection = {
  id: string;
  cls: ObjectClass;
  x: number; z: number;
  /** Vitesse en m/s, dans le repère du monde. */
  vx: number; vz: number;
  heading: number;
  /** Demi-largeur et demi-longueur. */
  radius: number; length: number;
  /** Immobile par nature (garé, mur, trou) : seul un objet immobile peut être contourné. */
  fixed: boolean;
  /** Capteur d'origine et confiance (1 pour l'état du jeu ; une détection par caméra serait plus faible). */
  source: string; confidence: number;
};

/** 0 aucun, 1 faible, 2 moyen (vigilance), 3 élevé, 4 critique. */
export type DangerLevel = 0 | 1 | 2 | 3 | 4;
export const DANGER_LABEL = ['AUCUN', 'FAIBLE', 'MOYEN', 'ÉLEVÉ', 'CRITIQUE'] as const;

/** Un objet rapporté à la trajectoire prévue : abscisse, écart latéral, temps avant collision. */
export type Threat = {
  det: Detection;
  /** Distance libre entre l'avant du véhicule et l'objet, le long de la trajectoire (m). */
  gap: number;
  /** Abscisse du centre de l'objet sur la trajectoire, depuis le véhicule (m). */
  s: number;
  /** Écart latéral de l'objet par rapport au couloir du véhicule, maintenant et quand le véhicule l'atteindra (m). */
  d: number; dPred: number;
  /** Demi-largeur du couloir : véhicule + objet + marge. */
  corridor: number;
  /** Vitesse de l'objet le long de la trajectoire (négative s'il vient en face) et vitesse de rapprochement. */
  along: number; closing: number;
  ttc: number;
  /** Décélération nécessaire pour ne pas l'atteindre (m/s²). */
  decel: number;
  inCorridor: boolean; crossing: boolean;
  level: DangerLevel;
};

export type Action = 'CONTINUER' | 'RALENTIR' | 'FREINER' | 'ARRET' | 'CONTOURNER';
export const ACTION_LABEL: Record<Action, string> = { CONTINUER: 'CONTINUER', RALENTIR: 'RALENTISSEMENT', FREINER: 'FREINAGE', ARRET: 'ARRÊT', CONTOURNER: 'CONTOURNEMENT' };
/** Décisions de dégagement, quand la voie reste bloquée : reculer pour contourner, ou rebrousser chemin. */
export const MANEUVER_LABEL = { recul: 'RECUL', 'demi-tour': 'DEMI-TOUR', retour: 'MARCHE ARRIÈRE', apprise: 'SOLUTION APPRISE' } as const;

export type Decision = {
  action: Action;
  /** Vitesse visée (m/s) et décalage latéral visé par rapport à la voie (m, positif à droite). */
  targetSpeed: number;
  offset: number;
  /** Distance restante pour arrêter l'avant du véhicule (m), quand la décision est de s'arrêter avant un point. */
  stopIn?: number;
  threat: Threat | null;
  reason: string;
};

/** Trajectoire prévue : la voie de droite des rues, points et abscisses cumulées, et largeur praticable de part et d'autre. */
export type Path = {
  pts: Pt[];
  cum: number[];
  /** Pour chaque point : décalage latéral permis à gauche (négatif) et à droite (positif), bordures de chaussée comprises. */
  left: number[]; right: number[];
  /** Arête du graphe des rues pour chaque point. */
  edge: number[];
  /** La trajectoire s'arrête sur une impasse : SMART AI ne fait pas demi-tour à l'aveugle, elle s'arrête avant. */
  deadEnd: boolean;
  /** Abscisse de la destination sur la trajectoire, quand elle y figure : le véhicule s'y arrête. */
  goalS?: number;
};

export type Telemetry = {
  actif: boolean;
  vitesse: number;
  objet: string;
  distance: number | null;
  danger: (typeof DANGER_LABEL)[number];
  niveau: DangerLevel;
  decision: string;
  action: string;
  message: string;
  /** Couleur de l'indicateur : vert (route dégagée), orange (vigilance), rouge (danger critique). */
  couleur: 'vert' | 'orange' | 'rouge';
  /** Nombre d'objets perçus dans le rayon d'analyse. */
  percus: number;
  /** Trajectoire suivie : dans la voie, décalée (côté, bas-côté), manœuvre. */
  trajectoire: string;
  /** Navigation : itinéraire suivi, demi-tour pour le rejoindre, destination atteinte, conduite libre. */
  navigation: string;
  /** Contournements engagés depuis l'activation. */
  contournements: number;
  /** État du système anti-blocage. */
  antiBlocage: string;
  /** Passages comparés au dernier contournement envisagé. */
  passages: string;
  /** Savoir appris des joueurs : solutions connues et points critiques. */
  savoir: string;
};
/** Ce que le jeu dessine dans la scène quand SMART AI conduit : la trajectoire visée et les zones de danger. */
export type Visual = { line: Pt[]; dangers: { x: number; z: number; r: number; level: DangerLevel }[]; boxes: Box[] };
/** Cadre de détection d'un objet perçu : sa boîte au sol (centre, cap, demi-largeur, demi-longueur), sa hauteur, son libellé. */
export type Box = { x: number; z: number; heading: number; radius: number; length: number; height: number; label: string; level: DangerLevel; distance: number };
/** Hauteur de la boîte de chaque classe d'objet, en mètres. */
export const CLASS_HEIGHT: Record<ObjectClass, number> = { pieton: 1.8, moto: 1.5, voiture: 1.55, camion: 2.4, 'vehicule-gare': 1.55, obstacle: 1.4, 'nid-de-poule': 0.08, 'feu-rouge': 0.3 };
