import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, flatGeometry, polygonFlat, ribbon } from './kit';
import type { LomeData } from './lome';
import { mulberry, type Pt } from './sim';

/**
 * Hôtel du 2 Février et place de l'Indépendance, d'après des vidéos de référence (drone et vue de nuit) recoupées avec le plan.
 * Les emprises viennent d'OpenStreetMap ; les dimensions de la tour sont déduites du dôme (27 m) et de sa hauteur publiée (102 m).
 * Aucune image de ces vidéos n'est intégrée : tout est redessiné.
 */
const TOWER = { w: 50, d: 18, roof: 92 };
const R_DISC = 31, R_OUT = 72;
/** Couches de la place, assez espacées pour ne pas scintiller vues de loin. */
const LAYER = { base: 0.09, a: 0.15, b: 0.21, c: 0.27, top: 0.33 };
const centre = (p: Pt[]) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length] as Pt, [0, 0] as Pt);
/** Azimut compté depuis le nord vers l'est ; x croît vers l'ouest dans le jeu. */
const polar = (az: number, r: number): Pt => [-Math.sin(az) * r, Math.cos(az) * r];
const rad = (d: number) => (d * Math.PI) / 180;
const faceted = (g: THREE.BufferGeometry) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };

function sector(r1: number, r2: number, az: number, half: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) pts.push(polar(rad(az - half + (i / 10) * 2 * half), r2));
  for (let i = 10; i >= 0; i--) pts.push(polar(rad(az - half + (i / 10) * 2 * half), r1));
  return pts;
}
const disc = (r: number, n = 40): Pt[] => Array.from({ length: n }, (_, i) => polar((i / n) * Math.PI * 2, r));

/** Arbres vus sur les vidéos : palmiers du jardin du dôme, conifères de l'entrée, arbustes des allées de la place. */
export function districtTrees(data: LomeData) {
  const rand = mulberry(29);
  const trees: { x: number; z: number; h: number; palm: boolean }[] = [];
  const dome = data.buildings.find((b) => b.dome);
  if (dome) {
    const [x, z] = centre(dome.p);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = 17 + rand() * 22;
      trees.push({ x: x + Math.sin(a) * r, z: z + Math.cos(a) * r, h: 6 + rand() * 4, palm: true });
    }
  }
  for (const az of [45, 135, 225, 315]) for (let r = R_DISC + 6; r < R_OUT - 2; r += 7) for (const off of [-1, 1]) {
    const [x, z] = polar(rad(az + (off * 5.5 * 44) / r), r);
    trees.push({ x, z, h: 3, palm: false });
  }
  // Palmiers plantés juste derrière la clôture du CASEF, visibles sur les photos depuis l'avenue.
  const [ax, az] = centre(data.casefArea.length ? data.casefArea : [[0, 0]]);
  data.casefFence.forEach(([a], i) => {
    if (i % 3) return;
    const d = Math.hypot(ax - a[0], az - a[1]) || 1;
    trees.push({ x: a[0] + ((ax - a[0]) / d) * 3.5, z: a[1] + ((az - a[1]) / d) * 3.5, h: 7 + rand() * 4, palm: true });
  });
  return trees;
}

export const MONUMENT_SOLID = (data: LomeData): Pt[] => {
  void data;
  const r = 5.5;
  return [[-r, -r], [r, -r], [r, r], [-r, r]];
};

