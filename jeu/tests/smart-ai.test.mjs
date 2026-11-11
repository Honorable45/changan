// SMART AI : conduite autonome, éprouvée sur la simulation du jeu (sans rendu), avec de vrais piétons, véhicules, obstacles et nids-de-poule.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { GameSim } = await import('../client/src/moteur/sim.ts');
const { SmartAIController } = await import('../client/src/moteur/smart-ai/controller.ts');

/** Une rue droite à double sens, de 800 m : voies à 2 m de l'axe, chaussée de 8 m. On roule vers +z, sur la voie x = −2. */
function road({ colliders = [], potholes = [], junctions = [], impassable = [] } = {}) {
  const world = {
    kind: 'grid', start: { x: -2, z: 10, heading: 0 }, steps: [{ kind: 'ignite', text: '', x: 0, z: 0 }], park: { x: 0, z: 0, heading: 0, halfW: 1, halfL: 2 },
    nodes: [[0, 0], [0, 800]], edges: [{ a: 0, b: 1, p: [[0, 0], [0, 800]], l: 2, r: 4 }, { a: 1, b: 0, p: [[0, 800], [0, 0]], l: 2, r: 4 }],
    junctions, colliders, potholes, impassable, inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, true, 0);
  sim.startEngine();
  const ai = new SmartAIController(sim);
  const events = [];
  const step = (seconds, manual = { throttle: 0, brake: 0, steer: 0 }, each) => {
    for (let i = 0; i < seconds * 60; i++) {
      const input = ai.update(sim, 1 / 60) ?? manual;
      sim.update(1 / 60, input);
      events.push(...sim.drain());
      each?.();
    }
  };
  return { sim, ai, events, step };
}
const pieton = (x, z, target, cruise = 0) => ({ x, z, heading: 0, speed: 0, cruise, look: 0, targets: [target], edge: 0, wait: 0, phase: 0 });
const kmh = (sim) => sim.car.speed * 3.6;
const front = (sim) => sim.car.z + 2.0;

test('SMART AI 1 : désactivée, le véhicule obéit au joueur comme avant', () => {
  const { sim, ai, step } = road();
  assert.equal(ai.active, false);
  assert.equal(ai.update(sim, 1 / 60), null, 'aucune commande de l’IA');
  step(3, { throttle: 1, brake: 0, steer: 0 });
  assert.ok(kmh(sim) > 30, `le joueur accélère (${kmh(sim).toFixed(0)} km/h)`);
  assert.ok(Math.abs(sim.car.heading) < 1e-6, 'aucun coup de volant');
});

// Rue de 4,6 m entre deux murs : aucun passage possible à côté d'un piéton.
const narrowWalls = [[[-4.6, 0], [-4.3, 0], [-4.3, 400], [-4.6, 400]], [[0.3, 0], [0.6, 0], [0.6, 400], [0.3, 400]]];

test('SMART AI 4 (exigé) : piéton qui bloque complètement le passage, arrêt et attente, puis reprise quand il est parti', () => {
  const { sim, ai, events, step } = road({ colliders: narrowWalls });
  sim.walkers.push(pieton(-2, 90, [-2, 1000]));
  ai.setActive(true, sim);
  let closest = Infinity, maxSpeed = 0, bypassed = false;
  step(25, undefined, () => {
    closest = Math.min(closest, Math.hypot(sim.walkers[0].x - sim.car.x, sim.walkers[0].z - sim.car.z) - 2);
    maxSpeed = Math.max(maxSpeed, kmh(sim));
    if (ai.lastDecision?.action === 'CONTOURNER') bypassed = true;
  });
  assert.ok(maxSpeed > 35, `il roule d’abord (${maxSpeed.toFixed(0)} km/h)`);
  assert.ok(!bypassed, 'aucun contournement : il n’y a pas la place');
  assert.ok(sim.car.speed < 0.3, `arrêté (${kmh(sim).toFixed(1)} km/h)`);
  assert.ok(closest > 1.5, `distance gardée (${closest.toFixed(1)} m)`);
  assert.equal(ai.status.objet, 'PIÉTON');
  assert.ok(!events.includes('walker') && !events.includes('hit'), 'aucun choc');
  // Le piéton s'en va : la voie se libère, le véhicule repart de lui-même.
  Object.assign(sim.walkers[0], { x: -2, z: 400 });
  step(8);
  assert.ok(kmh(sim) > 20, `reprise automatique (${kmh(sim).toFixed(0)} km/h)`);
});

test('SMART AI : piéton arrêté sur la voie avec de la place, contourné largement puis retour dans la voie', () => {
  const { sim, ai, events, step } = road();
  sim.walkers.push(pieton(-2, 90, [-2, 1000]));
  ai.setActive(true, sim);
  let closest = Infinity, bypassed = false, slowEnough = true;
  step(30, undefined, () => {
    const w = sim.walkers[0];
    const d = Math.hypot(w.x - sim.car.x, w.z - sim.car.z);
    closest = Math.min(closest, d);
    if (ai.lastDecision?.action === 'CONTOURNER') bypassed = true;
    if (d < 4 && kmh(sim) > 14) slowEnough = false;
  });
  assert.ok(bypassed, 'contournement du piéton');
  assert.ok(closest > 2.3, `passé largement (${closest.toFixed(1)} m du centre)`);
  assert.ok(slowEnough, 'au pas près du piéton');
  assert.ok(sim.car.z > 130 && Math.abs(sim.car.x + 2) < 0.6, `retour dans la voie (x ${sim.car.x.toFixed(2)}, z ${sim.car.z.toFixed(0)})`);
  assert.ok(!events.includes('walker') && !events.includes('hit'));
});

