// Jeu : parcours réels dans Chrome (rendu 3D logiciel) et logique du jeu, plus le serveur en ligne.
// Prérequis : client du jeu servi (pnpm --filter jeu-client start, port 3004) et serveur du jeu (pnpm --filter jeu-serveur start, port 3005).
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_JEU_URL ?? 'http://localhost:3004';
const SERVEUR = process.env.E2E_JEU_SERVEUR ?? 'ws://127.0.0.1:3005/ws';
const WebSocket = createRequire(new URL('../serveur/package.json', import.meta.url))('ws');

let glBrowser;
after(() => glBrowser?.close());

async function page(width = 1440, { webgl, ...opts } = {}) {
  glBrowser ??= await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await glBrowser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(`exception: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/40[01]/.test(m.text()) && !/status of 404/.test(m.text()) && !/WebSocket/.test(m.text())) p.errors.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 500 || r.status() === 404) p.errors.push(`${r.status()} ${r.url()}`); });
  return p;
}

test('essai virtuel : sur téléphone droit, la partie attend le passage à l\'horizontale', { timeout: 120000 }, async () => {
  const p = await page(390, { webgl: true, hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 }, screen: { width: 390, height: 800 } });
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).tap();
  const message = p.getByText('Tournez votre téléphone');
  await message.waitFor({ timeout: 120000 });
  await p.setViewportSize({ width: 800, height: 390 });
  await message.waitFor({ state: 'detached' });
  await p.getByRole('button', { name: 'Start' }).tap();
  const z = () => p.evaluate(() => +document.querySelector('#jeu').dataset.z);
  await p.getByRole('button', { name: 'Accélérateur', exact: true }).waitFor();
  await p.setViewportSize({ width: 390, height: 800 });
  await message.waitFor();
  const before = await z();
  await p.waitForTimeout(1500);
  assert.equal(await z(), before, 'le jeu est en pause tant que le téléphone est droit');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel : volant et pédales tactiles, frein puis marche arrière', { timeout: 180000 }, async () => {
  const p = await page(800, { webgl: true, hasTouch: true, isMobile: true, viewport: { width: 800, height: 390 }, screen: { width: 800, height: 390 } });
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).tap();
  await p.getByRole('button', { name: 'Start' }).tap();
  const read = () => p.evaluate(() => { const d = document.querySelector('#jeu').dataset; return { heading: +d.heading, speed: +d.speed, z: +d.z }; });
  for (const name of ['Frein', 'Accélérateur']) {
    const b = await p.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 800 && b.y + b.height <= 390, `${name} visible`);
  }
  const hold = async (name, ms) => {
    const b = await p.getByRole('button', { name, exact: true }).boundingBox();
    const cdp = await p.context().newCDPSession(p);
    const point = [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    await p.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await hold('Accélérateur', 2500);
  assert.ok((await read()).speed > 5, 'la pédale fait avancer');
  await hold('Frein', 3000);
  const stopped = await read();
  assert.equal(stopped.speed, 0, 'le frein maintenu immobilise sans reculer');
  await hold('Frein', 2500);
  const after = await read();
  assert.ok(after.z < stopped.z, 'un nouvel appui passe en marche arrière');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel : Honorable marche, court, saute, monte en voiture et en redescend', { timeout: 300000 }, async () => {
  const p = await page(640, { webgl: true, viewport: { width: 640, height: 360 } });
  await p.goto(`${BASE}/`);
  // Un seul bouton « Jouer » : Honorable part au volant, et descend avec E.
  await p.getByRole('button', { name: 'Jouer', exact: true }).click();
  await p.locator('#jeu[data-mode="car"]').waitFor({ timeout: 120000 });
  await p.keyboard.press('e');
  const jeu = p.locator('#jeu');
  await p.locator('#jeu[data-mode="foot"]').waitFor({ timeout: 120000 });
  const read = () => p.evaluate(() => { const d = document.querySelector('#jeu').dataset; return { x: +d.x, z: +d.z, mode: d.mode, speed: +d.speed }; });
  // Au départ, Honorable est à côté de la voiture : l'action proposée est d'y monter.
  await p.getByRole('button', { name: 'Monter dans la Nevo Q05' }).waitFor({ timeout: 60000 });
  const start = await read();
  // Le rendu logiciel des tests est lent : on attend un effet mesurable plutôt qu'une durée.
  await p.keyboard.down('KeyW');
  await p.keyboard.down('ShiftLeft');
  await p.waitForFunction(() => +document.querySelector('#jeu').dataset.speed > 12, null, { timeout: 60000 });
  await p.keyboard.up('ShiftLeft');
  await p.keyboard.press('Space');
  await p.waitForFunction(([x, z]) => { const d = document.querySelector('#jeu').dataset; return Math.hypot(+d.x - x, +d.z - z) > 2; }, [start.x, start.z], { timeout: 60000 });
  await p.keyboard.up('KeyW');
  assert.equal((await read()).mode, 'foot');
  // Retour à la voiture, montée, puis descente à l'arrêt.
  await p.keyboard.down('KeyS');
  await p.getByRole('button', { name: 'Monter dans la Nevo Q05' }).waitFor({ timeout: 60000 });
  await p.keyboard.up('KeyS');
  await p.keyboard.press('KeyE');
  await p.locator('#jeu[data-mode="car"]').waitFor();
  await p.getByRole('button', { name: 'Descendre' }).waitFor();
  await p.keyboard.press('KeyE');
  await p.locator('#jeu[data-mode="foot"]').waitFor();
  assert.equal(await jeu.getAttribute('data-vehicle'), 'Nevo Q05');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel, ville imaginaire : le parcours se termine au clavier, avec feu, clignotants et stationnement', { timeout: 420000 }, async () => {
  const p = await page(640, { webgl: true, hasTouch: true, viewport: { width: 640, height: 360 } });
  await p.goto(`${BASE}/`);
  // Parcours guidé noté, dans la ville imaginaire : accessible par lien depuis le bouton unique « Jouer ».
  await p.goto(`${BASE}/?ville=imaginaire&mode=parcours`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).click();
  await p.getByRole('button', { name: 'Start' }).click();
  const read = () => p.evaluate(() => {
    const d = document.querySelector('#jeu').dataset;
    return { x: +d.x, z: +d.z, heading: +d.heading, speed: +d.speed, step: +d.step, hits: +d.hits, reds: +d.reds, signals: +d.signals };
  });
  const held = new Set();
  const hold = async (code, on) => {
    if (on === held.has(code)) return;
    if (on) { held.add(code); await p.keyboard.down(code); } else { held.delete(code); await p.keyboard.up(code); }
  };
  // Le pilote vise chaque point du parcours à faible vitesse. Clignotant avant les virages.
  const route = { 1: [-3, -106], 2: [-3, -92], 3: [-3, -92, -7, -83, -40, -83], 4: [-72, -83, -83, -72, -83, -40], 5: [-83, -8, -72, 3, -40, 3], 6: [28, 3], 7: [40, 3, 40, 22] };
  const signal = { 3: 'j', 4: 'g', 5: 'g' };
  const start = Date.now();
  let lastStep = 0, cursor = 0, done = false;
  while (Date.now() - start < 300000) {
    if (await p.getByRole('heading', { name: /pts/ }).count()) { done = true; break; }
    const s = await read();
    if (s.step !== lastStep) {
      lastStep = s.step; cursor = 0;
      if (signal[s.step]) await p.keyboard.press(signal[s.step]);
    }
    const r = route[s.step];
    if (!r) break;
    if (cursor + 3 < r.length && Math.hypot(r[cursor] - s.x, r[cursor + 1] - s.z) < 6) cursor += 2;
    const tx = r[cursor], tz = r[cursor + 1];
    const dist = Math.hypot(tx - s.x, tz - s.z);
    const err = Math.atan2(Math.sin(Math.atan2(tx - s.x, tz - s.z) - s.heading), Math.cos(Math.atan2(tx - s.x, tz - s.z) - s.heading));
    await hold('ArrowLeft', err > 0.06);
    await hold('ArrowRight', err < -0.06);
    const stopping = s.step === 2 || (s.step === 7 && cursor === 2 && Math.abs(s.z - 22) < 2.5);
    const target = stopping ? 0 : s.step === 7 || Math.abs(err) > 0.3 ? 10 : 22;
    await hold('ArrowUp', s.speed < target);
    await hold('ArrowDown', s.speed > target + 3 || stopping);
  }
  for (const code of held) await p.keyboard.up(code);
  assert.ok(done, `parcours terminé (dernière étape ${lastStep}, ${JSON.stringify(await read())})`);
  const final = await read();
  assert.equal(final.signals, 3, 'les trois clignotants sont comptés');
  assert.ok(Math.abs(final.z - 22) < 3.6 && Math.abs(final.x - 40) < 2.2, 'la voiture est sur la place');
  // Le jeu vit à part : le lien mène au formulaire du site de la concession.
  assert.match(await p.getByRole('link', { name: 'Réserver un vrai essai' }).getAttribute('href'), /^https?:\/\/[^/]+\/contact\?demande=essai$/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel, Lomé : le vrai parcours mène à l\'IAI-Togo, de bout en bout', { timeout: 120000 }, async () => {
  // Le pilote roule sur la logique du jeu, sans rendu : le trajet est complet en quelques secondes.
  const { GameSim, pointInPoly } = await import('../client/src/moteur/sim.ts');
  const map = await (await fetch(`${BASE}/game/lome.json`)).json();
  const iai = map.buildings.find((b) => b.n === map.iai);
  assert.ok(iai?.hole, 'immeuble de l\'IAI présent, avec sa cour');
  assert.ok(map.iaiFence.length > 40, 'clôture du CENETI présente');
  assert.ok(map.casefFence.length > 40, 'clôture du CASEF présente');
  for (const sig of ['utbTower', 'utbBase', 'poste', 'orabank', 'postes', 'pompiers', 'casefMain', 'casefLow', 'casefRound', 'bsic', 'sunu', 'ahodikpe', 'folyana', 'champion', 'metro', 'fifty', 'cofina', 'gozem']) assert.ok(map.buildings.some((b) => b.sig === sig), `${sig} placé`);
  assert.ok(map.buildings.some((b) => b.n === 'CASEF'), 'CASEF nommé');
  assert.ok(map.buildings.some((b) => b.n === 'Hôtel 2 Février'), 'hôtel présent');
  assert.ok(Math.min(...iai.p.map((q) => Math.hypot(map.park.x - q[0], map.park.z - q[1]))) < 60, 'l\'arrivée est devant l\'IAI');
  const world = {
    kind: 'lome', start: map.start, steps: map.steps, park: map.park, nodes: map.nodes, edges: map.edges, junctions: map.junctions,
    colliders: [...map.buildings.map((b) => b.p), ...map.walls.map(([a, b]) => [a, b, [b[0] + 0.1, b[1] + 0.1], [a[0] + 0.1, a[1] + 0.1]])],
    inBounds: (x, z) => pointInPoly(x, z, map.boundary) || map.boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) < 400),
    mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, false, 0);
  sim.startEngine();
  const route = map.route;
  let cursor = 0, steer = 0;
  for (let t = 0; t < 900 * 60 && !sim.result; t++) {
    const c = sim.car;
    const step = world.steps[sim.step];
    if (step?.signal && sim.indicator !== step.signal) sim.setIndicator(step.signal);
    while (cursor < route.length - 1 && Math.hypot(route[cursor][0] - c.x, route[cursor][1] - c.z) < 8) cursor++;
    const [tx, tz] = route[cursor];
    const aim = Math.atan2(tx - c.x, tz - c.z);
    const err = Math.atan2(Math.sin(aim - c.heading), Math.cos(aim - c.heading));
    steer = Math.max(-1, Math.min(1, -err * 2.5));
    const toPark = Math.hypot(map.park.x - c.x, map.park.z - c.z);
    // Comme un conducteur : il s'arrête à tout feu rouge devant lui, pas seulement à celui de l'étape.
    const redAhead = map.junctions.some((j, i) => {
      const d = Math.hypot(j.x - c.x, j.z - c.z);
      const ahead = (j.x - c.x) * Math.sin(c.heading) + (j.z - c.z) * Math.cos(c.heading);
      return d > j.r && d < j.r + 14 && ahead > 0 && sim.lightAt(i, c.heading) !== 'green';
    });
    const stopping = redAhead || (step?.kind === 'stop' && Math.hypot(step.x - c.x, step.z - c.z) < 8) || (step?.kind === 'park' && toPark < 2.5);
    const want = stopping ? 0 : (step?.kind === 'park' && toPark < 30) || Math.abs(err) > 0.3 ? 4 : 10;
    sim.update(1 / 60, { throttle: c.speed < want ? 1 : 0, brake: stopping || c.speed > want + 1 ? 1 : 0, steer });
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z), 'position valide');
  }
  assert.ok(sim.result, `arrivée atteinte (étape ${sim.step}/${world.steps.length}, ${JSON.stringify(sim.car)})`);
  assert.equal(sim.result.signals, sim.signalTotal, 'tous les clignotants sont comptés');
  assert.equal(sim.result.reds, 0, 'le feu du parcours a été respecté');
  assert.equal(sim.result.hits, 0, 'le tracé ne traverse aucun bâtiment ni mur');
});

test('essai virtuel, Lomé : la partie démarre devant l\'IAI en conduite libre, sans erreur', { timeout: 180000 }, async () => {
  const p = await page(640, { webgl: true, hasTouch: true, viewport: { width: 640, height: 360 } });
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).click();
  await p.getByRole('button', { name: 'Start' }).click({ timeout: 120000 });
  await p.waitForFunction(() => document.querySelector('#jeu')?.dataset.x, null, { timeout: 30000 });
  const hud = await p.locator('#jeu').textContent();
  assert.match(hud, /Conduite libre/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel, Lomé : un itinéraire calculé mène au lieu cherché, et se recalcule', { timeout: 120000 }, async () => {
  const { GameSim, pointInPoly } = await import('../client/src/moteur/sim.ts');
  const { planNav, navStatus, searchPlaces } = await import('../client/src/moteur/nav.ts');
  const map = await (await fetch(`${BASE}/game/lome.json`)).json();
  const places = map.buildings.filter((b) => b.n).map((b) => ({ name: b.n, kind: 'lieu', x: b.p[0][0], z: b.p[0][1], rank: b.n === map.iai ? 10 : 0 }));
  assert.equal(searchPlaces(places, 'iai')[0].name, map.iai, 'recherche de l\'IAI');
  assert.equal(searchPlaces(places, 'MAIRIE lome')[0].name, 'Mairie de Lomé', 'recherche sans casse');
  assert.equal(searchPlaces(places, 'ministere').length > 0, true, 'recherche sans accents');
  assert.equal(searchPlaces(places, 'zzzz').length, 0, 'aucun résultat inventé');
  const world = {
    kind: 'lome', start: map.start, steps: [], park: map.park, nodes: map.nodes, edges: map.edges, junctions: map.junctions,
    colliders: map.buildings.map((b) => b.p), inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  for (const target of places.filter((p) => ['Mairie de Lomé', 'Gare de Lomé', map.iai].includes(p.name))) {
    const sim = new GameSim(world, true, 0);
    sim.startEngine();
    const nav = planNav(world, sim.car, target);
    assert.ok(nav && nav.length > 50, `itinéraire vers ${target.name}`);
    for (const e of nav.line) assert.ok(Number.isFinite(e[0]) && Number.isFinite(e[1]));
    let arrived = false, cursor = 0;
    for (let t = 0; t < 600 * 60 && !arrived; t++) {
      const c = sim.car;
      const st = navStatus(nav, c.x, c.z);
      arrived = st.remaining < 8 || Math.hypot(target.x - c.x, target.z - c.z) < 28;
      // Vise le tracé de près : couper les virages reviendrait à rouler sur les trottoirs et les angles de bâtiments.
      while (cursor < nav.line.length - 1 && Math.hypot(nav.line[cursor][0] - c.x, nav.line[cursor][1] - c.z) < 6) cursor++;
      const aim = Math.atan2(nav.line[cursor][0] - c.x, nav.line[cursor][1] - c.z);
      const err = Math.atan2(Math.sin(aim - c.heading), Math.cos(aim - c.heading));
      const want = Math.abs(err) > 0.3 ? 4 : 10;
      sim.update(1 / 60, { throttle: c.speed < want ? 1 : 0, brake: c.speed > want + 1 ? 1 : 0, steer: Math.max(-1, Math.min(1, -err * 2.5)) });
    }
    assert.ok(arrived, `${target.name} atteint (${JSON.stringify(sim.car)})`);
    assert.equal(sim.hits, 0, `aucun choc en suivant l\'itinéraire vers ${target.name}`);
    const again = planNav(world, { x: sim.car.x, z: sim.car.z, heading: sim.car.heading }, places[0]);
    assert.ok(again, 'un nouvel itinéraire peut partir de n\'importe où');
  }
  assert.ok(pointInPoly(0, 0, map.boundary), 'le monument est dans le quartier');
});

