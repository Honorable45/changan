// Tests de sécurité du jeu, après l'audit : adresse des joueurs, savoir partagé, modération, métriques, en-têtes, visage privé.
// Un serveur dédié est lancé avec les réglages de Render (adresse lue dans CF-Connecting-IP) : chaque test choisit l'adresse du « joueur ».
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const WebSocket = createRequire(new URL('../serveur/package.json', import.meta.url))('ws');
const { VERSION, encodeEtat, encodeTrameVoix, filtreGrossier } = await import('../partage/protocole.ts');
const { securite } = await import('../client/securite.mjs');
const BASE = process.env.E2E_JEU_URL ?? 'http://localhost:3004';
const PORT = 3997;
const HTTP = `http://127.0.0.1:${PORT}`;
const APPARENCE = { skin: 0x5a3a26, top: 0x9cc8ec, bottom: 0x17181b, hair: 0x120f0d, shoes: 0x111112, dress: false, cap: null };

let serveur, dossier;
before(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'jeu-securite-'));
  serveur = spawn(process.execPath, ['serveur/src/index.ts'], {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), IP_ENTETE: 'cf-connecting-ip', TRUST_PROXY: '1', CONNEXIONS_PAR_IP: '8', ARRIVEES_PAR_MINUTE: '30', SAVOIR_INTERVALLE_MS: '1', SAVOIR_FICHIER: join(dossier, 'savoir.json'), ORIGINES: '' },
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${HTTP}/sante`)).ok) return; } catch { /* démarrage */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('serveur de test non démarré');
});
after(() => { serveur?.kill(); if (dossier) rmSync(dossier, { recursive: true, force: true }); });

const attendre = async (f, ms = 5000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } throw new Error('délai dépassé'); };
/** Un joueur, vu par le serveur à l'adresse `ip` (posée comme Cloudflare le ferait), avec un X-Forwarded-For inventé à côté. */
function joueur(ip, nom, autresEntetes = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': `6.6.6.${Math.floor(Math.random() * 250)}`, ...autresEntetes } });
  const textes = [], voix = [];
  ws.on('message', (d, bin) => { if (bin) { if (d[0] === 3) voix.push(d); } else textes.push(JSON.parse(String(d))); });
  const ouvert = new Promise((res) => { ws.once('open', () => res(true)); ws.once('unexpected-response', (_q, r) => res(r.statusCode)); ws.once('error', () => res(false)); });
  const bonjour = () => ws.send(JSON.stringify({ t: 'bonjour', v: VERSION, nom, apparence: APPARENCE }));
  return { ws, textes, voix, ouvert, bonjour, recu: (t, ms) => attendre(() => textes.find((m) => m.t === t), ms) };
}
const post = (corps, ip) => fetch(`${HTTP}/savoir`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(corps) });

test('sécurité : l’adresse vient de CF-Connecting-IP ; un X-Forwarded-For inventé ne contourne plus la limite par adresse', async () => {
  const ouverts = [];
  for (let i = 0; i < 10; i++) { const j = joueur('41.207.1.1', `Bot ${i}`, { 'x-forwarded-for': `10.0.0.${i}` }); ouverts.push(j); await j.ouvert; }
  const resultats = await Promise.all(ouverts.map((j) => j.ouvert));
  assert.equal(resultats.filter((r) => r === true).length, 8, '8 connexions au plus par adresse');
  assert.equal(resultats.filter((r) => r === 429).length, 2);
  for (const j of ouverts) j.ws.terminate();
});

test('sécurité : une adresse qui se reconnecte en boucle est freinée (30 nouvelles connexions par minute)', async () => {
  let refus = 0;
  for (let i = 0; i < 34; i++) { const j = joueur('41.207.2.2', 'Boucle'); const r = await j.ouvert; if (r === 429) refus++; j.ws.terminate(); await new Promise((res) => setTimeout(res, 15)); }
  assert.ok(refus >= 3, `reconnexions au-delà de 30 refusées (${refus})`);
});

test('sécurité : pseudos réservés refusés, pseudos en double numérotés', async () => {
  for (const nom of ['Honorable', 'CHANGAN Officiel', 'Admin']) {
    const j = joueur(`41.207.3.${nom.length}`, nom);
    await j.ouvert; j.bonjour();
    assert.equal((await j.recu('refus')).raison, 'nom-reserve', `« ${nom} » refusé`);
    j.ws.terminate();
  }
  const a = joueur('41.207.4.1', 'Kofi'), b = joueur('41.207.4.2', 'KOFI'), c = joueur('41.207.4.3', 'Kofi 2');
  await Promise.all([a.ouvert, b.ouvert, c.ouvert]);
  a.bonjour(); assert.equal((await a.recu('bienvenue')).nom, 'Kofi');
  b.bonjour(); assert.equal((await b.recu('bienvenue')).nom, 'KOFI 2', 'même pseudo à la casse près : numéroté');
  c.bonjour(); assert.equal((await c.recu('bienvenue')).nom, 'Kofi 3', '« Kofi 2 » déjà pris à son tour');
  for (const j of [a, b, c]) j.ws.terminate();
});

test('sécurité : grossièretés masquées ; signalé par plusieurs joueurs, un joueur est mis en sourdine (écrit et voix)', async () => {
  assert.equal(filtreGrossier('Espèce de CONNARD, à la poste !'), 'Espèce de *******, à la poste !');
  assert.equal(filtreGrossier('une dispute sur le computer'), 'une dispute sur le computer');
  const [a, b, c] = [joueur('41.207.5.1', 'Troll'), joueur('41.207.5.2', 'Ama'), joueur('41.207.5.3', 'Yao')];
  await Promise.all([a.ouvert, b.ouvert, c.ouvert]);
  for (const j of [a, b, c]) j.bonjour();
  const wa = await a.recu('bienvenue'); await b.recu('bienvenue'); await c.recu('bienvenue');
  try {
    a.ws.send(JSON.stringify({ t: 'chat', txt: 'bande de salopes' }));
    assert.equal((await attendre(() => b.textes.find((m) => m.t === 'chat'))).txt, 'bande de *******');
    // Un seul signalement ne suffit pas (2 au moins) ; un même joueur ne compte qu'une fois.
    b.ws.send(JSON.stringify({ t: 'signaler', id: wa.id }));
    b.ws.send(JSON.stringify({ t: 'signaler', id: wa.id }));
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!a.textes.some((m) => m.t === 'muet'), 'pas de sourdine sur un seul signalement');
    c.ws.send(JSON.stringify({ t: 'signaler', id: wa.id }));
    assert.equal((await a.recu('muet')).secondes, 600, 'sourdine de 10 minutes');
    const avant = b.textes.filter((m) => m.t === 'chat').length;
    await new Promise((r) => setTimeout(r, 900));
    a.ws.send(JSON.stringify({ t: 'chat', txt: 'encore moi' }));
    for (const j of [a, b]) j.ws.send(encodeEtat({ x: 10, z: 10, y: 0, cap: 0, vitesse: 0, mode: 0, genre: 0, drapeaux: 0 }));
    await new Promise((r) => setTimeout(r, 200));
    a.ws.send(encodeTrameVoix(0, new Uint8Array(800)));
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(b.textes.filter((m) => m.t === 'chat').length, avant, 'ses messages écrits ne passent plus');
    assert.equal(b.voix.length, 0, 'sa voix non plus');
  } finally { for (const j of [a, b, c]) j.ws.terminate(); }
});

test('sécurité : savoir partagé, démonstration près d’un point critique seulement, un vote par adresse, quotas, réponse compressée', async () => {
  const pts = Array.from({ length: 120 }, (_, i) => [5000 + (i % 2) * 0.01, 1000 + i * 0.25, 1]);
  assert.equal((await post({ type: 'demo', id: 'loin', pts }, '41.207.6.1')).status, 422, 'aucun point critique ici : refusée');
  assert.equal((await post({ type: 'critique', critique: { x: 5000, z: 1010, heading: 0, cause: 'immobilise<script>' } }, '41.207.6.1')).status, 204);
  assert.equal((await post({ type: 'demo', id: 'pres', pts }, '41.207.6.1')).status, 204, 'près du point critique : acceptée');
  assert.equal((await post({ type: 'resultat', id: 'pres', ok: true }, '41.207.6.2')).status, 204);
  assert.equal((await post({ type: 'resultat', id: 'pres', ok: true }, '41.207.6.2')).status, 429, 'un seul vote par adresse');
  // Quota : 30 points critiques par heure et par adresse.
  let refus = 0;
  for (let i = 0; i < 33; i++) if ((await post({ type: 'critique', critique: { x: 6000 + i * 10, z: 0, heading: 0, cause: 'x' } }, '41.207.6.3')).status === 429) refus++;
  assert.equal(refus, 3, 'au-delà de 30 par heure : refusés');
  const r = await fetch(`${HTTP}/savoir`, { headers: { 'accept-encoding': 'gzip' } });
  const k = await r.json();
  const d = k.demos.find((x) => x.id === 'pres');
  assert.equal(d.ok, 1, 'le second vote n’a pas compté');
  assert.ok(d.pts.length <= 31, `points simplifiés à 1 m (${d.pts.length} au lieu de 120)`);
  assert.ok(d.pts.every((p) => Number.isInteger(Math.round(p[0] * 100)) && String(p[0]).length <= 8), 'coordonnées arrondies au centimètre');
  assert.equal(k.critiques.find((c) => c.x === 5000).cause, 'immobilisescript', 'cause nettoyée');
});

test('sécurité : métriques et diagnostic d’adresse fermés au public', async () => {
  assert.equal((await fetch(`${HTTP}/metriques`, { headers: { 'x-forwarded-for': '41.1.1.1' } })).status, 404, 'métriques cachées derrière un mandataire');
  assert.equal((await fetch(`${HTTP}/metriques`)).status, 200, 'mais lisibles en local');
  assert.equal((await fetch(`${HTTP}/qui`)).status, 404, 'diagnostic désactivé par défaut');
});

test('sécurité : les en-têtes de render.yaml et de Caddy sont ceux de securite.mjs, et le jeu local les applique', async () => {
  const render = readFileSync(join(racine, '../render.yaml'), 'utf8');
  const caddy = readFileSync(join(racine, '../deploy/Caddyfile'), 'utf8');
  for (const [nom, valeur] of Object.entries(securite({ connect: "'self' https://lome-jeu-serveur.onrender.com wss://lome-jeu-serveur.onrender.com" }))) assert.ok(render.includes(`name: ${nom}\n        value: "${valeur}"`), `render.yaml : ${nom}`);
  for (const [nom, valeur] of Object.entries(securite({ connect: "'self' wss://{$JEU_DOMAIN}" }))) assert.ok(caddy.includes(`${nom} "${valeur}"`), `Caddyfile : ${nom}`);
  const h = (await fetch(`${BASE}/`)).headers;
  assert.match(h.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(h.get('x-frame-options'), 'DENY');
  assert.match(h.get('permissions-policy') ?? '', /microphone=\(self\)/);
});

test('sécurité : le visage d’Honorable n’est jamais dans le build publiable', async () => {
  const dist = join(racine, 'client/dist/game/humains/visage-honorable.png');
  assert.ok(existsSync(join(racine, 'client/dist/index.html')), 'jeu compilé');
  assert.ok(!existsSync(dist), 'absent de dist/ : déposer dist/ sur un hébergeur ne le publie pas');
  const local = join(racine, 'client/public/game/humains/visage-honorable.png');
  if (existsSync(local)) assert.equal((await fetch(`${BASE}/game/humains/visage-honorable.png`)).status, 200, 'le jeu local le sert toujours depuis public/');
});
