import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, flat, flatGeometry, glowTexture, polygonFlat, ribbon, windowsTexture, type Decor } from './kit';
import { buildHotelDistrict, districtTrees, MONUMENT_SOLID } from './lome-hotel';
import { buildCasef } from './lome-casef';
import { buildLandmarks } from './lome-landmarks';
import { buildPlaces, placesSolids } from './lome-places';
import { IAI_LOT, iaiFrame } from './iai-interior';
import type { Place } from './nav';
import { mulberry, pointInPoly, type GraphEdge, type Junction, type Park, type Parked, type Pt, type Step, type World } from './sim';

/** Plan du quartier administratif de Lomé, généré par scripts/lome-map.cjs (© contributeurs OpenStreetMap). */
export type LomeData = {
  boundary: Pt[];
  roads: { c: string; w: number; o: number; n?: string; p: Pt[] }[];
  nodes: Pt[];
  edges: GraphEdge[];
  junctions: Omit<Junction, never>[];
  buildings: { p: Pt[]; h: number; s: number; n?: string; hole?: Pt[]; tan?: Pt[]; roof?: number; wall?: number; dome?: number; annex?: number; sig?: string }[];
  places: { n: string; x: number; z: number }[];
  walls: [Pt, Pt, number?][];
  iaiFence: [Pt, Pt][];
  casefFence: [Pt, Pt][];
  casefArea: Pt[];
  parkings: Pt[][];
  iai: string;
  iaiPoint: Pt;
  greens: Pt[][];
  water: Pt[][];
  beach: Pt[][];
  coast: Pt[][];
  named: { n: string; x: number; z: number }[];
  route: Pt[];
  steps: Step[];
  start: { x: number; z: number; heading: number };
  park: Park;
};

const MAJOR = new Set(['trunk', 'secondary', 'tertiary']);
const LABELS: Record<string, string> = { "Monument de l'Indépendance": 'Monument de l’Indépendance', 'Musée National': 'Musée national', 'Place des Martyrs': 'Place des Martyrs', 'Village Artisanal': 'Village artisanal' };
const NEARBY_LABELS = 10;
const BUILDING_LABELS: Record<string, string> = { 'Hôtel 2 Février': 'Hôtel 2 Février', Parlement: 'Palais des congrès', 'Mairie de Lomé': 'Mairie de Lomé', 'Palais de Justice': 'Palais de justice', 'Gare de Lomé': 'Gare de Lomé', CASEF: 'CASEF' };

function offsetPoint(p: Pt, q: Pt, d: number): Pt {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [p[0] - ((q[1] - p[1]) / len) * d, p[1] + ((q[0] - p[0]) / len) * d];
}

