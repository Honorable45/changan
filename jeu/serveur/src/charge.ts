/**
 * Essai de charge : N joueurs simulés se connectent, tournent en rond dans la ville et envoient leur état à 10 Hz.
 * node src/charge.ts [joueurs=500] [secondes=20] [url=ws://127.0.0.1:3005/ws]
 * Affiche ce que reçoivent les joueurs et les mesures du serveur (durée d'un instant, débit sortant).
 */
import WebSocket from 'ws';
import { FREQUENCE, VERSION, encodeEtat } from '../../partage/protocole.ts';

const N = Number(process.argv[2] ?? 500), SECONDES = Number(process.argv[3] ?? 20);
const URL_WS = process.argv[4] ?? 'ws://127.0.0.1:3005/ws';
const base = URL_WS.replace(/^ws/, 'http').replace(/\/ws$/, '');
let recus = 0, octets = 0, connectes = 0, refus = 0;
const robots: { ws: WebSocket; x: number; z: number; a: number; r: number }[] = [];

for (let i = 0; i < N; i++) {
  // Les robots se répartissent sur 3 km de côté, en groupes : certains se croisent, d'autres sont seuls.
  const ws = new WebSocket(URL_WS, { headers: { 'x-forwarded-for': `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` } });
  const r = { ws, x: ((i * 7919) % 3000) - 1500, z: ((i * 104729) % 3000) - 1500, a: i, r: 20 + (i % 40) };
  robots.push(r);
  ws.on('open', () => {
    connectes++;
    ws.send(JSON.stringify({ t: 'bonjour', v: VERSION, nom: `Robot ${i}`, apparence: { skin: 0x5a3a26, top: 0x2a6fb0, bottom: 0x22262c, hair: 0x120f0d, shoes: 0x1b1b1d, dress: false, cap: null } }));
  });
  ws.on('message', (data: Buffer) => { recus++; octets += data.byteLength; });
  ws.on('unexpected-response', () => refus++);
  ws.on('error', () => {});
  if (i % 50 === 49) await new Promise((res) => setTimeout(res, 50));
}

const envoi = setInterval(() => {
  for (const r of robots) {
    if (r.ws.readyState !== WebSocket.OPEN) continue;
    r.a += 0.05;
    r.ws.send(encodeEtat({ x: r.x + Math.cos(r.a) * r.r, z: r.z + Math.sin(r.a) * r.r, y: 0, cap: r.a, vitesse: 3, mode: 0, genre: 0, drapeaux: 0 }));
  }
}, 1000 / FREQUENCE);

await new Promise((res) => setTimeout(res, SECONDES * 1000));
clearInterval(envoi);
const metriques = await fetch(`${base}/metriques`).then((r) => r.text()).catch(() => '(métriques indisponibles)');
console.log(`${connectes}/${N} connectés, ${refus} refusés`);
console.log(`Reçu par joueur : ${(recus / Math.max(1, connectes) / SECONDES).toFixed(1)} messages/s, ${(octets / Math.max(1, connectes) / SECONDES / 1024).toFixed(2)} Kio/s`);
console.log(metriques.trim());
for (const r of robots) r.ws.terminate();
process.exit(0);