test('SMART AI 3 (exigé) : piéton qui traverse, le véhicule le laisse passer sans le toucher', () => {
  const { sim, ai, events, step } = road();
  sim.walkers.push(pieton(-7, 75, [7, 75], 1.3));
  ai.setActive(true, sim);
  let closest = Infinity, braked = false;
  step(30, undefined, () => {
    const w = sim.walkers[0];
    closest = Math.min(closest, Math.hypot(w.x - sim.car.x, w.z - sim.car.z));
    if (['FREINER', 'ARRET'].includes(ai.lastDecision?.action) && ai.lastDecision.threat?.det.cls === 'pieton') braked = true;
  });
  assert.ok(braked, 'freinage pour le piéton');
  assert.ok(closest > 2, `distance gardée (${closest.toFixed(1)} m)`);
  assert.ok(sim.car.z > 100, 'il est reparti après le passage');
  assert.ok(!events.includes('walker') && !events.includes('hit'));
});

test('SMART AI 3 : moto lente devant, le véhicule ralentit et garde ses distances', () => {
  const { sim, ai, events, step } = road();
  sim.traffic.push({ x: -2, z: 70, heading: 0, speed: 5, cruise: 5, color: 0, targets: [[-2, 790]], edge: 0, kind: 'moto' });
  ai.setActive(true, sim);
  let minGap = Infinity;
  step(30, undefined, () => { const m = sim.traffic[0]; minGap = Math.min(minGap, m.z - 0.9 - front(sim)); });
  const m = sim.traffic[0];
  assert.ok(Math.abs(sim.car.speed - m.speed) < 1.5, `vitesse calée sur la moto (${kmh(sim).toFixed(0)} contre ${(m.speed * 3.6).toFixed(0)} km/h)`);
  assert.ok(minGap > 5, `distance de sécurité (${minGap.toFixed(1)} m)`);
  assert.ok(['RALENTIR', 'CONTINUER', 'FREINER'].includes(ai.lastDecision.action));
  assert.match(ai.status.objet, /MOTO/);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 4 : un mur barre toute la rue, arrêt avant lui, puis demi-tour pour rebrousser chemin', () => {
  const wall = [[-8, 120], [8, 120], [8, 121], [-8, 121]];
  const { sim, ai, events, step } = road({ colliders: [wall] });
  ai.setActive(true, sim);
  let stoppedBefore = false, closest = Infinity, sawUturn = false, fled = false;
  step(40, undefined, () => {
    closest = Math.min(closest, 120 - front(sim));
    if (sim.car.speed < 0.3 && sim.car.z > 80 && Math.cos(sim.car.heading) > 0.9) stoppedBefore = true;
    if (ai.status.decision === 'DEMI-TOUR') sawUturn = true;
    // Rebrousser chemin : retourné, il roule vers l'entrée de la rue.
    if (Math.cos(sim.car.heading) < -0.8 && kmh(sim) > 15 && sim.car.z < 100) fled = true;
  });
  assert.ok(stoppedBefore, 'arrêt devant le mur');
  assert.ok(closest > 0.5, `mur jamais touché (${closest.toFixed(1)} m)`);
  assert.ok(sawUturn, 'décision : demi-tour');
  assert.ok(fled, 'il repart dans l’autre sens');
  assert.ok(!events.includes('hit'));
});

test('SMART AI : impasse entre deux murs, demi-tour en plusieurs fois sans rien toucher', () => {
  // Rue de 8 m de large bordée de murs, fermée au bout : le demi-tour d'une traite est impossible.
  const walls = [[[-4.6, 0], [-4.3, 0], [-4.3, 160], [-4.6, 160]], [[4.3, 0], [4.6, 0], [4.6, 160], [4.3, 160]], [[-5, 160], [5, 160], [5, 161], [-5, 161]]];
  const { sim, ai, events, step } = road({ colliders: walls });
  sim.world.edges[0].p = [[0, 0], [0, 150]]; sim.world.edges[1].p = [[0, 150], [0, 0]];
  ai.setActive(true, sim);
  let reversed = false, fled = false;
  step(60, undefined, () => {
    if (sim.car.speed < -0.3) reversed = true;
    if (Math.cos(sim.car.heading) < -0.8 && kmh(sim) > 15 && sim.car.z < 120) fled = true;
  });
  assert.ok(reversed, 'marche arrière pendant le demi-tour');
  assert.ok(fled, 'retourné, il repart vers l’entrée de la rue');
  assert.ok(!events.includes('hit'), `aucun choc (${events.filter((e) => e === 'hit').length})`);
});

test('SMART AI : véhicule garé juste devant, marche arrière pour prendre de l’élan, puis contournement', () => {
  const { sim, ai, events, step } = road();
  sim.car.z = 84;
  sim.parked.push({ x: -2.3, z: 90, heading: 0, kind: 'suv', color: 0 });
  ai.setActive(true, sim);
  let backed = false, sawRecul = false;
  step(40, undefined, () => { if (sim.car.speed < -0.3) backed = true; if (ai.status.decision === 'RECUL') sawRecul = true; });
  assert.ok(sawRecul && backed, 'recul effectué');
  assert.ok(sim.car.z > 110, `obstacle dépassé (z ${sim.car.z.toFixed(0)})`);
  assert.ok(!events.includes('hit'));
});

