/**
 * Protocole du jeu en ligne, commun au client et au serveur.
 *
 * Deux sortes de messages sur une même connexion WebSocket :
 * - du texte JSON, rare : présentation, arrivée ou départ d'un joueur voisin, population ;
 * - du binaire, fréquent et compact : l'état de son personnage (client vers serveur, 20 octets),
 *   et l'instantané des joueurs voisins (serveur vers client, 21 octets par joueur).
 *
 * Ce fichier ne contient que du TypeScript « effaçable » : Node l'exécute tel quel, Vite le compile pour le navigateur.
 */

export const VERSION = 1;
/** Fréquence d'envoi de l'état et des instantanés, en hertz. Le client interpole entre deux instantanés. */
export const FREQUENCE = 10;
/** Retard d'affichage des autres joueurs, en millisecondes : deux instantanés d'avance pour interpoler sans à-coups. */
export const RETARD_INTERPOLATION = 200;
/** Rayon de voisinage et nombre maximal de voisins envoyés à chaque joueur. */
export const RAYON_VOISINAGE = 400;
export const VOISINS_MAX = 32;

/** Véhicules connus, par leur index dans les messages binaires. L'ordre ne doit jamais changer : on ajoute à la fin. */
export const GENRES = ['berline', 'suv', 'pickup', 'minibus', 'moto', 'scooter', 'motosport', 'helico', 'sportive', 'coupe', 'luxe', 'taxi', 'fourgon'] as const;
export type Genre = (typeof GENRES)[number];

export const TYPE_ETAT = 1;
export const TYPE_INSTANTANE = 2;
/** Message vocal (talkie-walkie) : client → serveur [3][format][audio], serveur → client [3][id u16][format][audio]. */
export const TYPE_VOIX = 3;
/** Formats audio des messages vocaux, selon ce que le navigateur sait enregistrer. L'ordre ne change jamais. */
export const FORMATS_VOIX = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;
/** Un message vocal dure au plus VOIX_DUREE_MAX secondes et pèse au plus VOIX_MAX_OCTETS (Opus à 16 kbit/s : 30 Ko pour 15 s). */
export const VOIX_DUREE_MAX = 15;
export const VOIX_MAX_OCTETS = 64000;
/** Longueur maximale d'un message écrit. */
export const CHAT_MAX = 200;

/** Bits de « drapeaux ». */
export const DRAPEAU = { course: 1, air: 2, salut: 4, assis: 8, dedans: 16 } as const;
/** La danse occupe les bits 5 et 6 (0 : aucune, 1 ou 2 : pas de danse). */
export const DANSE_DECALAGE = 5;

export type Etat = {
  x: number; z: number; y: number;
  /** Cap en radians. */
  cap: number;
  /** Vitesse en m/s, négative en marche arrière. */
  vitesse: number;
  /** 0 : à pied, 1 : dans un véhicule. */
  mode: 0 | 1;
  /** Index dans GENRES ; ignoré à pied. */
  genre: number;
  drapeaux: number;
};
export type EtatJoueur = Etat & { id: number };

export const OCTETS_ETAT = 20;
export const OCTETS_ENTREE = 21;
const ENTETE_INSTANTANE = 7;
/** Limites du monde acceptées : bien au-delà de la ville, et des intérieurs placés loin d'elle. */
export const LIMITE_MONDE = 20000;

const TOUR = Math.PI * 2;
const capVersU16 = (a: number) => Math.round((((a % TOUR) + TOUR) % TOUR) / TOUR * 65535);
const u16VersCap = (v: number) => (v / 65535) * TOUR;
const vitesseVersI16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * 100)));

export function encodeEtat(e: Etat): ArrayBuffer {
  const buf = new ArrayBuffer(OCTETS_ETAT);
  const d = new DataView(buf);
  d.setUint8(0, TYPE_ETAT);
  d.setFloat32(1, e.x, true);
  d.setFloat32(5, e.z, true);
  d.setFloat32(9, e.y, true);
  d.setUint16(13, capVersU16(e.cap), true);
  d.setInt16(15, vitesseVersI16(e.vitesse), true);
  d.setUint8(17, e.mode);
  d.setUint8(18, e.genre);
  d.setUint8(19, e.drapeaux);
  return buf;
}

/** Lit l'état envoyé par un client ; null si le message est mal formé ou hors du monde. */
export function decodeEtat(d: DataView): Etat | null {
  if (d.byteLength !== OCTETS_ETAT || d.getUint8(0) !== TYPE_ETAT) return null;
  const x = d.getFloat32(1, true), z = d.getFloat32(5, true), y = d.getFloat32(9, true);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > LIMITE_MONDE || Math.abs(z) > LIMITE_MONDE || y < -50 || y > 1000) return null;
  const mode = d.getUint8(17), genre = d.getUint8(18);
  if (mode > 1 || genre >= GENRES.length) return null;
  return { x, z, y, cap: u16VersCap(d.getUint16(13, true)), vitesse: d.getInt16(15, true) / 100, mode: mode as 0 | 1, genre, drapeaux: d.getUint8(19) & 0x7f };
}