/** Arbres et lampadaires sont tirés une seule fois : le rendu et les collisions voient les mêmes. */
function buildProps(data: LomeData, low: boolean) {
  const rand = mulberry(1960);
  const inBuilding = (x: number, z: number) => data.buildings.some((b) => Math.abs(b.p[0]![0] - x) < 150 && Math.abs(b.p[0]![1] - z) < 150 && pointInPoly(x, z, b.p));
  const lamps: { x: number; z: number; rot: number }[] = [];
  const trees: { x: number; z: number; h: number; palm: boolean }[] = [];
  const onRoad = (x: number, z: number) => data.roads.some((r) => r.p.some((q, i) => {
    const a = r.p[i - 1];
    if (!a) return false;
    const dx = q[0] - a[0], dz = q[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < r.w / 2 + 1;
  }));
  for (const road of data.roads) {
    if (!MAJOR.has(road.c)) continue;
    let walked = 0, side = 1;
    road.p.slice(1).forEach((q, i) => {
      const a = road.p[i]!;
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      for (let m = 40 - (walked % 40); m < len; m += 40) {
        const t = m / len;
        const at: Pt = [a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t];
        const [x, z] = offsetPoint(at, [at[0] + (q[0] - a[0]), at[1] + (q[1] - a[1])], side * (road.w / 2 + 1.6));
        if (!onRoad(x, z) && !inBuilding(x, z)) {
          if (Math.floor((walked + m) / 40) % 2) lamps.push({ x, z, rot: Math.atan2(q[0] - a[0], q[1] - a[1]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
          else trees.push({ x, z, h: 7 + rand() * 4, palm: true });
        }
        side = -side;
      }
      walked += len;
    });
  }
  for (const t of districtTrees(data)) if (!onRoad(t.x, t.z) && !inBuilding(t.x, t.z)) trees.push(t);
  const perGreen = low ? 5 : 12;
  for (const g of data.greens) {
    const xs = g.map((p) => p[0]), zs = g.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const count = Math.min(perGreen, Math.ceil(((x1 - x0) * (z1 - z0)) / 500));
    for (let i = 0; i < count; i++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (pointInPoly(x, z, g) && !onRoad(x, z) && !inBuilding(x, z)) trees.push({ x, z, h: 5 + rand() * 5, palm: rand() < 0.3 });
    }
  }
  // La carte ne recense pas la végétation des terrains : quelques arbres habillent les espaces vides, à titre décoratif.
  const xs = data.boundary.map((p) => p[0]), zs = data.boundary.map((p) => p[1]);
  const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, z0 = Math.min(...zs) - 90, z1 = Math.max(...zs) + 90;
  for (let i = 0; i < (low ? 240 : 560); i++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (Math.hypot(x, z) > 40 && !onRoad(x, z) && !inBuilding(x, z)) trees.push({ x, z, h: 4 + rand() * 6, palm: rand() < 0.35 });
  }
  return { lamps, trees: low ? trees.filter((t) => t.h > 5) : trees };
}

const square = (x: number, z: number, r: number): Pt[] => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];

const CENTRE = (p: Pt[]) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length] as Pt, [0, 0] as Pt);
const KNOWN: Record<string, number> = { "Monument de l'Indépendance": 8, 'Hôtel 2 Février': 7, Parlement: 6, 'Palais des congrès de Lomé': 6, 'Mairie de Lomé': 5, 'Musée National': 5, 'Place des Martyrs': 5, 'Palais de Justice': 4, 'Gare de Lomé': 4, CASEF: 6, 'Place de la Libération': 3 };

/** Tout ce que la carte nomme : bâtiments, établissements et rues. L'IAI-Togo vient en tête de liste. */
export function lomePlaces(data: LomeData, inBounds: (x: number, z: number) => boolean): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  const add = (name: string, kind: Place['kind'], x: number, z: number) => {
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key) || !inBounds(x, z)) return;
    seen.add(key);
    out.push({ name, kind, x, z, rank: name === data.iai ? 10 : KNOWN[name] ?? 0 });
  };
  for (const b of data.buildings) if (b.n) { const [x, z] = CENTRE(b.p); add(b.n, 'lieu', x, z); }
  for (const p of data.places) add(p.n, 'lieu', p.x, p.z);
  for (const n of data.named) add(n.n, 'lieu', n.x, n.z);
  for (const r of data.roads) if (r.n) { const m = r.p[Math.floor(r.p.length / 2)]!; add(r.n, 'rue', m[0], m[1]); }
  return out;
}

export function lomeWorld(data: LomeData, low: boolean): World & { props: ReturnType<typeof buildProps>; data: LomeData } {
  const props = buildProps(data, low);
  const { boundary } = data;
  // La frontière officielle ferme le terrain, avec un peu de marge pour les rues qui la longent.
  const edgeNear = (x: number, z: number) => boundary.some((p, i) => {
    const a = boundary[i === 0 ? boundary.length - 1 : i - 1]!;
    const dx = p[0] - a[0], dz = p[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < 90;
  });
  const inBounds = (x: number, z: number) => pointInPoly(x, z, boundary) || edgeNear(x, z);
  return {
    kind: 'lome', data, props, places: lomePlaces(data, inBounds),
    start: data.start, freeStart: { x: data.park.x, z: data.park.z, heading: data.park.heading }, steps: data.steps, park: data.park, nodes: data.nodes, edges: data.edges, junctions: data.junctions,
    colliders: [
      ...data.buildings.map((b) => b.p),
      ...props.lamps.map((l) => square(l.x, l.z, 0.22)),
      ...props.trees.map((t) => square(t.x, t.z, 0.35)),
      MONUMENT_SOLID(data),
      ...placesSolids(data),
      ...[...data.walls, ...data.iaiFence, ...data.casefFence].map(([a, b]) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = (-(b[1] - a[1]) / len) * 0.12, nz = ((b[0] - a[0]) / len) * 0.12;
        return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]] as Pt[];
      }),
    ],
    // Hauteurs dans le même ordre : bâtiments, lampadaires, arbres, monument, places, murs et clôtures.
    colliderHeights: [
      ...data.buildings.map((b) => b.h),
      ...props.lamps.map(() => 7.2),
      ...props.trees.map((t) => t.h + 2),
      24,
      ...placesSolids(data).map(() => 5),
      ...[...data.walls, ...data.iaiFence, ...data.casefFence].map(() => 2.6),
    ],
    inBounds,
    mapLines: data.roads.map((r) => r.p),
    mapWindow: 300,
    streets: data.roads.filter((r) => r.n).map((r) => ({ n: r.n!, p: r.p })),
    boundsMessage: 'Fin du quartier administratif',
    rooms: data.buildings.filter((b) => b.p.length >= 3).map((b) => ({ p: b.p, n: b.n ?? null })),
    parkedExtra: iaiMotos(data),
    // L'eau de la lagune et de la mer : aucun véhicule n'y roule.
    impassable: data.water,
    // Terrain nu à l'ouest de la rue Agoucon, face à l'IAI : l'hélicoptère y a son aire.
    helipad: [515, -520],
  };
}

