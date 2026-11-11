/**
 * Serveur du jeu en ligne : présence et déplacements des joueurs, en temps réel.
 *
 * Chaque instance héberge des salles (des « sessions » de la ville) de CAPACITE_SALLE joueurs au plus.
 * Un joueur ne reçoit que ses voisins proches (RAYON_VOISINAGE, VOISINS_MAX) : le trafic reste constant
 * quelle que soit la taille de la salle. Les instances ne partagent rien : on en ajoute derrière le répartiteur
 * pour accueillir plus de monde (voir jeu/ARCHITECTURE.md).
 *
 * Le serveur ne simule pas la physique : chaque client calcule son personnage et envoie son état ;
 * le serveur le vérifie (format, limites du monde, débit) et le relaie aux voisins.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import {
  DRAPEAU, FREQUENCE, RAYON_VOISINAGE, TYPE_VOIX, VERSION, VOISINS_MAX, VOIX_MAX_OCTETS, decodeEtat, decodeVoixClient, encodeInstantane, encodeVoixRelais,
  nettoieMessage, nettoieNom, valideApparence, type Apparence, type DuServeur, type Etat, type EtatJoueur, type PointCarte,
} from '../../partage/protocole.ts';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { validCritical, validDemo, type Knowledge } from '../../partage/savoir.ts';

const nombre = (nom: string, defaut: number) => { const v = Number(process.env[nom]); return Number.isFinite(v) && v > 0 ? v : defaut; };
const PORT = nombre('PORT', 3005);
const MAX_JOUEURS = nombre('MAX_JOUEURS', 2000);
const CAPACITE_SALLE = nombre('CAPACITE_SALLE', 60);
const PAR_IP = nombre('CONNEXIONS_PAR_IP', 8);
/** Origines autorisées, séparées par des virgules ; vide : toutes (développement). */
const ORIGINES = (process.env.ORIGINES ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => (o.includes('://') ? o : `https://${o.includes('.') ? o : `${o}.onrender.com`}`)); // nom court Render → adresse publique
/** Origine autorisée ? Une entrée sans « https:// » (un nom d'hôte, comme Render le fournit) vaut https://nom. */
const origineOk = (o: string) => !ORIGINES.length || ORIGINES.includes(o);
/** Nombre de mandataires de confiance devant le serveur (Caddy : 1), pour lire la vraie adresse du joueur. */
const MANDATAIRES = nombre('TRUST_PROXY', 0);
const INSTANCE = process.env.INSTANCE ?? process.env.HOSTNAME ?? 'local';
/** Fichier du savoir partagé (solutions apprises des joueurs) ; plusieurs instances peuvent partager le même, par un volume. */
const SAVOIR_FICHIER = process.env.SAVOIR_FICHIER ?? new URL('../savoir.json', import.meta.url).pathname;

/*
 * Savoir partagé : les démonstrations (passages trouvés par les joueurs là où SMART AI restait bloquée), les points critiques,
 * et les réussites ou échecs de chaque démonstration rejouée. Fusionné avec le fichier toutes les 30 s.
 */
const savoir: Knowledge = { demos: [], critiques: [] };
let savoirModifie = false;
const fusionner = (k: Partial<Knowledge>) => {
  for (const d of k.demos ?? []) {
    if (!d || typeof d.id !== 'string' || !validDemo(d.pts)) continue;
    const ici = savoir.demos.find((x) => x.id === d.id);
    if (ici) { ici.ok = Math.max(ici.ok, d.ok | 0); ici.ko = Math.max(ici.ko, d.ko | 0); }
    else savoir.demos.push({ id: d.id.slice(0, 40), pts: d.pts, ok: Math.max(0, d.ok | 0), ko: Math.max(0, d.ko | 0), at: Number(d.at) || Date.now() });
  }
  for (const c of k.critiques ?? []) if (validCritical(c) && !savoir.critiques.some((x) => Math.hypot(x.x - c.x, x.z - c.z) < 6)) savoir.critiques.push({ ...c, at: Number(c.at) || Date.now() });
  // Les démonstrations qui échouent sans jamais réussir disparaissent ; on garde les 500 meilleures et 1 000 points critiques.
  savoir.demos = savoir.demos.filter((d) => !(d.ko >= 2 && d.ok === 0)).sort((a, b) => b.ok - b.ko - (a.ok - a.ko) || b.at - a.at).slice(0, 500);
  savoir.critiques = savoir.critiques.sort((a, b) => b.at - a.at).slice(0, 1000);
};
try { fusionner(JSON.parse(readFileSync(SAVOIR_FICHIER, 'utf8'))); } catch { /* premier démarrage : savoir vide */ }
const sauverSavoir = () => {
  if (!savoirModifie) { try { fusionner(JSON.parse(readFileSync(SAVOIR_FICHIER, 'utf8'))); } catch { /* fichier absent */ } return; }
  try { fusionner(JSON.parse(readFileSync(SAVOIR_FICHIER, 'utf8'))); } catch { /* fichier absent */ }
  // Écriture atomique : fichier temporaire, puis renommage.
  const tmp = `${SAVOIR_FICHIER}.${process.pid}.tmp`;
  try { writeFileSync(tmp, JSON.stringify(savoir)); renameSync(tmp, SAVOIR_FICHIER); savoirModifie = false; } catch (e) { console.error('savoir non enregistré', (e as Error).message); }
};
const envoisSavoir = new Map<string, number>();