test('SMART AI : véhicule en panne sur la voie, attente puis contournement', () => {
  const { sim, ai, events, step } = road();
  sim.traffic.push({ x: -2, z: 90, heading: 0, speed: 0, cruise: 0, color: 0, targets: [[-2, 790]], edge: 0, kind: 'berline' });
  ai.setActive(true, sim);
  let waited = 0;
  step(60, undefined, () => { if (sim.car.speed < 0.3 && sim.car.z < 90) waited += 1 / 60; });
  assert.ok(waited > 10, `il attend d’abord (${waited.toFixed(0)} s)`);
  assert.ok(sim.car.z > 110, `puis il contourne (z ${sim.car.z.toFixed(0)})`);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 5 : véhicule garé dans la voie, contournement par la voie libre puis retour', () => {
  const { sim, ai, events, step } = road();
  sim.parked.push({ x: -2.3, z: 90, heading: 0, kind: 'suv', color: 0 });
  ai.setActive(true, sim);
  let leftMost = -Infinity, sawBypass = false;
  step(30, undefined, () => { leftMost = Math.max(leftMost, sim.car.x); if (ai.lastDecision?.action === 'CONTOURNER') sawBypass = true; });
  assert.ok(sawBypass, 'décision de contournement');
  assert.ok(leftMost > -0.5, `écart vers la gauche (x max ${leftMost.toFixed(2)})`);
  assert.ok(sim.car.z > 130, 'obstacle dépassé');
  assert.ok(Math.abs(sim.car.x + 2) < 0.6, `retour dans sa voie (x ${sim.car.x.toFixed(2)})`);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 5 bis : jamais de contournement si un véhicule arrive en face', () => {
  const { sim, ai, events, step } = road();
  sim.parked.push({ x: -2.3, z: 90, heading: 0, kind: 'suv', color: 0 });
  sim.traffic.push({ x: 2, z: 200, heading: Math.PI, speed: 9, cruise: 9, color: 0, targets: [[2, 0]], edge: 1, kind: 'berline' });
  ai.setActive(true, sim);
  let overtookWhileOncoming = false, minDist = Infinity;
  step(35, undefined, () => {
    const o = sim.traffic[0];
    minDist = Math.min(minDist, Math.hypot(o.x - sim.car.x, o.z - sim.car.z));
    if (sim.car.x > -0.5 && o.z > sim.car.z) overtookWhileOncoming = true;
  });
  assert.ok(!overtookWhileOncoming, 'il attend que le véhicule d’en face soit passé');
  assert.ok(minDist > 2.5, `aucun frôlement (${minDist.toFixed(1)} m)`);
  assert.ok(sim.car.z > 110, 'puis il contourne');
  assert.ok(!events.includes('hit'));
});

test('SMART AI : nid-de-poule évité ou franchi au ralenti', () => {
  const { sim, ai, events, step } = road({ potholes: [{ x: -2, z: 80, r: 0.6 }] });
  ai.setActive(true, sim);
  let speedAt = null;
  step(20, undefined, () => { if (speedAt === null && sim.car.z > 80) speedAt = kmh(sim); });
  assert.ok(speedAt !== null && speedAt <= 32, `vitesse au passage (${speedAt?.toFixed(0)} km/h)`);
  assert.ok(!events.includes('nid'), 'aucune roue dans le trou');
});

test('SMART AI : feu rouge, arrêt à la ligne', () => {
  const junction = { x: 0, z: 200, r: 8, axis: 0, dirs: [0, Math.PI], node: 1 };
  const { sim, ai, step } = road({ junctions: [junction] });
  ai.setActive(true, sim);
  // Le feu reste rouge pour notre axe pendant tout l'essai.
  step(1);
  for (const group of [0, 1]) { sim.forced = { junction: 0, group }; if (sim.lightAt(0, 0) === 'red') break; }
  assert.equal(sim.lightAt(0, 0), 'red');
  step(30);
  assert.ok(sim.car.speed < 0.3 && front(sim) < 200 - 8 && front(sim) > 200 - 8 - 6, `arrêté à la ligne (avant ${front(sim).toFixed(1)})`);
  assert.equal(ai.status.objet, 'FEU ROUGE');
});

test('SMART AI 7 : désactivée, le joueur reprend la main', () => {
  const { sim, ai, step } = road();
  ai.setActive(true, sim);
  step(6);
  assert.ok(kmh(sim) > 30);
  ai.setActive(false, sim);
  assert.equal(ai.update(sim, 1 / 60), null);
  assert.equal(ai.status.actif, false);
  step(4, { throttle: 0, brake: 1, steer: 0 });
  assert.ok(sim.car.speed < 0.3, 'le frein du joueur arrête le véhicule');
  step(2, { throttle: 1, brake: 0, steer: 1 });
  assert.ok(Math.abs(sim.car.heading) > 0.3, 'le volant du joueur tourne le véhicule');
});