/** Motos du parking de l'IAI : une rangée contre la clôture, entre la façade côté BSIC et le portail, et une moto bleue pour Honorable près du portail. */
function iaiMotos(data: LomeData): Parked[] {
  const iai = data.buildings.find((b) => b.n === data.iai);
  if (!iai) return [];
  const fr = iaiFrame(iai.p);
  const at = (u: number, v: number, du: number, dv: number, color: number, kind: Parked['kind'] = 'moto'): Parked => {
    const [x, z] = fr.world(u, v);
    const hx = fr.eu[0] * du + fr.ev[0] * dv, hz = fr.eu[1] * du + fr.ev[1] * dv;
    return { x, z, heading: Math.atan2(hx, hz), kind, color };
  };
  const colors = [0x1b1c1f, 0xb0201c, 0xe3e3df, 0x2b2d31, 0x8d1f1f, 0x1b1c1f, 0x6b6e73];
  // La bleue, une moto sportive, près du portail, prête à sortir ; les autres en épi contre la clôture, l'allée restant libre.
  // Motos, scooters et quelques sportives, comme sur un parking d'école.
  const out: Parked[] = [at(IAI_LOT.u0 - 1, -2.4, -1, 0, 0x1f5fae, 'motosport')];
  for (let i = 0, u = IAI_LOT.u0 + 2.5; u <= IAI_LOT.carU0 - 1; u += 1.15, i++) out.push(at(u, IAI_LOT.v0 + 0.7, 0, -1, colors[i % colors.length]!, i % 3 === 1 ? 'scooter' : i % 7 === 4 ? 'motosport' : 'moto'));
  return out;
}

const PALETTE = [0xe6dcc6, 0xd9c7a3, 0xcfa981, 0xf0ebdf, 0xbfc5c6, 0xc99872, 0xdfd3b8, 0xa8b0a8, 0xe3b98e];
const ROOFS = [0x8a8f91, 0x9c5a3c, 0x6f7375, 0xb0a48e];

