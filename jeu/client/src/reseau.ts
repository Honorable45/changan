import {
  FREQUENCE, GENRES, RETARD_INTERPOLATION, TYPE_VOIX, VERSION, decodeInstantane, decodeTrameVoixRelais, encodeEtat, encodeTrameVoix,
  nettoieMessage, type Apparence, type DuServeur, type Etat, type EtatJoueur, type Genre, type PointCarte,
} from '../../partage/protocole.ts';

/**
 * Connexion au serveur du jeu en ligne. Le jeu reste jouable seul : sans serveur, ou si la connexion tombe,
 * les autres joueurs disparaissent et la connexion est retentée, de plus en plus espacée (jusqu'à 30 s).
 */
export type Autre = { id: number; nom: string; apparence: Apparence; etat: EtatJoueur };
export type EtatReseau = 'hors-ligne' | 'connexion' | 'en-ligne' | 'refus';
type Echantillon = { t: number; e: EtatJoueur };
/** Un joueur de la salle sur la carte. */
export type JoueurCarte = { id: number; nom: string; x: number; z: number; dedans: boolean };
/** Un message écrit de la discussion. */
export type MessageJeu = { cle: number; id: number; nom: string; at: number; moi: boolean; txt: string };
let cleMessage = 0;
/** Couleur d'un joueur, la même sur la carte, dans la liste et dans la discussion. */
const COULEURS_JOUEURS = ['#4fc3ff', '#ffb547', '#c38bff', '#ff7aa8', '#7be08a', '#ffe066', '#5ee0d0', '#ff8f5a'];
export const couleurJoueur = (id: number) => COULEURS_JOUEURS[id % COULEURS_JOUEURS.length]!;