test('essai virtuel, Lomé : sur téléphone, chercher IAI affiche l\'itinéraire', { timeout: 180000 }, async () => {
  const p = await page(800, { webgl: true, hasTouch: true, isMobile: true, viewport: { width: 800, height: 390 }, screen: { width: 800, height: 390 } });
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).tap();
  await p.getByRole('button', { name: 'Start' }).tap({ timeout: 120000 });
  await p.getByRole('button', { name: 'Rechercher' }).tap();
  await p.getByRole('searchbox').fill('iai');
  await p.getByRole('dialog').getByRole('button', { name: /IAI-Togo/ }).tap();
  const panel = p.getByTestId('itineraire');
  await panel.waitFor();
  assert.match(await panel.textContent(), /Vers IAI-Togo.*km/);
  await p.getByRole('button', { name: 'Annuler l’itinéraire' }).tap();
  await panel.waitFor({ state: 'detached' });
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('essai virtuel, Lomé : Honorable entre au Champion, prend un article, danse ; les voitures du Car Kit sont servies', { timeout: 120000 }, async () => {
  const { GameSim, pointInPoly } = await import('../client/src/moteur/sim.ts');
  const map = await (await fetch(`${BASE}/game/lome.json`)).json();
  for (const f of ['sedan-sports', 'hatchback-sports', 'suv-luxury', 'taxi', 'van']) assert.equal((await fetch(`${BASE}/game/voitures/${f}.glb`)).status, 200, `${f}.glb servi`);
  assert.equal((await fetch(`${BASE}/game/voitures/Textures/colormap.png`)).status, 200, 'palette servie');
  const shop = map.buildings.find((b) => /champion/i.test(b.n ?? ''));
  assert.ok(shop, 'Champion présent sur la carte');
  const world = {
    kind: 'lome', start: map.start, freeStart: map.start, steps: map.steps, park: map.park, nodes: map.nodes, edges: map.edges, junctions: map.junctions,
    colliders: map.buildings.map((b) => b.p), rooms: map.buildings.filter((b) => b.p.length >= 3).map((b) => ({ p: b.p, n: b.n ?? null })),
    inBounds: (x, z) => pointInPoly(x, z, map.boundary) || map.boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) < 400),
    mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, true, 0, { parked: true, foot: true });
  assert.ok(sim.parked.some((p) => p.kind === 'sportive'), 'une sportive est garée près du départ');
  // Devant le mur nord du magasin, face à lui.
  const [a, b] = [shop.p[0], shop.p[1]];
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
  if (pointInPoly(mx + nx * 2, mz + nz * 2, shop.p)) { nx = -nx; nz = -nz; }
  Object.assign(sim.hero, { x: mx + nx * 1, z: mz + nz * 1, heading: Math.atan2(-nx, -nz) });
  assert.match(sim.action?.label ?? '', /Champion/);
  sim.act();
  assert.ok(/champion/i.test(sim.pendingRoom?.n ?? ''), 'le rendu doit ouvrir le magasin');
  sim.enterRoom({ name: shop.n, x0: 0, z0: 0, x1: 30, z1: 24, solids: [], door: [15, 0.6], spawn: { x: 15, z: 2.6, heading: 0 }, spots: [{ x: 10, z: 10, r: 1.3, id: 'p:riz', label: 'Prendre : Riz parfumé 5 kg · 4 500 F' }, { x: 20, z: 5, r: 1.3, id: 'caisse', label: '' }] });
  Object.assign(sim.hero, { x: 10, z: 9.5 });
  assert.equal(sim.action?.kind, 'use');
  sim.act();
  assert.equal(sim.used, 'p:riz');
  Object.assign(sim.hero, { x: 20, z: 5 });
  assert.equal(sim.action, null, 'caisse sans libellé tant que le panier est vide');
  sim.dance();
  assert.equal(sim.hero.dance, 1);
  sim.update(0.1, { throttle: 0, brake: 0, steer: 0 });
  assert.equal(sim.hero.dance, 1, 'la danse continue à l’arrêt');
  sim.update(0.1, { throttle: 1, brake: 0, steer: 0 });
  assert.equal(sim.hero.dance, 0, 'marcher arrête la danse');
});