test('SMART AI dans Lomé : vraie carte, vraie circulation, vrais piétons ; aucun choc et la voiture avance', async () => {
  const { readFileSync } = await import('node:fs');
  const { pointInPoly } = await import('../client/src/moteur/sim.ts');
  const map = JSON.parse(readFileSync(new URL('../client/public/game/lome.json', import.meta.url)));
  for (const start of [120, 520]) {
    const e = map.edges[start], [a, b] = [e.p[0], e.p[1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const world = {
      kind: 'lome', start: map.start, freeStart: { x: a[0] + dx * 5 - dz * e.l, z: a[1] + dz * 5 + dx * e.l, heading: Math.atan2(dx, dz) }, steps: map.steps, park: map.park,
      nodes: map.nodes, edges: map.edges, junctions: map.junctions, colliders: map.buildings.map((x) => x.p), colliderHeights: map.buildings.map((x) => x.h),
      inBounds: (x, z) => pointInPoly(x, z, map.boundary) || map.boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) < 400), mapLines: [], mapWindow: 0, boundsMessage: '',
    };
    const sim = new GameSim(world, true, 16, { walkers: 22, parked: true });
    const ai = new SmartAIController(sim);
    assert.ok(ai.setActive(true, sim));
    const events = [];
    let dist = 0, px = sim.car.x, pz = sim.car.z;
    const t0 = performance.now();
    for (let i = 0; i < 120 * 60; i++) {
      sim.update(1 / 60, ai.update(sim, 1 / 60));
      events.push(...sim.drain());
      dist += Math.hypot(sim.car.x - px, sim.car.z - pz); px = sim.car.x; pz = sim.car.z;
    }
    const ms = (performance.now() - t0) / (120 * 60);
    assert.ok(!events.includes('hit') && !events.includes('walker'), `départ ${start} : aucun choc (${events.filter((x) => x === 'hit' || x === 'walker').length})`);
    assert.ok(dist > 400, `départ ${start} : ${Math.round(dist)} m parcourus`);
    assert.ok(ms < 2, `départ ${start} : ${ms.toFixed(2)} ms par image, simulation comprise`);
  }
});

test('SMART AI : rue étroite à sens unique bloquée, marche arrière jusqu’au carrefour puis autre rue', () => {
  // Une rue de 4 m entre deux immeubles, bloquée par un mur ; au carrefour d'entrée, une rue part à gauche.
  const walls = [[[-2.6, 20], [-2.3, 20], [-2.3, 160], [-2.6, 160]], [[2.3, 20], [2.6, 20], [2.6, 160], [2.3, 160]], [[-3, 120], [3, 120], [3, 121], [-3, 121]]];
  const world = {
    kind: 'grid', start: { x: 0, z: 40, heading: 0 }, steps: [{ kind: 'ignite', text: '', x: 0, z: 0 }], park: { x: 0, z: 0, heading: 0, halfW: 1, halfL: 2 },
    nodes: [[0, -60], [0, 0], [0, 200], [-120, 0]],
    edges: [
      { a: 0, b: 1, p: [[0, -60], [0, 0]], l: 2, r: 5 }, { a: 1, b: 0, p: [[0, 0], [0, -60]], l: 2, r: 5 },
      { a: 1, b: 2, p: [[0, 0], [0, 200]], l: 0, r: 2 },
      { a: 1, b: 3, p: [[0, 0], [-120, 0]], l: 2, r: 5 }, { a: 3, b: 1, p: [[-120, 0], [0, 0]], l: 2, r: 5 },
    ],
    junctions: [], colliders: walls, potholes: [], inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, true, 0);
  sim.startEngine();
  const ai = new SmartAIController(sim);
  ai.setActive(true, sim);
  const events = [];
  let backed = false, sawRetour = false;
  for (let i = 0; i < 90 * 60; i++) {
    sim.update(1 / 60, ai.update(sim, 1 / 60));
    events.push(...sim.drain());
    if (sim.car.speed < -0.5) backed = true;
    if (ai.status.decision === 'MARCHE ARRIÈRE') sawRetour = true;
  }
  assert.ok(sawRetour && backed, 'marche arrière jusqu’au carrefour');
  assert.ok(sim.car.z < 20, `sorti de la rue étroite (z ${sim.car.z.toFixed(0)})`);
  assert.ok(Math.hypot(sim.car.x, sim.car.z) > 15, `reparti par une autre rue (x ${sim.car.x.toFixed(0)}, z ${sim.car.z.toFixed(0)})`);
  assert.ok(!events.includes('hit'), `aucun choc (${events.filter((e) => e === 'hit').length})`);
});

/* Itinéraire, passages alternatifs, anti-blocage */

