import {
  FREQUENCE, GENRES, RETARD_INTERPOLATION, VERSION, decodeInstantane, encodeEtat,
  type Apparence, type DuServeur, type Etat, type EtatJoueur, type Genre,
} from '../../partage/protocole.ts';

/**
 * Connexion au serveur du jeu en ligne. Le jeu reste jouable seul : sans serveur, ou si la connexion tombe,
 * les autres joueurs disparaissent et la connexion est retentée, de plus en plus espacée (jusqu'à 30 s).
 */
export type Autre = { id: number; nom: string; apparence: Apparence; etat: EtatJoueur };
export type EtatReseau = 'hors-ligne' | 'connexion' | 'en-ligne' | 'refus';
type Echantillon = { t: number; e: EtatJoueur };

const lerpAngle = (a: number, b: number, t: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export function creerReseau(url: string, nom: string, apparence: Apparence) {
  let ws: WebSocket | null = null, fermeVolontaire = false, attente = 1000, relance: ReturnType<typeof setTimeout> | null = null;
  let statut: EtatReseau = 'connexion', population = { salle: 0, total: 0 }, salle = '';
  const fiches = new Map<number, { nom: string; apparence: Apparence }>();
  const tampons = new Map<number, Echantillon[]>();
  // Décalage entre l'horloge du serveur et la nôtre, lissé : l'interpolation suit le temps du serveur.
  let decalage: number | null = null;
  let dernierEnvoi = 0, dernierEtat = '';

  const ouvrir = () => {
    statut = 'connexion';
    try { ws = new WebSocket(url); } catch { planifier(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { ws!.send(JSON.stringify({ t: 'bonjour', v: VERSION, nom, apparence })); };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        const snap = decodeInstantane(new DataView(ev.data as ArrayBuffer));
        if (!snap) return;
        const local = performance.now();
        const d = snap.horloge - local;
        // Premier instantané, ou horloge du serveur repartie à zéro (tous les 49 jours) : on se recale d'un coup.
        decalage = decalage === null || Math.abs(d - decalage) > 60000 ? d : decalage + (d - decalage) * 0.05;
        for (const e of snap.liste) {
          const b = tampons.get(e.id) ?? [];
          b.push({ t: snap.horloge, e });
          if (b.length > 8) b.shift();
          tampons.set(e.id, b);
        }
        return;
      }
      let m: DuServeur;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'bienvenue') { statut = 'en-ligne'; attente = 1000; salle = m.salle; population = { salle: m.joueurs, total: m.joueurs }; }
      else if (m.t === 'arrivee') fiches.set(m.id, { nom: m.nom, apparence: m.apparence });
      else if (m.t === 'depart') { fiches.delete(m.id); tampons.delete(m.id); }
      else if (m.t === 'population') population = { salle: m.salle, total: m.total };
      else if (m.t === 'refus') { statut = 'refus'; fermeVolontaire = m.raison !== 'complet'; }
    };
    ws.onclose = () => {
      fiches.clear(); tampons.clear(); decalage = null;
      if (fermeVolontaire) { if (statut !== 'refus') statut = 'hors-ligne'; return; }
      statut = 'hors-ligne';
      planifier();
    };
    ws.onerror = () => ws?.close();
  };
  const planifier = () => {
    if (relance || fermeVolontaire) return;
    // Un peu de hasard : après une coupure, tous les joueurs ne reviennent pas à la même milliseconde.
    relance = setTimeout(() => { relance = null; ouvrir(); }, attente * (0.75 + Math.random() * 0.5));
    attente = Math.min(30000, attente * 2);
  };
  ouvrir();

  return {
    get statut() { return statut; },
    get population() { return population; },
    get salle() { return salle; },
    /** Envoie l'état du joueur, au plus 10 fois par seconde, et au moins une fois par seconde même immobile. */
    envoyer(e: Etat, maintenant: number) {
      if (!ws || ws.readyState !== WebSocket.OPEN || statut !== 'en-ligne') return;
      if (maintenant - dernierEnvoi < 1000 / FREQUENCE - 4) return;
      const cle = `${e.x.toFixed(2)},${e.z.toFixed(2)},${e.y.toFixed(2)},${e.cap.toFixed(2)},${e.mode},${e.genre},${e.drapeaux}`;
      if (cle === dernierEtat && maintenant - dernierEnvoi < 1000) return;
      dernierEtat = cle; dernierEnvoi = maintenant;
      ws.send(encodeEtat(e));
    },
    /** Les autres joueurs, interpolés RETARD_INTERPOLATION ms dans le passé. */
    autres(): Autre[] {
      if (decalage === null) return [];
      const t = performance.now() + decalage - RETARD_INTERPOLATION;
      const out: Autre[] = [];
      for (const [id, b] of tampons) {
        const fiche = fiches.get(id);
        if (!fiche || !b.length) continue;
        let i = b.length - 1;
        while (i > 0 && b[i - 1]!.t > t) i--;
        const a = b[Math.max(0, i - 1)]!, c = b[i]!;
        const k = c.t > a.t ? Math.max(0, Math.min(1.2, (t - a.t) / (c.t - a.t))) : 1;
        // Un saut (entrée dans un bâtiment, nouveau véhicule) n'est pas interpolé.
        const saut = Math.hypot(c.e.x - a.e.x, c.e.z - a.e.z) > 60 || c.e.mode !== a.e.mode || c.e.genre !== a.e.genre;
        const e = saut ? c.e : { ...c.e, x: a.e.x + (c.e.x - a.e.x) * k, z: a.e.z + (c.e.z - a.e.z) * k, y: a.e.y + (c.e.y - a.e.y) * k, cap: lerpAngle(a.e.cap, c.e.cap, Math.min(1, k)) };
        out.push({ id, nom: fiche.nom, apparence: fiche.apparence, etat: e });
      }
      return out;
    },
    fermer() { fermeVolontaire = true; if (relance) clearTimeout(relance); ws?.close(); },
  };
}
export type Reseau = ReturnType<typeof creerReseau>;
export const genreIndex = (g: string) => Math.max(0, GENRES.indexOf(g as Genre));
export const genreNom = (i: number) => GENRES[i] ?? 'berline';