test('essai virtuel : conduite libre sans limitation, jusqu’à 300 km/h ; avancer plus de 3 s fait courir Honorable', async () => {
  const { GameSim, VEHICLES } = await import('../client/src/moteur/sim.ts');
  const world = { kind: 'grid', start: { x: 0, z: 0, heading: 0 }, steps: [{ kind: 'ignite', text: '', x: 0, z: 0 }], park: { x: 0, z: 0, heading: 0, halfW: 1, halfL: 2 }, nodes: [], edges: [{ a: 0, b: 1, p: [[0, 0], [0, 100]], l: -5, r: 5 }], junctions: [], colliders: [], inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '' };
  // L'hélicoptère ne roule pas : son vol a son propre test.
  for (const kind of Object.keys(VEHICLES).filter((k) => k !== 'helico')) {
    const sim = new GameSim(world, true, 0);
    sim.car.kind = kind;
    sim.startEngine();
    const events = [];
    for (let i = 0; i < 60 * 40; i++) { sim.update(1 / 60, { throttle: 1, brake: 0, steer: 0 }); events.push(...sim.drain()); }
    assert.ok(sim.car.speed * 3.6 >= 249, `${kind} atteint au moins 250 km/h (${Math.round(sim.car.speed * 3.6)})`);
    assert.ok(!events.includes('speed'), `${kind} : pas d'amende en conduite libre`);
  }
  const sim = new GameSim(world, true, 0, { foot: true });
  for (let i = 0; i < 60 * 2.5; i++) sim.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  assert.equal(sim.hero.run, false, 'il marche encore à 2,5 s');
  for (let i = 0; i < 60; i++) sim.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  assert.equal(sim.hero.run, true, 'il court après 3 s');
});