test('SMART AI 1 (exigé) : destination derrière le véhicule, demi-tour puis arrêt à la destination', () => {
  const { sim, ai, events, step } = road();
  sim.car.z = 200;
  ai.setActive(true, sim);
  ai.setDestination([-2, 60]);
  let sawUturn = false, reversed = false;
  step(60, undefined, () => { if (ai.status.decision === 'DEMI-TOUR') sawUturn = true; if (sim.car.speed < -0.3) reversed = true; });
  assert.ok(sawUturn, 'demi-tour décidé');
  assert.ok(ai.currentRoute && ai.routeCount === 1, `itinéraire inchangé (${ai.routeCount} calcul)`);
  assert.ok(Math.cos(sim.car.heading) < -0.8, 'retourné vers la destination');
  assert.ok(Math.abs(sim.car.z - 60) < 8 && sim.car.speed < 0.3, `arrêté à la destination (z ${sim.car.z.toFixed(1)})`);
  assert.match(ai.status.navigation, /Destination atteinte/);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 2 (exigé) : demi-tour pour rejoindre l’itinéraire par une rue de côté', () => {
  // Grande rue nord-sud et, au carrefour du km 100, une rue vers l'ouest. Le véhicule est 100 m trop loin au nord.
  const world = {
    kind: 'grid', start: { x: -2, z: 200, heading: 0 }, steps: [{ kind: 'ignite', text: '', x: 0, z: 0 }], park: { x: 0, z: 0, heading: 0, halfW: 1, halfL: 2 },
    nodes: [[0, 0], [0, 100], [0, 400], [-150, 100]],
    edges: [
      { a: 0, b: 1, p: [[0, 0], [0, 100]], l: 2, r: 4 }, { a: 1, b: 0, p: [[0, 100], [0, 0]], l: 2, r: 4 },
      { a: 1, b: 2, p: [[0, 100], [0, 400]], l: 2, r: 4 }, { a: 2, b: 1, p: [[0, 400], [0, 100]], l: 2, r: 4 },
      { a: 1, b: 3, p: [[0, 100], [-150, 100]], l: 2, r: 4 }, { a: 3, b: 1, p: [[-150, 100], [0, 100]], l: 2, r: 4 },
    ],
    junctions: [], colliders: [], potholes: [], inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  const sim = new GameSim(world, true, 0);
  sim.startEngine();
  const ai = new SmartAIController(sim);
  ai.setActive(true, sim);
  ai.setDestination([-100, 102]);
  const events = [];
  let sawUturn = false;
  for (let i = 0; i < 90 * 60; i++) {
    sim.update(1 / 60, ai.update(sim, 1 / 60));
    events.push(...sim.drain());
    if (ai.status.decision === 'DEMI-TOUR') sawUturn = true;
  }
  assert.ok(sawUturn, 'demi-tour pour rejoindre l’itinéraire');
  assert.deepEqual(ai.currentRoute.edges, [3, 4], 'itinéraire suivi : retour vers le carrefour, puis la rue de l’ouest');
  assert.ok(Math.hypot(sim.car.x + 100, sim.car.z - 102) < 9 && sim.car.speed < 0.3, `arrivé (x ${sim.car.x.toFixed(0)}, z ${sim.car.z.toFixed(0)})`);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 6 (exigé) : chaussée barrée, passage par le bas-côté praticable, puis retour dans la voie', () => {
  // Une barrière occupe toute la chaussée (x de −4 à 4) ; à l'ouest (x < −4), un terre-plein dégagé.
  const barrier = [[-4, 100], [4, 100], [4, 101.5], [-4, 101.5]];
  const { sim, ai, events, step } = road({ colliders: [barrier] });
  ai.setActive(true, sim);
  let offroad = false;
  step(45, undefined, () => { if (sim.car.x < -4.2) offroad = true; });
  assert.ok(offroad, 'passage par le bas-côté');
  assert.match(ai.status.passages + ' ' + JSON.stringify(ai.lastDecision), /bas-côté|CONTINUER/);
  assert.ok(sim.car.z > 130, `barrière dépassée (z ${sim.car.z.toFixed(0)})`);
  assert.ok(Math.abs(sim.car.x + 2) < 0.6, `retour dans la voie (x ${sim.car.x.toFixed(2)})`);
  assert.ok(!events.includes('hit'));
});

test('SMART AI 8 (exigé) : chaussée barrée et bas-côtés impraticables (eau), aucun passage par l’eau', () => {
  const barrier = [[-4, 100], [4, 100], [4, 101.5], [-4, 101.5]];
  const water = [[[-30, 40], [-4.05, 40], [-4.05, 300], [-30, 300]], [[4.05, 40], [30, 40], [30, 300], [4.05, 300]]];
  const { sim, ai, events, step } = road({ colliders: [barrier], impassable: water });
  ai.setActive(true, sim);
  let wet = false, sawRefusal = false;
  step(50, undefined, () => {
    if (Math.abs(sim.car.x) > 4.05 + 0.2 && sim.car.z > 40) wet = true;
    if (/impraticable/.test(ai.status.passages)) sawRefusal = true;
  });
  assert.ok(!wet, 'jamais dans l’eau');
  assert.ok(sawRefusal, 'bas-côté refusé : terrain impraticable');
  assert.ok(sim.car.z < 100, 'barrière jamais franchie');
  assert.ok(!events.includes('hit'));
});

test('SMART AI 9 (exigé) : véhicule enfermé, il cherche des solutions puis s’arrête en sécurité, sans boucle', () => {
  // Rue étroite fermée devant et derrière : ni contournement, ni demi-tour, ni marche arrière jusqu'au carrefour.
  const walls = [[[-4.6, 0], [-4.3, 0], [-4.3, 200], [-4.6, 200]], [[0.3, 0], [0.6, 0], [0.6, 200], [0.3, 200]], [[-5, 120], [1, 120], [1, 121], [-5, 121]], [[-5, 70], [1, 70], [1, 71], [-5, 71]]];
  const { sim, ai, events, step } = road({ colliders: walls });
  sim.car.z = 85;
  ai.setActive(true, sim);
  let tries = 0;
  step(150, undefined, () => { tries = Math.max(tries, ai.antiBlock.count); });
  assert.ok(ai.antiBlock.halted, `arrêt sécurisé (${ai.antiBlock.state})`);
  assert.ok(tries >= 1 && tries <= 5, `quelques tentatives, pas de boucle (${tries})`);
  assert.match(ai.status.message, /Arrêt sécurisé.*reprenez le volant/);
  assert.equal(ai.status.couleur, 'rouge');
  assert.ok(sim.car.speed > -0.3 && sim.car.speed < 0.3, 'immobile à la fin');
  assert.ok(!events.includes('hit'), `aucun choc (${events.filter((e) => e === 'hit').length})`);
});

test('SMART AI 9 bis : le système anti-blocage repère un véhicule qui n’avance plus malgré la commande', async () => {
  const { AntiBlockage } = await import('../client/src/moteur/smart-ai/antiblock.ts');
  const a = new AntiBlockage();
  let cause = null;
  for (let i = 0; i < 5 * 60 && !cause; i++) cause = a.watch(1 / 60, 10 + i * 0.0005, 20, 0.2, 5, null);
  assert.equal(cause, 'immobilise');
  // Les tentatives sont comptées et plafonnées : au-delà, arrêt sécurisé avec explication.
  for (let k = 0; k < 6; k++) a.record('recul', k * 20, 0, 'immobilise');
  assert.ok(a.halted);
  assert.match(a.message, /véhicule immobilisé/);
});

test('SMART AI 10 (exigé) : contournement puis retour sur l’itinéraire, jusqu’à la destination', () => {
  const { sim, ai, events, step } = road();
  sim.parked.push({ x: -2.3, z: 90, heading: 0, kind: 'suv', color: 0 });
  ai.setActive(true, sim);
  ai.setDestination([-2, 220]);
  let bypassed = false, maxLeft = -Infinity;
  step(45, undefined, () => { if (ai.lastDecision?.action === 'CONTOURNER') bypassed = true; maxLeft = Math.max(maxLeft, sim.car.x); });
  assert.ok(bypassed && maxLeft > -0.5, 'contournement par la gauche');
  assert.equal(ai.routeCount, 1, 'le contournement n’a pas changé l’itinéraire');
  assert.ok(Math.abs(sim.car.z - 220) < 8 && sim.car.speed < 0.3 && Math.abs(sim.car.x + 2) < 0.6, `arrivé dans sa voie (x ${sim.car.x.toFixed(2)}, z ${sim.car.z.toFixed(1)})`);
  assert.ok(!events.includes('hit'));
});

/* Apprentissage par la conduite des joueurs */

test('SMART AI apprend d’un joueur : bloquée, puis elle rejoue le passage qu’un joueur a trouvé', async () => {
  const { KnowledgeBase, DrivingRecorder } = await import('../client/src/moteur/smart-ai/learning.ts');
  const { steerLimit } = await import('../client/src/moteur/sim.ts');
  // Rue entre deux murs, barrée à z = 100. À droite, un terrain clos (z de 88 à 112, x jusqu'à −15) : la barrière y avance
  // jusqu'à x = −10, il reste un passage de 5 m derrière elle, trop loin de la chaussée pour SMART AI seule.
  const walls = [
    [[4.3, 0], [4.6, 0], [4.6, 400], [4.3, 400]],
    [[-4.6, 0], [-4.3, 0], [-4.3, 88], [-4.6, 88]], [[-4.6, 112], [-4.3, 112], [-4.3, 400], [-4.6, 400]],
    [[-10, 100], [4.3, 100], [4.3, 101], [-10, 101]],
    [[-15, 87.7], [-4.3, 87.7], [-4.3, 88], [-15, 88]], [[-15, 112], [-4.3, 112], [-4.3, 112.3], [-15, 112.3]], [[-15.3, 87.7], [-15, 87.7], [-15, 112.3], [-15.3, 112.3]],
  ];
  const kb = new KnowledgeBase();

  // 1. SMART AI seule : elle bute sur la barrière ; l'endroit devient un point critique.
  {
    const { sim, ai, step } = road({ colliders: walls });
    ai.knowledge = kb;
    ai.setActive(true, sim);
    step(20);
    assert.ok(kb.critiques.length >= 1, 'point critique noté');
    assert.ok(Math.hypot(kb.critiques[0].x + 2, kb.critiques[0].z - 92) < 8, `point critique devant la barrière (${kb.critiques[0].x.toFixed(0)}, ${kb.critiques[0].z.toFixed(0)})`);
  }

  // 2. Un joueur conduit lui-même et passe par le terrain, derrière la barrière, sans rien toucher.
  {
    const { sim, events, step } = road({ colliders: walls });
    const rec = new DrivingRecorder();
    const route = [[-2, 20], [-2, 84], [-5, 89], [-9, 92], [-12.5, 95], [-12.5, 105], [-9, 108], [-5, 111], [-2, 116], [-2, 200]];
    let k = 1, learned = null;
    const human = () => {
      const c = sim.car;
      while (k < route.length - 1 && Math.hypot(route[k][0] - c.x, route[k][1] - c.z) < 3) k++;
      const [tx, tz] = route[k];
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading), dx = tx - c.x, dz = tz - c.z;
      const lat = dx * -fz + dz * fx, L2 = dx * dx + dz * dz;
      const steer = Math.max(-1, Math.min(1, Math.atan((2 * lat * 2.66) / Math.max(1, L2)) / steerLimit(c.kind, Math.abs(c.speed))));
      return { throttle: c.speed < 3 ? 0.5 : 0, brake: c.speed > 4 ? 0.3 : 0, steer };
    };
    for (let i = 0; i < 90 * 60 && !learned; i++) {
      sim.update(1 / 60, human());
      for (const e of sim.drain()) if (e === 'hit') rec.noteHit();
      const demo = rec.sample(sim, 1 / 60, kb);
      if (demo) learned = kb.addDemo(demo);
    }
    assert.ok(!events.includes('hit'), 'le joueur n’a rien touché');
    assert.ok(learned, 'sa conduite est devenue une démonstration');
    assert.ok(learned.pts.some((p) => p[0] < -10.5), 'elle passe derrière la barrière');
  }

  // 3. SMART AI, avec ce savoir : bloquée au même endroit, elle rejoue le passage et continue sa route.
  {
    const { sim, ai, events, step } = road({ colliders: walls });
    ai.knowledge = kb;
    ai.setActive(true, sim);
    ai.setDestination([-2, 300]);
    let replayed = false;
    step(120, undefined, () => { if (ai.status.decision === 'SOLUTION APPRISE') replayed = true; });
    assert.ok(replayed, 'solution apprise rejouée');
    assert.ok(sim.car.z > 150, `barrière franchie (z ${sim.car.z.toFixed(0)})`);
    assert.ok(!events.includes('hit'), `aucun choc (${events.filter((e) => e === 'hit').length})`);
    assert.equal(kb.demos[0].ok, 1, 'la réussite est comptée : le savoir s’améliore');
  }
});