function buildingsGeometry(list: LomeData['buildings']) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [];
  const wall = new THREE.Color(), roof = new THREE.Color();
  for (const b of list) {
    const ring = [...b.p];
    const area = ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (area > 0) ring.reverse(); // Sens imposé : les normales des murs pointent vers l'extérieur.
    wall.setHex(b.wall ?? PALETTE[Math.floor(b.s * PALETTE.length)]!);
    roof.setHex(b.roof ?? ROOFS[Math.floor(b.s * 37) % ROOFS.length]!);
    const rows = Math.max(1, Math.round(b.h / 3.3)) / 8;
    const court = b.hole ? [...b.hole] : null;
    // La cour se parcourt en sens inverse : ses murs regardent vers l'intérieur de la cour.
    if (court && court.reduce((s, p, i) => { const q = court[(i + 1) % court.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) < 0) court.reverse();
    for (const loop of court ? [ring, court] : [ring]) loop.forEach((a, i) => {
      const c = loop[(i + 1) % loop.length]!;
      const cols = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 3.4)) / 8;
      pos.push(a[0], 0, a[1], c[0], 0, c[1], c[0], b.h, c[1], a[0], 0, a[1], c[0], b.h, c[1], a[0], b.h, a[1]);
      uv.push(0, 0, cols, 0, cols, rows, 0, 0, cols, rows, 0, rows);
      for (let k = 0; k < 6; k++) col.push(wall.r, wall.g, wall.b);
    });
    const shape = ring.map((p) => new THREE.Vector2(p[0], p[1]));
    const holes = court ? [court.map((p) => new THREE.Vector2(p[0], p[1]))] : [];
    const all = [...shape, ...holes.flat()];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(shape, holes)) {
      const p = all[i!]!, q = all[j!]!, r = all[k!]!;
      const up = (q.y - p.y) * (r.x - p.x) - (q.x - p.x) * (r.y - p.y) > 0;
      const [m, n] = up ? [q, r] : [r, q];
      pos.push(p.x, b.h, p.y, m.x, b.h, m.y, n.x, b.h, n.y);
      for (let v = 0; v < 3; v++) { uv.push(0.005, 0.005); col.push(roof.r, roof.g, roof.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Terre battue et herbe rase en taches, pour que le sol ne soit pas un aplat. */
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f8560';
  g.fillRect(0, 0, 512, 512);
  const rand = mulberry(7);
  for (let i = 0; i < 900; i++) {
    const r = 4 + rand() * 26;
    g.fillStyle = ['rgba(92,108,58,.2)', 'rgba(150,118,80,.2)', 'rgba(70,92,50,.16)', 'rgba(176,156,112,.16)'][i % 4]!;
    g.beginPath(); g.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawLabel(c: HTMLCanvasElement, text: string) {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.font = '600 40px sans-serif';
  const w = Math.min(500, g.measureText(text).width + 44);
  g.fillStyle = 'rgba(11,12,14,.78)';
  g.beginPath(); g.roundRect((512 - w) / 2, 12, w, 72, 36); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 50, 470);
}

function labelSprite(text: string) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  drawLabel(c, text);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, fog: false, transparent: true }));
  s.scale.set(26, 4.9, 1);
  return s;
}