/** Instantané des voisins : type, horloge du serveur (ms, modulo 2³²), nombre, puis une entrée par joueur. */
export function encodeInstantane(liste: EtatJoueur[], horloge: number): Uint8Array {
  const buf = new ArrayBuffer(ENTETE_INSTANTANE + liste.length * OCTETS_ENTREE);
  const d = new DataView(buf);
  d.setUint8(0, TYPE_INSTANTANE);
  d.setUint32(1, horloge >>> 0, true);
  d.setUint16(5, liste.length, true);
  let o = ENTETE_INSTANTANE;
  for (const e of liste) {
    d.setUint16(o, e.id, true);
    d.setFloat32(o + 2, e.x, true);
    d.setFloat32(o + 6, e.z, true);
    d.setFloat32(o + 10, e.y, true);
    d.setUint16(o + 14, capVersU16(e.cap), true);
    d.setInt16(o + 16, vitesseVersI16(e.vitesse), true);
    d.setUint8(o + 18, e.mode);
    d.setUint8(o + 19, e.genre);
    d.setUint8(o + 20, e.drapeaux);
    o += OCTETS_ENTREE;
  }
  return new Uint8Array(buf);
}

export function decodeInstantane(d: DataView): { horloge: number; liste: EtatJoueur[] } | null {
  if (d.byteLength < ENTETE_INSTANTANE || d.getUint8(0) !== TYPE_INSTANTANE) return null;
  const n = d.getUint16(5, true);
  if (d.byteLength !== ENTETE_INSTANTANE + n * OCTETS_ENTREE) return null;
  const liste: EtatJoueur[] = [];
  let o = ENTETE_INSTANTANE;
  for (let i = 0; i < n; i++, o += OCTETS_ENTREE) {
    liste.push({
      id: d.getUint16(o, true), x: d.getFloat32(o + 2, true), z: d.getFloat32(o + 6, true), y: d.getFloat32(o + 10, true),
      cap: u16VersCap(d.getUint16(o + 14, true)), vitesse: d.getInt16(o + 16, true) / 100,
      mode: d.getUint8(o + 18) as 0 | 1, genre: d.getUint8(o + 19), drapeaux: d.getUint8(o + 20),
    });
  }
  return { horloge: d.getUint32(1, true), liste };
}

/** Apparence d'un personnage : couleurs de peau et de vêtements. Le visage photographié d'Honorable n'est jamais transmis. */
export type Apparence = { skin: number; top: number; bottom: number; hair: number; shoes: number; dress: boolean; cap: number | null; tie?: number };

const couleur = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff;
export function valideApparence(a: unknown): Apparence | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  if (![o.skin, o.top, o.bottom, o.hair, o.shoes].every(couleur) || typeof o.dress !== 'boolean') return null;
  if (o.cap !== null && !couleur(o.cap)) return null;
  if (o.tie !== undefined && !couleur(o.tie)) return null;
  return { skin: o.skin as number, top: o.top as number, bottom: o.bottom as number, hair: o.hair as number, shoes: o.shoes as number, dress: o.dress, cap: o.cap as number | null, ...(o.tie !== undefined ? { tie: o.tie as number } : {}) };
}

/** Pseudo affiché au-dessus du personnage : lettres, chiffres, espaces, tirets ; 2 à 20 caractères. */
export function nettoieNom(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s.length >= 2 ? s : null;
}

/** Message écrit : sans caractères de contrôle, espaces resserrés, 1 à CHAT_MAX caractères. */
export function nettoieMessage(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  return s.length ? s : null;
}

/** Message vocal d'un client : encodage, puis lecture par le serveur (null s'il est mal formé ou trop lourd). */
export function encodeVoix(format: number, audio: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + audio.byteLength);
  out[0] = TYPE_VOIX; out[1] = format; out.set(audio, 2);
  return out;
}
export function decodeVoixClient(b: Uint8Array): { format: number; audio: Uint8Array } | null {
  if (b.byteLength < 3 || b[0] !== TYPE_VOIX || b[1]! >= FORMATS_VOIX.length || b.byteLength - 2 > VOIX_MAX_OCTETS) return null;
  return { format: b[1]!, audio: b.subarray(2) };
}
/** Relais d'un message vocal par le serveur, avec l'auteur. */
export function encodeVoixRelais(id: number, format: number, audio: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + audio.byteLength);
  out[0] = TYPE_VOIX; out[1] = id & 0xff; out[2] = id >> 8; out[3] = format; out.set(audio, 4);
  return out;
}
export function decodeVoixRelais(b: Uint8Array): { id: number; format: number; audio: Uint8Array } | null {
  if (b.byteLength < 5 || b[0] !== TYPE_VOIX || b[3]! >= FORMATS_VOIX.length) return null;
  return { id: b[1]! | (b[2]! << 8), format: b[3]!, audio: b.subarray(4) };
}

/** Position d'un joueur de la salle sur la carte : id, pseudo, x, z (au mètre), 1 s'il est dans un bâtiment. */
export type PointCarte = [id: number, nom: string, x: number, z: number, dedans: 0 | 1];

/** Messages texte. */
export type DuClient = { t: 'bonjour'; v: number; nom: string; apparence: Apparence } | { t: 'chat'; txt: string };
export type DuServeur =
  | { t: 'bienvenue'; id: number; salle: string; joueurs: number }
  | { t: 'arrivee'; id: number; nom: string; apparence: Apparence }
  | { t: 'depart'; id: number }
  | { t: 'population'; salle: number; total: number }
  /** Tous les joueurs de la salle et leur position, toutes les 2 secondes : pour la carte et la liste des joueurs. */
  | { t: 'carte'; j: PointCarte[] }
  /** Message écrit, envoyé à toute la salle (l'auteur le reçoit aussi : c'est sa confirmation). */
  | { t: 'chat'; id: number; nom: string; txt: string; at: number }
  /** Derniers messages de la salle, à l'arrivée. */
  | { t: 'historique'; m: { id: number; nom: string; txt: string; at: number }[] }
  | { t: 'trop-vite' }
  | { t: 'refus'; raison: 'complet' | 'version' | 'nom' | 'apparence' }
  | { t: 'au-revoir' };