test('SMART AI apprend : une conduite avec un choc n’est jamais apprise, une démonstration qui échoue est abandonnée', async () => {
  const { KnowledgeBase, validDemo } = await import('../client/src/moteur/smart-ai/learning.ts');
  const kb = new KnowledgeBase();
  const pts = Array.from({ length: 40 }, (_, i) => [0, i, 1]);
  assert.ok(validDemo(pts));
  assert.ok(!validDemo([[0, 0, 1], [0, 50, 1]]), 'saut impossible refusé');
  assert.ok(!validDemo(pts.map((p, i) => (i === 3 ? [Number.NaN, 0, 1] : p))), 'valeur invalide refusée');
  const d = kb.addDemo(pts);
  assert.ok(d && kb.find(0.5, 5, 0), 'démonstration trouvée dans le bon sens');
  assert.equal(kb.find(0.5, 5, Math.PI), null, 'pas dans le sens contraire');
  kb.result(d.id, false); kb.result(d.id, false);
  assert.equal(kb.demos.length, 0, 'deux échecs sans réussite : abandonnée');
});

/* SMART AI pour tous les véhicules */

const crossing = () => {
  // Deux rues qui se croisent en (0, 0), sans feu : nord-sud et ouest-est.
  const world = {
    kind: 'grid', start: { x: 300, z: 300, heading: 0 }, steps: [{ kind: 'ignite', text: '', x: 0, z: 0 }], park: { x: 0, z: 0, heading: 0, halfW: 1, halfL: 2 },
    nodes: [[0, -200], [0, 0], [0, 200], [-200, 0], [200, 0]],
    edges: [
      { a: 0, b: 1, p: [[0, -200], [0, 0]], l: 2, r: 4 }, { a: 1, b: 2, p: [[0, 0], [0, 200]], l: 2, r: 4 },
      { a: 3, b: 1, p: [[-200, 0], [0, 0]], l: 2, r: 4 }, { a: 1, b: 4, p: [[0, 0], [200, 0]], l: 2, r: 4 },
    ],
    junctions: [], colliders: [], potholes: [], inBounds: () => true, mapLines: [], mapWindow: 0, boundsMessage: '',
  };
  return world;
};
async function trafficRun(withSafety, setup, seconds, each) {
  const { FleetSafety } = await import('../client/src/moteur/smart-ai/fleet.ts');
  const sim = new GameSim(crossing(), true, 0, { foot: true });
  // Honorable, à pied, tout près : la circulation n'est recyclée qu'au-delà de 380 m de lui.
  Object.assign(sim.hero, { x: 25, z: -25 });
  if (withSafety) sim.safety = new FleetSafety();
  setup(sim);
  for (let i = 0; i < seconds * 60; i++) { sim.update(1 / 60, { throttle: 0, brake: 0, steer: 0 }); sim.drain(); each(sim); }
  return sim;
}
const car = (x, z, heading, targets, kind = 'berline') => ({ x, z, heading, speed: 8, cruise: 8, color: 0, targets, edge: 0, kind });