type Joueur = {
  id: number; ws: WebSocket; ip: string; nom: string | null; apparence: Apparence | null; etat: Etat | null;
  salle: Salle | null; vus: Set<number>; jetons: number; abus: number; vivant: boolean;
  /** Messages écrits : un toutes les 0,8 s au plus. Voix : budget d'octets, rechargé de 2 Ko par seconde (une minute de parole sur trois). */
  dernierChat: number; budgetVoix: number;
  /** Dernière position connue hors des bâtiments, pour la carte (dans un bâtiment, le joueur est loin, dans un intérieur). */
  dehors: { x: number; z: number } | null;
};
type Message = { id: number; nom: string; txt: string; at: number };
type Salle = { nom: string; joueurs: Set<Joueur>; historique: Message[] };
const BUDGET_VOIX = 120_000;

const joueurs = new Set<Joueur>();
const salles: Salle[] = [];
const parIp = new Map<string, number>();
const libres: number[] = [];
let prochainId = 1;
let numeroSalle = 1;
const stats = { tickMoyen: 0, tickMax: 0, octetsParSeconde: 0, refusDebit: 0, octetsVoix: 0 };

function nouvelId() {
  if (libres.length) return libres.pop()!;
  if (prochainId > 65535) return -1;
  return prochainId++;
}

/** Remplit d'abord les salles déjà animées, pour que les joueurs se croisent ; en ouvre une quand toutes sont pleines. */
function choisirSalle(): Salle {
  let meilleure: Salle | null = null;
  for (const s of salles) if (s.joueurs.size < CAPACITE_SALLE && (!meilleure || s.joueurs.size > meilleure.joueurs.size)) meilleure = s;
  if (meilleure) return meilleure;
  const s: Salle = { nom: `${INSTANCE}-${numeroSalle++}`, joueurs: new Set(), historique: [] };
  salles.push(s);
  return s;
}

const envoyer = (j: Joueur, m: DuServeur) => { if (j.ws.readyState === j.ws.OPEN) j.ws.send(JSON.stringify(m)); };

function adresse(req: IncomingMessage) {
  const relais = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (MANDATAIRES && relais.length >= MANDATAIRES ? relais[relais.length - MANDATAIRES] : req.socket.remoteAddress) ?? '?';
}

function quitter(j: Joueur) {
  if (!joueurs.delete(j)) return;
  parIp.set(j.ip, (parIp.get(j.ip) ?? 1) - 1);
  if (!parIp.get(j.ip)) parIp.delete(j.ip);
  const s = j.salle;
  if (s) {
    s.joueurs.delete(j);
    for (const autre of s.joueurs) if (autre.vus.delete(j.id)) envoyer(autre, { t: 'depart', id: j.id });
    // Une salle vide disparaît, sauf la première, toujours prête.
    if (!s.joueurs.size && salles.length > 1) salles.splice(salles.indexOf(s), 1);
  }
  libres.unshift(j.id);
}