export function buildLomeScene(scene: THREE.Scene, world: ReturnType<typeof lomeWorld>, low: boolean): Decor {
  const { data, props } = world;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x35373a, roughness: 0.92, envMapIntensity: 0.25 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa39a8a, roughness: 0.95, envMapIntensity: 0.25 });
  const groundMap = groundTexture();
  const laterite = new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, envMapIntensity: 0.2 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x4f7f3c, roughness: 1, envMapIntensity: 0.2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.8, envMapIntensity: 0.25 });
  const sea = new THREE.MeshStandardMaterial({ color: 0x1f6f9f, roughness: 0.3, metalness: 0.2, fog: false });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd9c398, roughness: 1, envMapIntensity: 0.2 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => { const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = shadow && !low; scene.add(mesh); return mesh; };

  add(flat(5200, 5200, 0, 0.01, 0), laterite);
  const coast = data.coast.flat().sort((a, b) => a[0] - b[0]);
  if (coast.length > 1) {
    const first = coast[0]!, last = coast[coast.length - 1]!;
    const beach: number[] = [];
    ribbon(coast, 70, 0.02, beach);
    add(flatGeometry(beach), sand);
    add(polygonFlat([[[first[0] - 2400, first[1]], ...coast, [last[0] + 2400, last[1]], [last[0] + 2400, last[1] - 2800], [first[0] - 2400, first[1] - 2800]]], 0.035), sea, false);
  }
  add(polygonFlat(data.greens, 0.04), grass);
  if (data.water.length) add(polygonFlat(data.water, 0.045), sea, false);
  if (data.parkings.length) add(polygonFlat(data.parkings, 0.05), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.95, envMapIntensity: 0.25 }));

  const walkPos: number[] = [], roadPos: number[] = [], markPos: number[] = [];
  for (const r of data.roads) {
    if (MAJOR.has(r.c)) ribbon(r.p, r.w + 5, 0.055, walkPos);
    ribbon(r.p, r.w, 0.08, roadPos);
    if (MAJOR.has(r.c) || r.c === 'unclassified') {
      // Tirets au centre sur les doubles sens, en rive sur les chaussées à sens unique.
      const offset = r.o ? r.w / 2 - 0.5 : 0;
      r.p.slice(1).forEach((q, i) => {
        const a = r.p[i]!;
        const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
        const ux = (q[0] - a[0]) / len, uz = (q[1] - a[1]) / len;
        for (let m = 8; m + 3 < len - 8; m += r.o ? 3.2 : 7) {
          const s: Pt = [a[0] + ux * m + -uz * offset, a[1] + uz * m + ux * offset];
          const e: Pt = [s[0] + ux * (r.o ? 3.2 : 3), s[1] + uz * (r.o ? 3.2 : 3)];
          ribbon([s, e], 0.16, 0.1, markPos);
        }
      });
    }
  }
  add(flatGeometry(walkPos), concrete);
  add(flatGeometry(roadPos), asphalt);
  add(flatGeometry(markPos), white, false);

  const facades = windowsTexture(false), lit = windowsTexture(true);
  const buildingMat = new THREE.MeshStandardMaterial({ map: facades, vertexColors: true, roughness: 0.84, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 0, envMapIntensity: 0.25 });
  const buildings = new THREE.Mesh(buildingsGeometry(data.buildings.filter((b) => b.n !== 'Hôtel 2 Février' && b.n !== 'Parlement' && b.n !== data.iai && !b.dome && !b.annex && !b.sig)), buildingMat);
  buildings.castShadow = buildings.receiveShadow = !low;
  scene.add(buildings);

  /* Murs d'enceinte réels */
  if (data.walls.length) {
    const wallParts = data.walls.map(([a, b, h = 2.2]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return new THREE.BoxGeometry(0.25, h, len).rotateY(Math.atan2(b[0] - a[0], b[1] - a[1])).translate((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2);
    });
    const enclosure = new THREE.Mesh(mergeGeometries(wallParts), new THREE.MeshStandardMaterial({ color: 0xbdb5a4, roughness: 1, envMapIntensity: 0.25 }));
    enclosure.castShadow = enclosure.receiveShadow = !low;
    scene.add(enclosure);
  }

  /* Lieux emblématiques */
  const centre = (p: Pt[]) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length] as Pt, [0, 0] as Pt);
  const labels: THREE.Sprite[] = [];
  const district = buildHotelDistrict(scene, data, low);
  const places = buildPlaces(scene, data, low);
  const landmarks = buildLandmarks(scene, data, low);
  const casef = buildCasef(scene, data, low);

  const addLabel = (text: string, x: number, y: number, z: number) => { const s = labelSprite(text); s.position.set(x, y, z); labels.push(s); scene.add(s); };
  for (const n of data.named) if (LABELS[n.n]) addLabel(LABELS[n.n]!, n.x, n.n.startsWith('Monument') ? 21 : 14, n.z);
  for (const b of data.buildings) if (b.n && BUILDING_LABELS[b.n]) { const [x, z] = b.n === 'Hôtel 2 Février' ? district.hotelLabel : centre(b.p); addLabel(BUILDING_LABELS[b.n]!, x, b.n === 'Hôtel 2 Février' ? 24 : b.h + (b.n === 'Parlement' ? 18 : 5), z); }
  const iai = data.buildings.find((b) => b.n === data.iai);
  if (iai) { const [x, z] = centre(iai.p); addLabel('IAI-Togo', x, iai.h + 8, z); labels[labels.length - 1]!.scale.set(20, 3.77, 1); }

  /* Noms de proximité : tous les noms de la carte, affichés seulement à portée de vue pour rester lisibles et légers. */
  const permanent = new Set(Object.keys(BUILDING_LABELS).concat(data.iai));
  const nameable = [
    ...data.buildings.filter((b) => b.n && !permanent.has(b.n)).map((b) => { const [x, z] = centre(b.p); return { n: b.n!, x, z, y: b.h + 3.5 }; }),
    ...data.places.map((p) => ({ ...p, y: 7 })),
  ];
  const nearbySprites = Array.from({ length: NEARBY_LABELS }, () => { const s = labelSprite(' '); s.visible = false; s.scale.set(17, 3.2, 1); s.userData.name = ''; scene.add(s); labels.push(s); return s; });
  const setLabel = (s: THREE.Sprite, text: string) => {
    const tex = s.material.map as THREE.CanvasTexture;
    drawLabel(tex.image as HTMLCanvasElement, text);
    tex.needsUpdate = true;
    s.userData.name = text;
  };

  /* Lampadaires et arbres */
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.55, metalness: 0.5 });
  const poleGeo = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.11, 8, 6).translate(0, 4, 0).toNonIndexed(), box(0.1, 0.08, 2.2, 0, 8, 1.1).toNonIndexed()]);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, props.lamps.length);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffdca0, emissiveIntensity: 0 });
  const bulbs = new THREE.InstancedMesh(box(0.28, 0.05, 0.6, 0, 7.94, 1.8), bulbMat, props.lamps.length);
  const glow = glowTexture();
  const pools = new THREE.InstancedMesh(flat(16, 16, 0, 0.13, 2), new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), props.lamps.length);
  const o = new THREE.Object3D();
  props.lamps.forEach((l, i) => {
    o.position.set(l.x, 0, l.z);
    o.rotation.set(0, l.rot, 0);
    o.updateMatrix();
    poles.setMatrixAt(i, o.matrix);
    bulbs.setMatrixAt(i, o.matrix);
    pools.setMatrixAt(i, o.matrix);
  });
  scene.add(poles, bulbs, pools);

  const round = props.trees.filter((t) => !t.palm), palms = props.trees.filter((t) => t.palm);
  const bark = new THREE.MeshStandardMaterial({ color: 0x5c4531, roughness: 1, envMapIntensity: 0.2 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1, flatShading: true, envMapIntensity: 0.2 });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.28, 1, 6).translate(0, 0.5, 0), bark, props.trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaves, round.length);
  // Palmier : un bouquet de palmes retombantes en étoile, très peu de faces.
  const frond = new THREE.ConeGeometry(0.5, 3.4, 4).rotateX(Math.PI / 2).translate(0, -0.4, 1.8);
  frond.rotateX(0.35);
  const palmGeo = mergeGeometries(Array.from({ length: 7 }, (_, i) => frond.clone().rotateY((i / 7) * Math.PI * 2).toNonIndexed()));
  const palmTops = new THREE.InstancedMesh(palmGeo, leaves, palms.length);
  crowns.castShadow = palmTops.castShadow = !low;
  props.trees.forEach((t, i) => {
    o.rotation.set(0, i, 0);
    o.position.set(t.x, 0, t.z);
    o.scale.set(t.palm ? 0.8 : 1, t.h * (t.palm ? 1 : 0.7), t.palm ? 0.8 : 1);
    o.updateMatrix();
    trunkMesh.setMatrixAt(i, o.matrix);
  });
  round.forEach((t, i) => {
    o.position.set(t.x, t.h * 0.8, t.z);
    o.scale.setScalar(1.6 + (i % 5) * 0.3);
    o.rotation.set(0, i, 0);
    o.updateMatrix();
    crowns.setMatrixAt(i, o.matrix);
  });
  palms.forEach((t, i) => {
    o.position.set(t.x, t.h, t.z);
    o.scale.setScalar(1);
    o.rotation.set(0, i, 0);
    o.updateMatrix();
    palmTops.setMatrixAt(i, o.matrix);
  });
  scene.add(trunkMesh, crowns, palmTops);

  return {
    near(x, z) {
      const close = nameable.map((p) => ({ p, d: Math.hypot(p.x - x, p.z - z) })).filter((e) => e.d < 110).sort((a, b) => a.d - b.d).slice(0, NEARBY_LABELS);
      nearbySprites.forEach((s, i) => {
        const e = close[i];
        s.visible = !!e;
        if (!e) return;
        if (s.userData.name !== e.p.n) setLabel(s, e.p.n);
        s.position.set(e.p.x, e.p.y, e.p.z);
      });
    },
    night(on) {
      buildingMat.emissiveIntensity = on ? 0.85 : 0;
      district.night(on);
      places.night(on);
      landmarks.night(on);
      casef.night(on);
      bulbMat.emissiveIntensity = on ? 3 : 0;
      pools.visible = on;
    },
    dispose() {
      [facades, lit, glow, groundMap].forEach((t) => t.dispose());
      district.dispose();
      places.dispose();
      landmarks.dispose();
      casef.dispose();
      labels.forEach((s) => s.material.map?.dispose());
    },
  };
}