test('SMART AI circulation : deux véhicules qui arrivent ensemble à un croisement sans feu, l’un cède, aucun ne passe à travers l’autre', async () => {
  const run = async (on) => {
    let closest = Infinity;
    const sim = await trafficRun(on, (s) => { s.traffic.push(car(-2, -80, 0, [[-2, 0], [-2, 150]])); s.traffic.push(car(-84, 2, Math.PI / 2, [[0, 2], [150, 2]], 'moto')); }, 30, (s) => { closest = Math.min(closest, Math.hypot(s.traffic[0].x - s.traffic[1].x, s.traffic[0].z - s.traffic[1].z)); });
    return { closest, passed: sim.traffic[0].z > 20 && sim.traffic[1].x > 20 };
  };
  const without = await run(false), withAi = await run(true);
  assert.ok(without.closest < 2, `sans SMART AI, ils se traversent (${without.closest.toFixed(1)} m)`);
  // Voiture (demi-largeur 0,95 m) et moto (demi-longueur 0,9 m) : au-delà de 2,2 m entre les centres, ils ne se touchent pas.
  assert.ok(withAi.closest > 2.2, `avec SMART AI, ils ne se touchent pas (${withAi.closest.toFixed(1)} m entre les centres)`);
  assert.ok(withAi.passed, 'puis tous deux repartent');
});