test('essai virtuel, Lomé : l’hélicoptère décolle de son aire, vole, se pose au sol ou sur un toit', async () => {
  const { GameSim, pointInPoly } = await import('../client/src/moteur/sim.ts');
  const map = await (await fetch(`${BASE}/game/lome.json`)).json();
  const world = {
    kind: 'lome', start: map.start, freeStart: { x: map.park.x, z: map.park.z, heading: map.park.heading }, steps: map.steps, park: map.park, nodes: map.nodes, edges: map.edges, junctions: map.junctions,
    colliders: map.buildings.map((b) => b.p), colliderHeights: map.buildings.map((b) => b.h), helipad: [515, -520],
    inBounds: (x, z) => pointInPoly(x, z, map.boundary) || map.boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) < 400), mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, true, 0, { parked: true, foot: true });
  const heli = sim.parked.find((p) => p.kind === 'helico');
  assert.ok(heli && sim.helipad, 'hélicoptère posé sur son aire');
  Object.assign(sim.hero, { x: heli.x + 3, z: heli.z });
  assert.equal(sim.action?.label, 'Monter dans l’hélicoptère');
  sim.act();
  const run = (sec, inp) => { for (let i = 0; i < sec * 60; i++) sim.update(1 / 60, { throttle: 0, brake: 0, steer: 0, ...inp }); };
  run(1, { throttle: 1 });
  assert.ok(Math.abs(sim.car.speed) < 0.1, 'au sol, il n’avance pas');
  run(4, { lift: 1 });
  assert.ok(sim.car.y > 20, `il monte (${sim.car.y.toFixed(1)} m)`);
  assert.equal(sim.action, null, 'on ne descend pas en vol');
  run(8, { throttle: 1, lift: 0.3 });
  assert.ok(sim.car.speed * 3.6 > 200, 'il vole vite');
  run(20, { lift: -1, brake: 0.3 });
  assert.equal(sim.car.y, 0);
  const roof = map.buildings.find((b) => b.n === 'Hôtel AHODIKPE') ?? map.buildings.find((b) => b.h > 15);
  const cx = roof.p.reduce((s, q) => s + q[0], 0) / roof.p.length, cz = roof.p.reduce((s, q) => s + q[1], 0) / roof.p.length;
  Object.assign(sim.car, { x: cx, z: cz, y: roof.h + 10, speed: 0 });
  run(6, { lift: -1 });
  assert.equal(sim.car.y, roof.h, 'posé sur le toit');
});

