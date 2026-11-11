import { mulberry, type GraphEdge, type Junction, type Pt, type Step, type World } from './sim';

/** Ville imaginaire : un quadrillage léger, qui reste proposé pour les téléphones modestes. */
export const PITCH = 80;
export const ROAD = 6;
export const WALK = 3;
export const GRID = 3;
const LANE = 3;
const EDGE = GRID * PITCH + ROAD + WALK - 1;
const STOP_LINE = -PITCH - ROAD - 2;
export const BAY = { x: 40, z: 22, heading: 0, halfW: 2.2, halfL: 3.6 };

export type Solid = { x0: number; x1: number; z0: number; z1: number; h: number; kind: 'building' | 'showroom' | 'post' | 'tree' | 'parked'; tint: number };

const TINTS = [0xe9e2d3, 0xd8b98c, 0xc98f6b, 0xf0ece3, 0xb9c2c9, 0xa9764f, 0xdcd4c0, 0x8f9aa3];

export function buildCity() {
  const rand = mulberry(228);
  const solids: Solid[] = [];
  const parks: { x0: number; z0: number }[] = [];
  const pad = ROAD + WALK + 1;
  for (let cx = -GRID - 1; cx <= GRID; cx++) {
    for (let cz = -GRID - 1; cz <= GRID; cz++) {
      const x0 = cx * PITCH, z0 = cz * PITCH;
      if (cx === 0 && cz === 0) continue; // Concession, traitée plus bas.
      const outer = cx < -GRID || cx >= GRID || cz < -GRID || cz >= GRID;
      if (!outer && (cx + 2 * cz + 40) % 7 === 0) {
        parks.push({ x0, z0 });
        for (let i = 0; i < 16; i++) {
          const x = x0 + pad + 2 + rand() * (PITCH - 2 * pad - 4), z = z0 + pad + 2 + rand() * (PITCH - 2 * pad - 4);
          solids.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, h: 5 + rand() * 5, kind: 'tree', tint: 0 });
        }
        continue;
      }
      const n = outer ? 3 : 2 + Math.floor(rand() * 2);
      const size = (PITCH - 2 * pad) / n;
      const centre = 1 - Math.hypot(cx + 0.5, cz + 0.5) / 6;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const inset = outer ? 0.2 : 1 + rand() * 1.5;
        const r = rand();
        solids.push({
          x0: x0 + pad + a * size + inset, x1: x0 + pad + (a + 1) * size - inset,
          z0: z0 + pad + b * size + inset, z1: z0 + pad + (b + 1) * size - inset,
          h: 7 + r * r * (12 + Math.max(centre, 0) * 40), kind: 'building', tint: TINTS[Math.floor(rand() * TINTS.length)]!,
        });
      }
    }
  }
  solids.push({ x0: 14, x1: 66, z0: 48, z1: 71, h: 9, kind: 'showroom', tint: 0x20242b });
  for (const x of [32, 48, 56]) solids.push({ x0: x - 1, x1: x + 1, z0: BAY.z - 2.3, z1: BAY.z + 2.3, h: 1.6, kind: 'parked', tint: x === 32 ? 0xecedee : 0x70747a });

  const lamps: { x: number; z: number; rot: number }[] = [];
  const off = ROAD + WALK - 0.9;
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j < GRID; j++) for (const f of [0.25, 0.75]) {
    const side = (i + j) % 2 === 0 ? 1 : -1;
    lamps.push({ x: i * PITCH + side * off, z: (j + f) * PITCH, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    lamps.push({ x: (j + f) * PITCH, z: i * PITCH + side * off, rot: side > 0 ? Math.PI : 0 });
  }
  for (const l of lamps) solids.push({ x0: l.x - 0.25, x1: l.x + 0.25, z0: l.z - 0.25, z1: l.z + 0.25, h: 7, kind: 'post', tint: 0 });

  return { solids, parks, lamps };
}
export type City = ReturnType<typeof buildCity>;

export function gridWorld(): World & { city: City } {
  const city = buildCity();
  const nodeId = (i: number, j: number) => (i + GRID) * (2 * GRID + 1) + (j + GRID);
  const nodes: Pt[] = [], edges: GraphEdge[] = [], junctions: Junction[] = [], lines: Pt[][] = [];
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) nodes[nodeId(i, j)] = [i * PITCH, j * PITCH];
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) {
    const dirs: number[] = [];
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const a = i + dx, b = j + dz;
      if (Math.abs(a) > GRID || Math.abs(b) > GRID) continue;
      dirs.push(Math.atan2(dx, dz));
      edges.push({ a: nodeId(i, j), b: nodeId(a, b), p: [nodes[nodeId(i, j)]!, nodes[nodeId(a, b)]!], l: LANE, r: 3 });
    }
    junctions.push({ x: i * PITCH, z: j * PITCH, r: ROAD, axis: 0, dirs, node: nodeId(i, j) });
  }
  for (let i = -GRID; i <= GRID; i++) {
    lines.push([[i * PITCH, -GRID * PITCH], [i * PITCH, GRID * PITCH]], [[-GRID * PITCH, i * PITCH], [GRID * PITCH, i * PITCH]]);
  }
  const stopJunction = junctions.findIndex((j) => j.x === 0 && j.z === -PITCH);
  const steps: Step[] = [
    { kind: 'ignite', text: 'Démarrez le moteur.', x: -LANE, z: -150 },
    { kind: 'gate', text: 'Avancez jusqu’au feu, sur la voie de droite.', x: -LANE, z: -106 },
    { kind: 'stop', text: 'Feu rouge : arrêtez-vous avant la ligne.', x: -LANE, z: STOP_LINE, junction: stopJunction, heading: 0 },
    { kind: 'gate', text: 'Mettez le clignotant droit, puis tournez à droite.', x: -40, z: -PITCH - LANE, signal: 1 },
    { kind: 'gate', text: 'Clignotant gauche, puis tournez à gauche.', x: -PITCH - LANE, z: -40, signal: -1 },
    { kind: 'gate', text: 'Encore à gauche, avec le clignotant.', x: -40, z: LANE, signal: -1 },
    { kind: 'gate', text: 'Tout droit, en respectant le feu.', x: 28, z: LANE },
    { kind: 'park', text: 'Garez-vous sur la place éclairée de la concession.', x: BAY.x, z: BAY.z },
  ];
  return {
    kind: 'grid', city, start: { x: -LANE, z: -150, heading: 0 }, steps, park: BAY, nodes, edges, junctions, mapLines: lines, mapWindow: 0,
    colliders: city.solids.map((s) => [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]] as Pt[]),
    colliderHeights: city.solids.map((s) => s.h),
    inBounds: (x, z) => Math.abs(x) < EDGE && Math.abs(z) < EDGE,
    boundsMessage: 'Limite de la ville',
    rooms: city.solids.filter((s) => s.kind === 'building' || s.kind === 'showroom').map((s) => ({ p: [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]] as Pt[], n: s.kind === 'showroom' ? 'Concession' : null })),
  };
}