function recevoir(j: Joueur, data: RawData, binaire: boolean) {
  // Seau de jetons : 30 messages par seconde en moyenne, rafales de 60 tolérées.
  if (--j.jetons < 0) {
    stats.refusDebit++;
    if (++j.abus > 200) j.ws.close(1008, 'debit');
    return;
  }
  const buf = data as Buffer;
  if (binaire) {
    if (!j.salle) return;
    if (buf[0] === TYPE_VOIX) { relayerVoix(j, buf); return; }
    if (buf.byteLength > 64) return;
    const etat = decodeEtat(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
    if (etat) { j.etat = etat; if (!(etat.drapeaux & DRAPEAU.dedans)) j.dehors = { x: etat.x, z: etat.z }; }
    return;
  }
  // Seuls les messages vocaux peuvent être gros ; un texte de plus de 2 Ko est un abus.
  if (buf.byteLength > 2048) { j.ws.close(1009, 'taille'); return; }
  let m: { t?: unknown; v?: unknown; nom?: unknown; apparence?: unknown; txt?: unknown };
  try { m = JSON.parse(String(data)); } catch { j.ws.close(1003, 'json'); return; }
  if (j.salle) { if (m.t === 'chat') discuter(j, m.txt); return; }
  if (m.t !== 'bonjour') return;
  if (m.v !== VERSION) { envoyer(j, { t: 'refus', raison: 'version' }); j.ws.close(4000, 'version'); return; }
  const nom = nettoieNom(m.nom), apparence = valideApparence(m.apparence);
  if (!nom) { envoyer(j, { t: 'refus', raison: 'nom' }); j.ws.close(4001, 'nom'); return; }
  if (!apparence) { envoyer(j, { t: 'refus', raison: 'apparence' }); j.ws.close(4002, 'apparence'); return; }
  j.nom = nom;
  j.apparence = apparence;
  const salle = choisirSalle();
  salle.joueurs.add(j);
  j.salle = salle;
  envoyer(j, { t: 'bienvenue', id: j.id, salle: salle.nom, joueurs: salle.joueurs.size });
  if (salle.historique.length) envoyer(j, { t: 'historique', m: salle.historique });
  envoyer(j, { t: 'carte', j: carteDe(salle) });
}

/** Message écrit : nettoyé, limité en débit, envoyé à toute la salle et gardé dans les 30 derniers. Rien n'est écrit sur disque. */
function discuter(j: Joueur, txt: unknown) {
  const s = j.salle, now = Date.now();
  const propre = nettoieMessage(txt);
  if (!s || !propre) return;
  if (now - j.dernierChat < 800) { envoyer(j, { t: 'trop-vite' }); return; }
  j.dernierChat = now;
  const m: Message = { id: j.id, nom: j.nom!, txt: propre, at: now };
  s.historique.push(m);
  if (s.historique.length > 30) s.historique.shift();
  const texte = JSON.stringify({ t: 'chat', ...m } satisfies DuServeur);
  for (const o of s.joueurs) if (o.ws.readyState === o.ws.OPEN && o.ws.bufferedAmount < 512_000) o.ws.send(texte);
}

/** Message vocal : relayé tel quel aux autres joueurs de la salle, jamais enregistré. Le budget limite la parole à une minute sur trois. */
function relayerVoix(j: Joueur, buf: Buffer) {
  const s = j.salle;
  const v = decodeVoixClient(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  if (!s || !v) return;
  if (v.audio.byteLength > j.budgetVoix) { envoyer(j, { t: 'trop-vite' }); return; }
  j.budgetVoix -= v.audio.byteLength;
  const relais = encodeVoixRelais(j.id, v.format, v.audio);
  stats.octetsVoix += relais.byteLength * (s.joueurs.size - 1);
  for (const o of s.joueurs) if (o !== j && o.ws.readyState === o.ws.OPEN && o.ws.bufferedAmount < 512_000) o.ws.send(relais);
}

/** Les joueurs de la salle sur la carte : position au mètre près, la dernière prise dehors pour ceux qui sont dans un bâtiment. */
function carteDe(s: Salle): PointCarte[] {
  const out: PointCarte[] = [];
  for (const o of s.joueurs) if (o.dehors && o.etat) out.push([o.id, o.nom!, Math.round(o.dehors.x), Math.round(o.dehors.z), o.etat.drapeaux & DRAPEAU.dedans ? 1 : 0]);
  return out;
}

const http = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/savoir') {
    // Le client du jeu peut être servi d'un autre port ou d'un autre domaine : CORS limité aux origines autorisées.
    const origin = String(req.headers.origin ?? '');
    res.setHeader('Access-Control-Allow-Origin', !ORIGINES.length ? '*' : origineOk(origin) ? origin : ORIGINES[0]!);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=30' }); res.end(JSON.stringify(savoir)); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    // Un envoi toutes les 2 secondes au plus par adresse, 64 Ko au plus.
    const ip = adresse(req), now = Date.now();
    if (now - (envoisSavoir.get(ip) ?? 0) < 2000) { res.writeHead(429).end(); return; }
    envoisSavoir.set(ip, now);
    let body = '', trop = false;
    req.on('data', (c: Buffer) => { body += c; if (body.length > 65536) { trop = true; req.destroy(); } });
    req.on('end', () => {
      if (trop) return;
      let m: { type?: unknown; pts?: unknown; id?: unknown; ok?: unknown; critique?: unknown };
      try { m = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      if (m.type === 'demo' && validDemo(m.pts) && typeof m.id === 'string') fusionner({ demos: [{ id: m.id, pts: m.pts, ok: 0, ko: 0, at: now }] });
      else if (m.type === 'critique' && validCritical(m.critique)) fusionner({ critiques: [{ ...m.critique, at: now }] });
      else if (m.type === 'resultat' && typeof m.id === 'string' && typeof m.ok === 'boolean') { const d = savoir.demos.find((x) => x.id === m.id); if (d) { if (m.ok) d.ok++; else d.ko++; fusionner({}); } }
      else { res.writeHead(400).end(); return; }
      savoirModifie = true;
      res.writeHead(204).end();
    });
    return;
  }
  if (url === '/') {
    // Page d'accueil : quelqu'un qui ouvre l'adresse du serveur voit qu'il fonctionne, plutôt qu'une erreur vide.
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`Serveur du jeu Lomé : en marche (${joueurs.size} joueur${joueurs.size > 1 ? 's' : ''} en ligne).\nCe n'est pas le jeu : ouvrez l'adresse du site du jeu (service lome-jeu).\n`);
    return;
  }
  if (url === '/sante') {
    // Le répartiteur retire une instance pleine ou en arrêt de la rotation.
    const ok = !arret && joueurs.size < MAX_JOUEURS;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok, instance: INSTANCE, joueurs: joueurs.size, salles: salles.length, capacite: MAX_JOUEURS }));
    return;
  }
  if (url === '/metriques') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    res.end([
      `jeu_joueurs ${joueurs.size}`, `jeu_salles ${salles.length}`, `jeu_tick_ms_moyen ${stats.tickMoyen.toFixed(3)}`,
      `jeu_tick_ms_max ${stats.tickMax.toFixed(3)}`, `jeu_octets_sortants_par_seconde ${Math.round(stats.octetsParSeconde)}`, `jeu_refus_debit_total ${stats.refusDebit}`, `jeu_voix_octets_total ${stats.octetsVoix}`, '',
    ].join('\n'));
    return;
  }
  res.writeHead(404).end();
});