/* Jeu en ligne */
const { VERSION, VOIX_MAX_OCTETS, encodeEtat, encodeVoix, decodeVoixRelais, decodeInstantane, decodeEtat, encodeInstantane, nettoieNom, nettoieMessage } = await import('../partage/protocole.ts');
const APPARENCE = { skin: 0x5a3a26, top: 0x9cc8ec, bottom: 0x17181b, hair: 0x120f0d, shoes: 0x111112, dress: false, cap: null, tie: 0x0c0c0e };

function client(nom = 'Essai') {
  const ws = new WebSocket(SERVEUR);
  const textes = [], instantanes = [], voix = [];
  ws.on('message', (data, binaire) => {
    if (binaire && data[0] === 3) voix.push(decodeVoixRelais(new Uint8Array(data)));
    else if (binaire) instantanes.push(decodeInstantane(new DataView(data.buffer, data.byteOffset, data.byteLength)));
    else textes.push(JSON.parse(String(data)));
  });
  const ouvert = new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const attendre = async (test, ms = 5000) => { const fin = Date.now() + ms; while (Date.now() < fin) { const m = test(); if (m) return m; await new Promise((r) => setTimeout(r, 30)); } throw new Error('délai dépassé'); };
  return { ws, textes, instantanes, voix, ouvert, attendre, bonjour: () => ws.send(JSON.stringify({ t: 'bonjour', v: VERSION, nom, apparence: APPARENCE })) };
}