test('SMART AI circulation : un piéton traverse devant une voiture de la circulation, elle s’arrête', async () => {
  let closest = Infinity;
  await trafficRun(true, (s) => {
    s.traffic.push(car(-2, -60, 0, [[-2, 0], [-2, 150]]));
    s.walkers.push({ x: -8, z: -30, heading: Math.PI / 2, speed: 1.2, cruise: 1.2, look: 0, targets: [[8, -30]], edge: 0, wait: 0, phase: 0 });
  }, 25, (s) => { const w = s.walkers[0], t = s.traffic[0]; if (w) closest = Math.min(closest, Math.hypot(w.x - t.x, w.z - t.z)); });
  assert.ok(closest > 2.5, `piéton épargné (${closest.toFixed(1)} m du centre)`);
});

test('SMART AI circulation : la voiture du joueur arrêtée sur la voie, le véhicule qui suit s’arrête derrière', async () => {
  let closest = Infinity;
  await trafficRun(true, (s) => {
    s.leave?.();
    s.mode = 'car';
    Object.assign(s.car, { x: -2, z: 40, heading: 0, speed: 0, kind: 'berline' });
    s.traffic.push(car(-2, -60, 0, [[-2, 0], [-2, 150]]));
  }, 25, (s) => { closest = Math.min(closest, Math.hypot(s.car.x - s.traffic[0].x, s.car.z - s.traffic[0].z)); });
  assert.ok(closest > 4.5, `arrêt derrière la voiture du joueur (${closest.toFixed(1)} m)`);
});

test('SMART AI : freinage d’urgence de la voiture du joueur devant un piéton', async () => {
  const { FleetSafety } = await import('../client/src/moteur/smart-ai/fleet.ts');
  const { sim, events } = road();
  const fleet = new FleetSafety();
  sim.safety = fleet;
  sim.walkers.push(pieton(-2, 70, [-2, 1000]));
  let fired = 0, closest = Infinity;
  for (let i = 0; i < 20 * 60; i++) {
    sim.safety.tick(0);
    const seen = fleet.emergency(sim);
    if (seen) fired++;
    sim.update(1 / 60, seen ? { throttle: 0, brake: 1, steer: 0 } : { throttle: 1, brake: 0, steer: 0 });
    events.push(...sim.drain());
    closest = Math.min(closest, 70 - front(sim));
  }
  assert.ok(fired > 0, 'freinage d’urgence déclenché');
  assert.ok(closest > 0.3, `arrêt avant le piéton (${closest.toFixed(1)} m)`);
  assert.ok(!events.includes('walker') && !events.includes('hit'), 'aucun choc');
});

test('SMART AI circulation dans Lomé : 5 minutes de vraie circulation, aucune collision rapide entre véhicules', async () => {
  const { readFileSync } = await import('node:fs');
  const { pointInPoly, VEHICLES } = await import('../client/src/moteur/sim.ts');
  const { FleetSafety } = await import('../client/src/moteur/smart-ai/fleet.ts');
  const map = JSON.parse(readFileSync(new URL('../client/public/game/lome.json', import.meta.url)));
  const world = { kind: 'lome', start: map.start, freeStart: { x: map.park.x, z: map.park.z, heading: map.park.heading }, steps: map.steps, park: map.park, nodes: map.nodes, edges: map.edges, junctions: map.junctions,
    colliders: map.buildings.map((b) => b.p), inBounds: (x, z) => pointInPoly(x, z, map.boundary) || map.boundary.some((q) => Math.hypot(q[0] - x, q[1] - z) < 400), mapLines: [], mapWindow: 0, boundsMessage: '' };
  const sim = new GameSim(world, true, 16, { walkers: 22, parked: true, foot: true });
  sim.safety = new FleetSafety();
  const touching = new Set();
  let hard = 0, speed = 0, n = 0;
  for (let i = 0; i < 5 * 3600; i++) {
    sim.update(1 / 60, { throttle: 0, brake: 0, steer: 0 }); sim.drain();
    const T = sim.traffic.filter((t) => Math.abs(t.x - sim.focus.x) < 4000);
    for (let a = 0; a < T.length; a++) {
      speed += T[a].speed; n++;
      for (let b = a + 1; b < T.length; b++) {
        const key = `${sim.traffic.indexOf(T[a])}-${sim.traffic.indexOf(T[b])}`;
        const close = Math.hypot(T[a].x - T[b].x, T[a].z - T[b].z) < (VEHICLES[T[a].kind].radius + VEHICLES[T[b].kind].radius) * 0.9;
        if (close && !touching.has(key)) {
          const rv = Math.hypot(Math.sin(T[a].heading) * T[a].speed - Math.sin(T[b].heading) * T[b].speed, Math.cos(T[a].heading) * T[a].speed - Math.cos(T[b].heading) * T[b].speed);
          if (rv > 2) hard++;
        }
        if (close) touching.add(key); else touching.delete(key);
      }
    }
  }
  assert.equal(hard, 0, 'aucune collision rapide');
  assert.ok(speed / n * 3.6 > 6, `la circulation avance (${(speed / n * 3.6).toFixed(1)} km/h en moyenne)`);
});