// Les messages vocaux sont les seuls gros messages ; le reste est vérifié à 2 Ko dans recevoir().
const wss = new WebSocketServer({ noServer: true, maxPayload: VOIX_MAX_OCTETS + 16, perMessageDeflate: false, clientTracking: false });
let arret = false;

http.on('upgrade', (req, socket, head) => {
  const refuser = (code: number) => { socket.write(`HTTP/1.1 ${code} Refus\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  if ((req.url ?? '').split('?')[0] !== '/ws') return refuser(404);
  if (!origineOk(String(req.headers.origin))) return refuser(403);
  if (arret || joueurs.size >= MAX_JOUEURS) return refuser(503);
  const ip = adresse(req);
  if ((parIp.get(ip) ?? 0) >= PAR_IP) return refuser(429);
  const id = nouvelId();
  if (id < 0) return refuser(503);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const j: Joueur = { id, ws, ip, nom: null, apparence: null, etat: null, salle: null, vus: new Set(), jetons: 60, abus: 0, vivant: true, dernierChat: 0, budgetVoix: BUDGET_VOIX, dehors: null };
    joueurs.add(j);
    parIp.set(ip, (parIp.get(ip) ?? 0) + 1);
    ws.binaryType = 'nodebuffer';
    ws.on('message', (data, binaire) => recevoir(j, data, binaire));
    ws.on('pong', () => { j.vivant = true; });
    ws.on('close', () => quitter(j));
    ws.on('error', () => ws.terminate());
    // Sans présentation dans les 5 secondes, la connexion est fermée.
    setTimeout(() => { if (!j.salle && ws.readyState === ws.OPEN) ws.close(4003, 'silence'); }, 5000).unref();
  });
});

/** Un instant du monde : pour chaque joueur, ses voisins les plus proches, et les arrivées ou départs depuis le précédent. */
function tick() {
  const debut = performance.now();
  const horloge = Date.now();
  let octets = 0;
  for (const s of salles) {
    // Grille de RAYON_VOISINAGE : les voisins d'un joueur sont dans les 9 cases autour de la sienne.
    const grille = new Map<string, Joueur[]>();
    for (const j of s.joueurs) {
      if (!j.etat || j.etat.drapeaux & DRAPEAU.dedans) continue;
      const k = `${Math.floor(j.etat.x / RAYON_VOISINAGE)},${Math.floor(j.etat.z / RAYON_VOISINAGE)}`;
      const l = grille.get(k);
      if (l) l.push(j); else grille.set(k, [j]);
    }
    for (const j of s.joueurs) {
      if (j.ws.bufferedAmount > 2_000_000) { j.ws.terminate(); continue; }
      const e = j.etat;
      const proches: { j: Joueur; d: number }[] = [];
      if (e && !(e.drapeaux & DRAPEAU.dedans)) {
        const cx = Math.floor(e.x / RAYON_VOISINAGE), cz = Math.floor(e.z / RAYON_VOISINAGE);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          for (const o of grille.get(`${cx + dx},${cz + dz}`) ?? []) {
            if (o === j) continue;
            const d = Math.hypot(o.etat!.x - e.x, o.etat!.z - e.z);
            if (d <= RAYON_VOISINAGE) proches.push({ j: o, d });
          }
        }
        if (proches.length > VOISINS_MAX) { proches.sort((a, b) => a.d - b.d); proches.length = VOISINS_MAX; }
      }
      const ids = new Set(proches.map((p) => p.j.id));
      for (const id of j.vus) if (!ids.has(id)) { j.vus.delete(id); envoyer(j, { t: 'depart', id }); }
      for (const p of proches) if (!j.vus.has(p.j.id)) { j.vus.add(p.j.id); envoyer(j, { t: 'arrivee', id: p.j.id, nom: p.j.nom!, apparence: p.j.apparence! }); }
      // Un client lent ne reçoit plus d'instantané tant que son tampon ne s'est pas vidé.
      if (!proches.length || j.ws.bufferedAmount > 256_000) continue;
      const liste: EtatJoueur[] = proches.map((p) => ({ id: p.j.id, ...p.j.etat! }));
      const msg = encodeInstantane(liste, horloge);
      octets += msg.byteLength;
      j.ws.send(msg);
    }
  }
  for (const j of joueurs) { j.jetons = Math.min(60, j.jetons + 30 / FREQUENCE); j.budgetVoix = Math.min(BUDGET_VOIX, j.budgetVoix + 2000 / FREQUENCE); }
  const duree = performance.now() - debut;
  stats.tickMoyen += (duree - stats.tickMoyen) * 0.05;
  stats.tickMax = Math.max(stats.tickMax * 0.995, duree);
  stats.octetsParSeconde += (octets * FREQUENCE - stats.octetsParSeconde) * 0.05;
}
const boucle = setInterval(tick, 1000 / FREQUENCE);

const sauvegarde = setInterval(sauverSavoir, 30000);
setInterval(() => { const t = Date.now(); for (const [ip, at] of envoisSavoir) if (t - at > 60000) envoisSavoir.delete(ip); }, 60000).unref();

// Population et carte des joueurs de la salle, toutes les 2 secondes (une seule sérialisation par salle).
const population = setInterval(() => {
  for (const s of salles) {
    const carte = JSON.stringify({ t: 'carte', j: carteDe(s) } satisfies DuServeur);
    for (const j of s.joueurs) {
      envoyer(j, { t: 'population', salle: s.joueurs.size, total: joueurs.size });
      if (j.ws.readyState === j.ws.OPEN && j.ws.bufferedAmount < 256_000) j.ws.send(carte);
    }
  }
}, 2000);

// Battement : une connexion muette pendant 30 secondes est coupée.
const battement = setInterval(() => {
  for (const j of joueurs) {
    if (!j.vivant) { j.ws.terminate(); continue; }
    j.vivant = false;
    j.ws.ping();
  }
}, 15000);

/** Arrêt propre : plus de nouvelles connexions, puis chaque joueur est prévenu et se reconnecte ailleurs. */
function arreter() {
  if (arret) return;
  arret = true;
  for (const j of joueurs) { envoyer(j, { t: 'au-revoir' }); j.ws.close(1001, 'arret'); }
  clearInterval(boucle); clearInterval(population); clearInterval(battement); clearInterval(sauvegarde);
  sauverSavoir();
  setTimeout(() => process.exit(0), 3000).unref();
  http.close();
}
process.on('SIGTERM', arreter);
process.on('SIGINT', arreter);

http.listen(PORT, () => console.log(`Serveur du jeu ${INSTANCE} : ws://0.0.0.0:${PORT}/ws, ${MAX_JOUEURS} joueurs au plus, salles de ${CAPACITE_SALLE}`));