test('jeu en ligne : le protocole binaire se relit à l’identique et refuse les messages invalides', () => {
  const e = { x: 512.25, z: -480.5, y: 23, cap: 1.5, vitesse: -3.21, mode: 1, genre: 7, drapeaux: 9 };
  const lu = decodeEtat(new DataView(encodeEtat(e)));
  assert.ok(Math.abs(lu.x - e.x) < 1e-3 && Math.abs(lu.cap - e.cap) < 1e-3 && lu.vitesse === -3.21 && lu.genre === 7 && lu.drapeaux === 9);
  const bad = new DataView(encodeEtat({ ...e, x: Number.NaN }));
  assert.equal(decodeEtat(bad), null, 'NaN refusé');
  assert.equal(decodeEtat(new DataView(encodeEtat({ ...e, x: 1e6 }))), null, 'hors du monde refusé');
  assert.equal(decodeEtat(new DataView(new ArrayBuffer(5))), null, 'taille fausse refusée');
  const snap = decodeInstantane(new DataView(encodeInstantane([{ ...e, id: 42 }], 123456).buffer));
  assert.equal(snap.liste[0].id, 42);
  assert.equal(nettoieNom('  <b>Ama</b>  '), 'bAmab');
  assert.equal(nettoieNom('x'), null);
});

test('jeu en ligne : deux joueurs proches se voient, un départ est annoncé, un pseudo invalide est refusé', async () => {
  const sante = await (await fetch(SERVEUR.replace(/^ws/, 'http').replace(/\/ws$/, '/sante'))).json();
  assert.equal(sante.ok, true, 'serveur du jeu prêt');
  const a = client('Ama'), b = client('Kofi');
  await Promise.all([a.ouvert, b.ouvert]);
  a.bonjour(); b.bonjour();
  const [wa, wb] = await Promise.all([a.attendre(() => a.textes.find((m) => m.t === 'bienvenue')), b.attendre(() => b.textes.find((m) => m.t === 'bienvenue'))]);
  assert.equal(wa.salle, wb.salle, 'mis dans la même salle');
  const bouger = setInterval(() => {
    a.ws.send(encodeEtat({ x: 600, z: -500, y: 0, cap: 0, vitesse: 1, mode: 0, genre: 0, drapeaux: 0 }));
    b.ws.send(encodeEtat({ x: 610, z: -505, y: 0, cap: 0, vitesse: 1, mode: 0, genre: 0, drapeaux: 0 }));
  }, 100);
  try {
    const arrivee = await a.attendre(() => a.textes.find((m) => m.t === 'arrivee' && m.id === wb.id));
    assert.equal(arrivee.nom, 'Kofi');
    const vu = await a.attendre(() => a.instantanes.find((s) => s?.liste.some((e) => e.id === wb.id)));
    const e = vu.liste.find((x) => x.id === wb.id);
    assert.ok(Math.abs(e.x - 610) < 0.01 && Math.abs(e.z + 505) < 0.01, 'position relayée');
    b.ws.close();
    await a.attendre(() => a.textes.find((m) => m.t === 'depart' && m.id === wb.id));
  } finally { clearInterval(bouger); a.ws.close(); }
  const c = client('x');
  await c.ouvert;
  c.bonjour();
  assert.equal((await c.attendre(() => c.textes.find((m) => m.t === 'refus'))).raison, 'nom');
});