const lerpAngle = (a: number, b: number, t: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export function creerReseau(url: string, nom: string, apparence: Apparence) {
  let ws: WebSocket | null = null, fermeVolontaire = false, attente = 1000, relance: ReturnType<typeof setTimeout> | null = null;
  let statut: EtatReseau = 'connexion', population = { salle: 0, total: 0 }, salle = '';
  const fiches = new Map<number, { nom: string; apparence: Apparence }>();
  const tampons = new Map<number, Echantillon[]>();
  // Décalage entre l'horloge du serveur et la nôtre, lissé : l'interpolation suit le temps du serveur.
  let decalage: number | null = null;
  let dernierEnvoi = 0, dernierEtat = '';
  let monId = -1, carte: JoueurCarte[] = [];
  let messages: MessageJeu[] = [];
  const ecouteurs = new Set<(m: MessageJeu) => void>();
  const ecouteursVoix = new Set<(id: number, audio: Uint8Array) => void>();
  let trame = 0;
  let tropVite = 0, muetJusqua = 0, raison: string | null = null;
  const nomDe = (id: number) => fiches.get(id)?.nom ?? carte.find((c) => c.id === id)?.nom ?? 'Joueur';
  const ajouter = (m: Omit<MessageJeu, 'cle'>) => {
    const full = { ...m, cle: ++cleMessage };
    messages.push(full);
    // Les 100 derniers messages ; les enregistrements vocaux oubliés sont libérés.
    while (messages.length > 100) messages.shift();
    for (const f of ecouteurs) f(full);
  };

  const ouvrir = () => {
    statut = 'connexion';
    try { ws = new WebSocket(url); } catch { planifier(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { ws!.send(JSON.stringify({ t: 'bonjour', v: VERSION, nom, apparence })); };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        const octets = new Uint8Array(ev.data as ArrayBuffer);
        if (octets[0] === TYPE_VOIX) {
          // Voix en direct d'un joueur à moins de 5 m : transmise telle quelle aux haut-parleurs.
          const v = decodeTrameVoixRelais(octets);
          if (v) for (const f of ecouteursVoix) f(v.id, v.audio);
          return;
        }
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
      if (m.t === 'bienvenue') { statut = 'en-ligne'; attente = 1000; salle = m.salle; monId = m.id; if (m.nom) nom = m.nom; population = { salle: m.joueurs, total: m.joueurs }; }
      else if (m.t === 'carte') carte = m.j.map(([id, n, x, z, d]: PointCarte) => ({ id, nom: n, x, z, dedans: d === 1 }));
      else if (m.t === 'chat') ajouter({ id: m.id, nom: m.nom, txt: m.txt, at: m.at, moi: m.id === monId });
      else if (m.t === 'historique') { for (const h of m.m) if (!messages.some((x) => x.at === h.at && x.id === h.id)) ajouter({ ...h, moi: false }); }
      else if (m.t === 'trop-vite') tropVite = performance.now();
      else if (m.t === 'muet') muetJusqua = Date.now() + m.secondes * 1000;
      else if (m.t === 'arrivee') fiches.set(m.id, { nom: m.nom, apparence: m.apparence });
      else if (m.t === 'depart') { fiches.delete(m.id); tampons.delete(m.id); }
      else if (m.t === 'population') population = { salle: m.salle, total: m.total };
      else if (m.t === 'refus') { statut = 'refus'; raison = m.raison; fermeVolontaire = m.raison !== 'complet'; }
    };
    ws.onclose = () => {
      fiches.clear(); tampons.clear(); decalage = null; carte = []; monId = -1;
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
    /** Tous les joueurs de la salle (sauf soi), positions mises à jour toutes les 2 secondes. */
    joueurs(): JoueurCarte[] { return carte.filter((c) => c.id !== monId); },
    get monId() { return monId; },
    /** Pseudo retenu par le serveur (complété d'un numéro s'il était déjà pris). */
    get nom() { return nom; },
    /** Raison du dernier refus du serveur (pseudo réservé…). */
    get raison() { return raison; },
    /** Secondes de sourdine restantes après des signalements, 0 sinon. */
    get muet() { return Math.max(0, Math.ceil((muetJusqua - Date.now()) / 1000)); },
    /** Signale un joueur de la salle : au-delà d'un seuil de signalements, il est mis en sourdine. */
    signaler(id: number) { if (ws && ws.readyState === WebSocket.OPEN && statut === 'en-ligne') ws.send(JSON.stringify({ t: 'signaler', id })); },
    get messages(): readonly MessageJeu[] { return messages; },
    /** Le serveur a refusé un message trop rapproché il y a moins de 3 s. */
    get tropVite() { return performance.now() - tropVite < 3000; },
    /** Prévenu à chaque nouveau message (écrit ou vocal) ; renvoie de quoi se désabonner. */
    ecouter(f: (m: MessageJeu) => void) { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; },
    /** Message écrit à toute la salle ; il s'affiche quand le serveur le renvoie. */
    ecrire(txt: string) {
      const propre = nettoieMessage(txt);
      if (!propre || !ws || ws.readyState !== WebSocket.OPEN || statut !== 'en-ligne') return false;
      ws.send(JSON.stringify({ t: 'chat', txt: propre }));
      return true;
    },
    /** Trame de voix en direct (100 ms) : le serveur la relaie aux joueurs à moins de 5 m. */
    parler(audio: Uint8Array) {
      if (!ws || ws.readyState !== WebSocket.OPEN || statut !== 'en-ligne' || ws.bufferedAmount > 64_000) return false;
      ws.send(encodeTrameVoix(trame++ & 0xff, audio));
      return true;
    },
    /** Prévenu à chaque trame de voix reçue ; renvoie de quoi se désabonner. */
    ecouterVoix(f: (id: number, audio: Uint8Array) => void) { ecouteursVoix.add(f); return () => { ecouteursVoix.delete(f); }; },
    fermer() { fermeVolontaire = true; if (relance) clearTimeout(relance); ws?.close(); },
  };
}
export type Reseau = ReturnType<typeof creerReseau>;
export const genreIndex = (g: string) => Math.max(0, GENRES.indexOf(g as Genre));
export const genreNom = (i: number) => GENRES[i] ?? 'berline';
