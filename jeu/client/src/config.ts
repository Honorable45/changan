/**
 * Adresses du jeu, dans cet ordre de priorité :
 * 1. le fichier /config.json posé à côté du jeu, lu au démarrage : { "serveur": "wss://…/ws", "site": "https://…" }
 *    (on change d'hébergeur sans recompiler) ;
 * 2. les variables de compilation : VITE_SERVEUR_URL (ws:// ou wss://…/ws, « off » pour un jeu seul),
 *    VITE_SERVEUR_HOST (nom d'hôte seul, par exemple celui que donne Render : wss://<hôte>/ws), VITE_SITE_URL ;
 * 3. des valeurs de repli pour le réseau local (serveur sur le port 3005, site sur le port 3000).
 * Ce sont des liaisons vivantes : les modules qui les importent voient la valeur lue dans /config.json.
 */
const ici = typeof location === 'undefined' ? null : location;
const env = import.meta.env as Record<string, string | undefined>;

function defaultServer(): string | null {
  if (env.VITE_SERVEUR_URL === 'off') return null;
  if (env.VITE_SERVEUR_URL) return env.VITE_SERVEUR_URL;
  // Render donne parfois le nom court du service (« lome-jeu-serveur ») : on complète en adresse publique.
  if (env.VITE_SERVEUR_HOST) { const h = String(env.VITE_SERVEUR_HOST); return `wss://${h.includes('.') ? h : `${h}.onrender.com`}/ws`; }
  if (!ici) return null;
  // Même domaine, chemin /ws (Caddy) ; en local, le port 3005.
  return ici.port === '3004' ? `ws://${ici.hostname}:3005/ws` : `${ici.protocol === 'https:' ? 'wss' : 'ws'}://${ici.host}/ws`;
}
const savoirOf = (ws: string | null) => (ws ? ws.replace(/^ws/, 'http').replace(/\/ws$/, '/savoir') : null);

export let SITE_URL = env.VITE_SITE_URL ?? (ici ? `${ici.protocol}//${ici.hostname}:3000` : '');
export let SERVEUR_URL: string | null = defaultServer();
/** Savoir partagé de SMART AI (passages appris des joueurs) : sur le serveur du jeu, en HTTP. */
export let SAVOIR_URL: string | null = savoirOf(SERVEUR_URL);

/** Lit /config.json s'il existe ; sans lui (ou illisible), les valeurs ci-dessus restent. */
export async function loadRuntimeConfig() {
  try {
    const r = await fetch('/config.json', { cache: 'no-store' });
    if (!r.ok) return;
    const c = (await r.json()) as { serveur?: string | null; site?: string };
    if (c.serveur === null || c.serveur === 'off') { SERVEUR_URL = null; SAVOIR_URL = null; }
    else if (typeof c.serveur === 'string' && /^wss?:\/\//.test(c.serveur)) { SERVEUR_URL = c.serveur; SAVOIR_URL = savoirOf(c.serveur); }
    if (typeof c.site === 'string' && /^https?:\/\//.test(c.site)) SITE_URL = c.site.replace(/\/$/, '');
  } catch { /* pas de configuration : valeurs par défaut */ }
}