/** Grande face vitrée : ciel reflété en haut, ville sombre et bronzée en bas, trame de vitrages. */
function glassTexture(lit: boolean) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d')!;
  const rand = mulberry(lit ? 11 : 12);
  const cols = 24, rows = 30, cw = 512 / cols, ch = 1024 / rows;
  if (lit) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 1024);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (rand() > (y === 1 ? 0.7 : 0.06)) continue;
      g.fillStyle = rand() > 0.5 ? '#ffd9a0' : '#fff0d0';
      g.fillRect(x * cw + 6, y * ch + 9, cw - 12, ch - 18);
    }
  } else {
    // Chaque vitrage reflète un peu différemment : c'est ce qui fait lire le miroir, plus que le dégradé.
    for (let y = 0; y < rows; y++) {
      const wave = Math.sin(y * 0.9) * 0.018;
      for (let x = 0; x < cols; x++) {
        const v = (y + 0.5) / rows + Math.sin(x * 0.7 + y) * 0.012 + wave;
        const n = rand() * 0.45;
        let color: string;
        if (v < 0.42) {
          const k = v / 0.42;
          color = `rgb(${Math.round(34 + 52 * k + n * 18)},${Math.round(74 + 66 * k + n * 22)},${Math.round(118 + 62 * k + n * 22)})`;
        } else if (v < 0.47) color = `rgb(${Math.round(30 + n * 30)},${Math.round(36 + n * 30)},${Math.round(40 + n * 30)})`;
        else {
          const light = rand() > 0.97 ? 34 : 0;
          color = `rgb(${Math.round(30 + n * 24 + light)},${Math.round(20 + n * 15 + light * 0.8)},${Math.round(12 + n * 9 + light * 0.55)})`;
        }
        g.fillStyle = color;
        g.fillRect(x * cw, y * ch, cw + 1, ch + 1);
      }
    }
    // Ville reflétée : bandes horizontales ondulées, claires et sombres, dans le bas de la façade.
    for (let i = 0; i < 70; i++) {
      const y = 500 + rand() * 520;
      g.strokeStyle = ['rgba(150,112,74,.2)', 'rgba(8,6,4,.32)', 'rgba(86,100,70,.16)', 'rgba(190,175,150,.13)'][i % 4]!;
      g.lineWidth = 4 + rand() * 18;
      g.beginPath();
      const x0 = rand() * 380;
      g.moveTo(x0, y);
      for (let x = x0; x < x0 + 120 + rand() * 340; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
    g.lineWidth = 1;
    for (let x = 0; x <= cols; x++) { g.strokeStyle = 'rgba(190,200,205,.22)'; g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, 1024); g.stroke(); }
    for (let y = 0; y <= rows; y++) { g.strokeStyle = y / rows < 0.45 ? 'rgba(205,215,222,.32)' : 'rgba(150,130,110,.2)'; g.beginPath(); g.moveTo(0, y * ch); g.lineTo(512, y * ch); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pignon : pilier blanc portant le nom, bande bronze (bleue la nuit), pilier blanc. */
function endTexture(lit: boolean) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const g = c.getContext('2d')!;
  const x1 = 256 * 0.45, x2 = 256 * 0.65;
  g.fillStyle = lit ? '#000' : '#f4f3ee';
  g.fillRect(0, 0, 256, 1024);
  if (lit) {
    g.fillStyle = '#1438d8';
    g.fillRect(x1, 40, x2 - x1, 984);
    g.fillStyle = '#39c6ff';
    for (let y = 60; y < 1010; y += 26) g.fillRect(x2 - 14, y, 12, 5);
  } else {
    const band = g.createLinearGradient(x1, 0, x2, 0);
    band.addColorStop(0, '#6e4a2c');
    band.addColorStop(1, '#a07a55');
    g.fillStyle = band;
    g.fillRect(x1, 0, x2 - x1, 1024);
  }
  g.save();
  g.translate(58, 60);
  g.rotate(Math.PI / 2);
  g.fillStyle = lit ? '#ffffff' : '#2c2a28';
  g.font = '600 46px sans-serif';
  g.textBaseline = 'middle';
  g.fillText('HOTEL 2 FEVRIER', 0, 0, 430);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Ailettes blanches du socle : une travée, répétée le long des façades. */
function finTexture(lit: boolean) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000' : '#f1f0ea';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = lit ? '#ffcf8f' : '#23262a';
  g.fillRect(36, 20, 28, lit ? 60 : 108);
  if (!lit) { g.fillStyle = '#3c4247'; g.fillRect(36, 76, 28, 6); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function podium(ring: Pt[], h: number) {
  const loop = [...ring];
  if (loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) > 0) loop.reverse();
  const pos: number[] = [], uv: number[] = [];
  loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    const u = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3.2));
    pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], 0, a[1], b[0], h, b[1], a[0], h, a[1]);
    uv.push(0, 0, u, 0, u, 1, 0, 0, u, 1, 0, 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildHotelDistrict(scene: THREE.Scene, data: LomeData, low: boolean) {
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T) => { textures.push(t); return t; };
  const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.3, ...extra });
  const glowing: { mat: THREE.MeshStandardMaterial; power: number }[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && !low;
    mesh.receiveShadow = !low;
    scene.add(mesh);
    return mesh;
  };
  const white = std(0xeeece6, 0.7);

  /* Place de l'Indépendance : disque blanc, quatre allées diagonales, pelouses et bassins entre elles */
  const lawn = std(0x4f8f3a, 1), hedge = std(0x2f6a2c, 1), water = std(0x2f8fa3, 0.15, { metalness: 0.3 }), rim = std(0xe6e3da, 0.8), sand = std(0xc9b48e, 0.9), paving = std(0xd9d1c4, 0.9);
  add(polygonFlat([disc(R_OUT + 1)], LAYER.base), std(0xbfb6a6, 0.95), false);
  add(polygonFlat([disc(R_DISC)], LAYER.top), white, false);
  for (const az of [45, 135, 225, 315]) {
    add(polygonFlat([sector(R_DISC, R_OUT, az, (9 * 44) / 50)], LAYER.a), paving, false);
    const lines: number[] = [];
    for (let r = R_DISC + 3; r < R_OUT; r += 3.5) {
      const half = rad((8 * 44) / 50);
      ribbon([polar(rad(az) - half, r), polar(rad(az) + half, r)], 0.16, LAYER.b, lines);
    }
    add(flatGeometry(lines), std(0x8d8578, 0.9), false);
  }
  for (const az of [0, 270]) {
    add(polygonFlat([sector(R_DISC + 2, R_OUT, az, 33)], LAYER.a), lawn, false);
    add(polygonFlat([sector(R_OUT - 2, R_OUT, az, 33), sector(R_DISC + 2, R_DISC + 3.5, az, 33)], LAYER.b), hedge, false);
  }
  for (const az of [180, 90]) {
    // Bassins à gradins ; côté est, une pelouse borde le bassin.
    const outer = az === 90 ? 58 : 68;
    add(polygonFlat([sector(R_DISC + 3, outer + 2, az, 32)], LAYER.a), rim, false);
    add(polygonFlat([sector(R_DISC + 5, outer, az, 30)], LAYER.b), water, false);
    add(polygonFlat([sector(R_DISC + 13, outer - 8, az, 18)], LAYER.c), rim, false);
    add(polygonFlat([sector(R_DISC + 15, outer - 10, az, 14)], LAYER.top), sand, false);
    if (az === 90) add(polygonFlat([sector(60, R_OUT, az, 33)], LAYER.a), lawn, false);
  }
  // Petites pyramides blanches aux angles des pelouses, et massifs circulaires.
  for (const az of [-28, 28, 242, 298, 62, 118]) {
    const [x, z] = polar(rad(az), 64);
    const cone = add(new THREE.ConeGeometry(1.5, 2.8, 4).translate(x, 1.45, z), white);
    cone.castShadow = !low;
  }
  for (const az of [0, 270]) {
    const [x, z] = polar(rad(az), 54);
    const bed: number[] = [];
    const ringPts = Array.from({ length: 21 }, (_, i) => [x + Math.sin((i / 20) * Math.PI * 2) * 3, z + Math.cos((i / 20) * Math.PI * 2) * 3] as Pt);
    ribbon(ringPts, 1.1, LAYER.c, bed);
    add(flatGeometry(bed), hedge, false);
  }

  /* Monument : le front gravé regarde l'hôtel */
  const hotel = data.buildings.find((b) => b.n === 'Hôtel 2 Février');
  const [hx, hz] = hotel ? centre(hotel.p) : [111, -152] as Pt;
  const faceHotel = Math.atan2(hx, hz);
  const lawnSquare = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), lawn);
  lawnSquare.position.y = LAYER.top + 0.06;
  lawnSquare.rotation.y = faceHotel;
  lawnSquare.receiveShadow = !low;
  scene.add(lawnSquare);
  const monument = new THREE.Group();
  const stone = std(0x9c7c61, 0.95), carved = std(0x5c4b3b, 1), relief = std(0x776350, 1);
  monument.add(new THREE.Mesh(box(4.4, 11.2, 0.8, 0, 5.6, 0), stone));
  monument.add(new THREE.Mesh(box(4, 2, 0.3, 0, 1.1, 0.5), relief));
  for (const y of [6.2, 7.2, 8.2]) monument.add(new THREE.Mesh(box(2.6, 0.45, 0.06, 0, y, 0.42), carved));
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 2.1, 0, 0);
    wing.rotation.y = side * -0.72;
    // Aile à sommet incliné, plus haute vers l'extérieur, avec ses bandes ajourées.
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4, 0), new THREE.Vector2(4, 14), new THREE.Vector2(0, 11.4)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false }).translate(0, 0, -0.35);
    if (side < 0) geo.rotateY(Math.PI);
    wing.add(new THREE.Mesh(geo, stone));
    for (const off of [0.9, 2, 3.1]) wing.add(new THREE.Mesh(box(0.55, 9.5, 0.1, side * off, 6.4, 0.38), carved));
    monument.add(wing);
  }
  monument.position.y = LAYER.top;
  monument.rotation.y = faceHotel;
  monument.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = !low; });
  scene.add(monument);

  /* Socle de l'hôtel, sur l'emprise de la carte */
  const finDay = keep(finTexture(false)), finLit = keep(finTexture(true));
  const finMat = new THREE.MeshStandardMaterial({ map: finDay, emissive: 0xffffff, emissiveMap: finLit, emissiveIntensity: 0, roughness: 0.7, envMapIntensity: 0.3 });
  glowing.push({ mat: finMat, power: 0.8 });
  if (hotel) {
    add(podium(hotel.p, hotel.h), finMat);
    add(polygonFlat([hotel.p], hotel.h), std(0x9ea39f, 0.9));
    const [cx, cz] = centre(hotel.p);
    const rooftop = mulberry(5);
    for (let i = 0; i < 12; i++) {
      const a = rooftop() * Math.PI * 2, r = 22 + rooftop() * 22;
      add(box(1.4 + rooftop() * 2, 0.9, 1.2 + rooftop() * 2, cx + Math.sin(a) * r, hotel.h + 0.45, cz + Math.cos(a) * r), std(0xc9c9c4));
    }
  }

  /* Tour : deux grandes faces vitrées, deux pignons blancs à bande bronze */
  const tower = new THREE.Group();
  const glassDay = keep(glassTexture(false)), glassLit = keep(glassTexture(true)), endDay = keep(endTexture(false)), endLit = keep(endTexture(true));
  const glassMat = new THREE.MeshStandardMaterial({ map: glassDay, emissive: 0xffffff, emissiveMap: glassLit, emissiveIntensity: 0, roughness: 0.18, metalness: 0.45, envMapIntensity: 0.5 });
  const endMat = new THREE.MeshStandardMaterial({ map: endDay, emissive: 0xffffff, emissiveMap: endLit, emissiveIntensity: 0, roughness: 0.75, envMapIntensity: 0.3 });
  glowing.push({ mat: glassMat, power: 1 }, { mat: endMat, power: 1.5 });
  const shaftH = TOWER.roof;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(TOWER.w, shaftH, TOWER.d).translate(0, shaftH / 2, 0), [endMat, endMat, white, white, glassMat, glassMat]);
  shaft.castShadow = !low;
  tower.add(shaft);
  tower.add(new THREE.Mesh(box(TOWER.w + 0.3, 0.8, TOWER.d + 0.3, 0, TOWER.roof + 0.4, 0), white));
  // Toit : volume technique en pyramide tronquée, mât et sphère radar côté pignon nommé.
  const pent = new THREE.CylinderGeometry(0.62, 1, 5.5, 4, 1).rotateY(Math.PI / 4).scale(TOWER.w * 0.42, 1, TOWER.d * 0.42).translate(-3, TOWER.roof + 3.4, 0);
  tower.add(new THREE.Mesh(faceted(pent), std(0xe6e6e2, 0.45, { metalness: 0.3 })));
  for (const x of [-13, -6, 1, 8]) for (const z of [TOWER.d * 0.325, -TOWER.d * 0.325]) tower.add(new THREE.Mesh(box(4.2, 2.2, 0.2, x, TOWER.roof + 3.1, z), std(0x20262b, 0.3)));
  for (const [x, z] of [[14, 5], [17, -4], [-20, 5], [10, -6]] as const) tower.add(new THREE.Mesh(box(2.2, 1.2, 1.6, x, TOWER.roof + 1.3, z), std(0xcfcfca)));
  const metal = std(0xb49870, 0.5, { metalness: 0.5 });
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.7, 12, 4).translate(-12, TOWER.roof + 6.3, -4), metal));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 8).translate(-12, TOWER.roof + 8, -4), metal));
  const sx = 20, sz = 3;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) tower.add(new THREE.Mesh(box(0.2, 3, 0.2, sx + a, TOWER.roof + 2.3, sz + b), metal));
  tower.add(new THREE.Mesh(box(2.6, 0.2, 2.6, sx, TOWER.roof + 3.8, sz), metal));
  tower.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12).translate(sx, TOWER.roof + 5.3, sz), std(0xe8e6dc, 0.5)));
  tower.position.set(hx, 0, hz);
  // La grande face regarde le monument : l'axe monument, dôme, tour se lit sur le plan.
  tower.rotation.y = Math.atan2(-hx, -hz);
  scene.add(tower);

  /* Dôme blanc nervuré, dans son jardin */
  const domeB = data.buildings.find((b) => b.dome);
  if (domeB) {
    const [x, z] = centre(domeB.p);
    const r = Math.max(...domeB.p.map((q) => Math.hypot(q[0] - x, q[1] - z)));
    const garden = polygonFlat([Array.from({ length: 32 }, (_, i) => [x + Math.sin((i / 32) * Math.PI * 2) * (r + 26), z + Math.cos((i / 32) * Math.PI * 2) * (r + 26)] as Pt)], 0.05);
    add(garden, lawn, false);
    const dome = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1).translate(x, 0.1, z);
    // Facettes franches : les panneaux du dôme accrochent la lumière comme sur la vidéo.
    add(faceted(dome), std(0xf6f6f2, 0.45, { flatShading: true }));
    add(new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.9, 32, 1, true).translate(x, 0.45, z), std(0x8f9496, 0.8));
  }

  /* Allée d'entrée : auvent à toit vert, bordures rouges et blanches, bornes lumineuses, conifères */
  const drive = data.roads.filter((r) => r.n === 'Rue des Congrès de Lomé');
  const entry = drive.flatMap((r) => r.p);
  const lamps: { x: number; z: number }[] = [];
  const kerbRed: number[] = [], kerbWhite: number[] = [];
  const kerbRoads = data.roads.filter((r) => r.n === 'Rue des Congrès de Lomé' || r.n === "Rue Monument de l'independance" || r.n === 'Rue 24');
  for (const road of kerbRoads) {
    let walked = 0;
    road.p.slice(1).forEach((q, i) => {
      const a = road.p[i]!;
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1;
      const ux = (q[0] - a[0]) / len, uz = (q[1] - a[1]) / len;
      for (const side of [1, -1]) {
        for (let m = 0; m + 1.4 < len; m += 1.5) {
          const s: Pt = [a[0] + ux * m - uz * side * (road.w / 2 + 0.2), a[1] + uz * m + ux * side * (road.w / 2 + 0.2)];
          ribbon([s, [s[0] + ux * 1.4, s[1] + uz * 1.4]], 0.45, 0.13, Math.floor((walked + m) / 1.5) % 2 ? kerbRed : kerbWhite);
        }
      }
      if (road.n === 'Rue des Congrès de Lomé') for (let m = 3; m < len; m += 7) lamps.push({ x: a[0] + ux * m - uz * (road.w / 2 + 1.1), z: a[1] + uz * m + ux * (road.w / 2 + 1.1) });
      walked += len;
    });
  }
  if (kerbRed.length) add(flatGeometry(kerbRed), std(0xb9352b, 0.8), false);
  if (kerbWhite.length) add(flatGeometry(kerbWhite), std(0xece9e0, 0.8), false);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  glowing.push({ mat: headMat, power: 4 });
  if (lamps.length) {
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 1.1, 8).translate(0, 0.55, 0), std(0xd8d6ce, 0.6), lamps.length);
    const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8).translate(0, 1.18, 0), headMat, lamps.length);
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => { o.position.set(l.x, 0, l.z); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix); });
    scene.add(posts, heads);
  }
  if (entry.length > 1) {
    // Sur la vidéo, l'auvent est sur l'allée, à droite du dôme vu depuis le monument (au nord-ouest).
    const spot = domeB ? (() => { const [x, z] = centre(domeB.p); return [x + 36, z + 16] as Pt; })() : entry[0]!;
    let best = Infinity, mid: Pt = entry[0]!, heading = 0;
    for (const road of drive) road.p.slice(1).forEach((q, i) => {
      const a = road.p[i]!;
      const m: Pt = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2];
      const d = Math.hypot(m[0] - spot[0], m[1] - spot[1]);
      if (d < best) { best = d; mid = m; heading = Math.atan2(q[0] - a[0], q[1] - a[1]); }
    });
    const canopy = new THREE.Group();
    canopy.add(new THREE.Mesh(box(13, 0.7, 20, 0, 5.8, 0), std(0x2f8a78, 0.6)));
    canopy.add(new THREE.Mesh(box(13.4, 0.3, 20.4, 0, 5.4, 0), white));
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0d0, emissiveIntensity: 0.2 });
    glowing.push({ mat: lightMat, power: 4 });
    for (const x of [-3.5, 3.5]) for (let z = -8; z <= 8; z += 4) canopy.add(new THREE.Mesh(box(0.5, 0.05, 0.5, x, 5.22, z), lightMat));
    for (const x of [-6, 6]) for (const z of [-9, 9]) canopy.add(new THREE.Mesh(box(0.35, 5.3, 0.35, x, 2.65, z), white));
    canopy.position.set(mid[0], 0.08, mid[1]);
    canopy.rotation.y = heading;
    canopy.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = !low; });
    scene.add(canopy);
    const fir = std(0x234f2c, 1, { flatShading: true });
    for (const [off, along] of [[-11, -6], [-12, 3], [-11, 12], [-15, 8], [11, -14], [12, 15]] as const) {
      const x = mid[0] + Math.sin(heading) * along + Math.cos(heading) * off;
      const z = mid[1] + Math.cos(heading) * along - Math.sin(heading) * off;
      add(mergeGeometries([new THREE.ConeGeometry(2.6, 12, 7).translate(x, 7, z).toNonIndexed(), new THREE.CylinderGeometry(0.25, 0.35, 2, 6).translate(x, 1, z).toNonIndexed()]), fir);
    }
  }

  const toMonument = Math.hypot(hx, hz) || 1;
  return {
    hotelLabel: [hx - (hx / toMonument) * 62, hz - (hz / toMonument) * 62] as Pt,
    night(on: boolean) {
      for (const g of glowing) g.mat.emissiveIntensity = on ? g.power : 0;
      glassMat.color.setHex(on ? 0x555a60 : 0xffffff);
    },
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