test('communication : messages écrits à toute la salle, nettoyés, limités en débit, et historique pour l’arrivant', async () => {
  assert.equal(nettoieMessage('  Salut\u0000 \n la  ville  '), 'Salut la ville');
  assert.equal(nettoieMessage('   '), null);
  assert.equal(nettoieMessage('a'.repeat(500)).length, 200);
  const a = client('Afi'), b = client('Yao');
  await Promise.all([a.ouvert, b.ouvert]);
  a.bonjour(); b.bonjour();
  const wa = await a.attendre(() => a.textes.find((m) => m.t === 'bienvenue'));
  await b.attendre(() => b.textes.find((m) => m.t === 'bienvenue'));
  try {
    a.ws.send(JSON.stringify({ t: 'chat', txt: 'On se retrouve\u0007 devant l’IAI ?' }));
    const recu = await b.attendre(() => b.textes.find((m) => m.t === 'chat'));
    assert.equal(recu.nom, 'Afi'); assert.equal(recu.id, wa.id); assert.equal(recu.txt, 'On se retrouve devant l’IAI ?');
    await a.attendre(() => a.textes.find((m) => m.t === 'chat'), 2000); // l'auteur reçoit sa confirmation
    a.ws.send(JSON.stringify({ t: 'chat', txt: 'trop vite' }));
    await a.attendre(() => a.textes.find((m) => m.t === 'trop-vite'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(b.textes.filter((m) => m.t === 'chat').length, 1, 'le message trop rapproché n’est pas diffusé');
    // Un texte de plus de 2 Ko ferme la connexion de l'abuseur.
    const c = client('Abuseur');
    await c.ouvert; c.bonjour(); await c.attendre(() => c.textes.find((m) => m.t === 'bienvenue'));
    const ferme = new Promise((r) => c.ws.once('close', (code) => r(code)));
    c.ws.send(JSON.stringify({ t: 'chat', txt: 'x'.repeat(5000) }));
    assert.equal(await ferme, 1009);
    // Un nouvel arrivant reçoit les derniers messages de sa salle.
    const d = client('Esi');
    await d.ouvert; d.bonjour();
    const h = await d.attendre(() => d.textes.find((m) => m.t === 'historique'));
    assert.ok(h.m.some((m) => m.txt === 'On se retrouve devant l’IAI ?'));
    d.ws.close();
  } finally { a.ws.close(); b.ws.close(); }
});

test('communication : la carte donne la position de tous les joueurs de la salle, même loin et dans un bâtiment', async () => {
  const a = client('Carte A'), b = client('Carte B');
  await Promise.all([a.ouvert, b.ouvert]);
  a.bonjour(); b.bonjour();
  const wb = await b.attendre(() => b.textes.find((m) => m.t === 'bienvenue'));
  await a.attendre(() => a.textes.find((m) => m.t === 'bienvenue'));
  try {
    // B est à 3 km de A : hors du voisinage (400 m), mais sur la carte.
    a.ws.send(encodeEtat({ x: 0, z: 0, y: 0, cap: 0, vitesse: 0, mode: 0, genre: 0, drapeaux: 0 }));
    b.ws.send(encodeEtat({ x: 2900.4, z: -800.6, y: 0, cap: 0, vitesse: 0, mode: 1, genre: 2, drapeaux: 0 }));
    const vu = await a.attendre(() => a.textes.findLast((m) => m.t === 'carte' && m.j.some((p) => p[0] === wb.id)), 5000);
    assert.deepEqual(vu.j.find((p) => p[0] === wb.id), [wb.id, 'Carte B', 2900, -801, 0]);
    // Dans un bâtiment (intérieur loin de la ville) : la carte garde la dernière position dehors.
    b.ws.send(encodeEtat({ x: 9000, z: 9000, y: 0, cap: 0, vitesse: 0, mode: 0, genre: 0, drapeaux: 16 }));
    const n = a.textes.length;
    const dedans = await a.attendre(() => a.textes.slice(n).find((m) => m.t === 'carte' && m.j.some((p) => p[0] === wb.id && p[4] === 1)), 5000);
    assert.deepEqual(dedans.j.find((p) => p[0] === wb.id), [wb.id, 'Carte B', 2900, -801, 1]);
  } finally { a.ws.close(); b.ws.close(); }
});

test('communication : un message vocal est relayé aux autres joueurs, jamais à l’auteur, et la parole est limitée', async () => {
  const a = client('Voix A'), b = client('Voix B');
  await Promise.all([a.ouvert, b.ouvert]);
  a.bonjour(); b.bonjour();
  const wa = await a.attendre(() => a.textes.find((m) => m.t === 'bienvenue'));
  await b.attendre(() => b.textes.find((m) => m.t === 'bienvenue'));
  try {
    const audio = new Uint8Array(20000).map((_, i) => i % 251);
    a.ws.send(encodeVoix(0, audio));
    const v = await b.attendre(() => b.voix[0]);
    assert.equal(v.id, wa.id); assert.equal(v.format, 0);
    assert.deepEqual(Buffer.from(v.audio), Buffer.from(audio), 'audio relayé à l’octet près');
    // Trop lourd : ignoré.
    a.ws.send(encodeVoix(0, new Uint8Array(VOIX_MAX_OCTETS + 1)));
    // Budget : 120 Ko d'un coup au plus, puis 2 Ko par seconde. 20 Ko déjà dits, 5 de plus passent, le 6e est refusé.
    for (let i = 0; i < 7; i++) a.ws.send(encodeVoix(0, new Uint8Array(20000)));
    await a.attendre(() => a.textes.find((m) => m.t === 'trop-vite'));
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(b.voix.length, 6, 'relais limités par le budget');
    assert.ok(b.voix.every((x) => x.audio.byteLength <= VOIX_MAX_OCTETS));
    assert.equal(a.voix.length, 0, 'l’auteur ne reçoit pas sa propre voix');
  } finally { a.ws.close(); b.ws.close(); }
});

test('jeu en ligne : deux navigateurs dans Lomé se voient, se situent, s’écrivent et se parlent', { timeout: 420000 }, async () => {
  const pages = [await page(960, { webgl: true }), await page(960, { webgl: true })];
  for (const [i, p] of pages.entries()) {
    await p.goto(`${BASE}/`);
    await p.getByLabel('Votre pseudo, vu par les autres joueurs').fill(`Testeur ${i + 1}`);
    await p.getByRole('button', { name: 'Jouer', exact: true }).click();
  }
  for (const p of pages) {
    await p.locator('#jeu[data-online="en-ligne"]').waitFor({ timeout: 180000 });
    await p.waitForFunction(() => +document.querySelector('#jeu').dataset.voisins >= 1, null, { timeout: 120000 });
  }
  const [p1, p2] = pages;
  // Liste des joueurs : l'autre, sa distance, et « Y aller » trace l'itinéraire jusqu'à lui.
  await p1.getByTestId('bouton-joueurs').click();
  const ligne = p1.getByTestId('joueur').filter({ hasText: 'Testeur 2' });
  await ligne.waitFor({ timeout: 30000 });
  assert.match(await ligne.innerText(), /\d+ m/);
  await ligne.getByRole('button', { name: 'Y aller' }).click();
  await p1.getByTestId('itineraire').waitFor({ timeout: 10000 });
  assert.match(await p1.getByTestId('itineraire').innerText(), /Testeur 2/);
  // Message écrit : Y ouvre la discussion, Entrée envoie ; l'autre le voit à l'écran puis dans sa discussion.
  await p1.locator('#jeu').click({ position: { x: 480, y: 450 } });
  await p1.keyboard.press('y');
  await p1.getByLabel('Message à tous les joueurs').fill('Salut Testeur 2, rendez-vous au Champion !');
  await p1.keyboard.press('Enter');
  await p1.getByTestId('message').filter({ hasText: 'rendez-vous au Champion' }).waitFor({ timeout: 10000 });
  await p2.getByTestId('messages-recents').filter({ hasText: 'rendez-vous au Champion' }).waitFor({ timeout: 10000 });
  await p2.getByTestId('bouton-discussion').click();
  await p2.getByTestId('message').filter({ hasText: 'Testeur 1' }).waitFor();
  // Message vocal, micro de test de Chrome : maintenir 1,5 s, relâcher ; l'autre le reçoit et l'entend.
  const micro = p1.getByTestId('bouton-micro');
  const boite = await micro.boundingBox();
  await p1.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await p1.mouse.down();
  await p1.getByTestId('voix-etat').filter({ hasText: 'Enregistrement' }).waitFor({ timeout: 10000 });
  await p1.waitForTimeout(1500);
  await p1.mouse.up();
  await p2.getByTestId('message').filter({ hasText: 'Message vocal' }).waitFor({ timeout: 15000 });
  await p2.getByTestId('voix-etat').filter({ hasText: 'Testeur 1 parle' }).waitFor({ timeout: 10000 });
  for (const p of pages) { assert.deepEqual(p.errors, []); await p.context().close(); }
});

test('SMART AI dans le jeu : le bouton prend le volant, le tableau de bord s’affiche, un second clic rend la main', { timeout: 300000 }, async () => {
  const p = await page(1280, { webgl: true });
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Jouer', exact: true }).click();
  await p.getByRole('button', { name: 'Start' }).click({ timeout: 120000 });
  const bouton = p.getByTestId('smart-ai');
  await bouton.waitFor();
  assert.equal((await bouton.textContent()).trim(), 'SMART AI : OFF');
  await bouton.click();
  await p.locator('#jeu[data-smart="on"]').waitFor();
  assert.equal((await bouton.textContent()).trim(), 'SMART AI : ON');
  const panneau = p.getByTestId('smart-ai-panneau');
  await panneau.waitFor();
  assert.match(await panneau.textContent(), /SMART AI : ACTIVÉE.*Objet détecté.*Danger.*Décision.*Action/s);
  // Sans aucune touche, la voiture roule d'elle-même.
  const read = () => p.evaluate(() => { const d = document.querySelector('#jeu').dataset; return { x: +d.x, z: +d.z, speed: +d.speed }; });
  const before = await read();
  await p.waitForFunction(([x, z]) => { const d = document.querySelector('#jeu').dataset; return Math.hypot(+d.x - x, +d.z - z) > 8; }, [before.x, before.z], { timeout: 120000 });
  // Cadres de détection autour des personnes et des objets perçus.
  await p.waitForFunction(() => +document.querySelector('[data-testid=cadres-ia]')?.dataset.cadres >= 1, null, { timeout: 120000 });
  await bouton.click();
  await p.locator('#jeu[data-smart="off"]').waitFor();
  assert.equal(await panneau.count(), 0, 'tableau de bord fermé');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('savoir partagé : le serveur accepte une démonstration valide, refuse le reste, et la restitue', async () => {
  const base = SERVEUR.replace(/^ws/, 'http').replace(/\/ws$/, '/savoir');
  const pts = Array.from({ length: 40 }, (_, i) => [5000 + Math.random(), i, 1]);
  const id = `test${Date.now()}`;
  const ok = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.1' }, body: JSON.stringify({ type: 'demo', id, pts }) });
  assert.equal(ok.status, 204);
  await new Promise((r) => setTimeout(r, 2100));
  const bad = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'demo', id: 'x', pts: [[0, 0, 1], [0, 90, 1]] }) });
  assert.equal(bad.status, 400, 'démonstration invraisemblable refusée');
  const k = await (await fetch(base)).json();
  assert.ok(k.demos.some((d) => d.id === id), 'démonstration restituée à tous les joueurs');
});
