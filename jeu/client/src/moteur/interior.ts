import * as THREE from 'three';
import { box } from './kit';
import type { Pt, Room } from './sim';

/**
 * Intérieurs génériques, imaginés pour le jeu : aucun ne reproduit l'intérieur d'un bâtiment réel.
 * Ils sont construits loin de la ville, hors de la vue, et Honorable y est transporté en passant la porte.
 */
export type InteriorKind = 'maison' | 'bureau';
const ORIGIN: Record<InteriorKind, Pt> = { maison: [9000, 9000], bureau: [9100, 9000] };
const W = 16, D = 12, H = 3.6;

function canvasTexture(draw: (g: CanvasRenderingContext2D) => void, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildInterior(scene: THREE.Scene, kind: InteriorKind, low: boolean): Omit<Room, 'name'> {
  const [ox, oz] = ORIGIN[kind];
  const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz - D / 2, z1 = oz + D / 2;
  const group = new THREE.Group();
  scene.add(group);
  const solids: Pt[][] = [];
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, envMapIntensity: 0.3, ...extra });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow && !low; mesh.receiveShadow = !low; group.add(mesh); return mesh; };
  /** Meuble posé au sol, en coordonnées de la pièce (origine au centre), et son emprise pour les collisions. */
  const furniture = (w: number, h: number, d: number, x: number, z: number, m: THREE.Material, y = h / 2, solid = true) => {
    add(box(w, h, d, ox + x, y, oz + z), m);
    if (solid) solids.push([[ox + x - w / 2, oz + z - d / 2], [ox + x + w / 2, oz + z - d / 2], [ox + x + w / 2, oz + z + d / 2], [ox + x - w / 2, oz + z + d / 2]]);
  };

  const floorTex = kind === 'maison'
    ? canvasTexture((g) => { g.fillStyle = '#8a5a36'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? '#7d5030' : '#94643e'; g.fillRect(0, y, 256, 30); g.fillStyle = '#5e3c22'; g.fillRect(((y * 37) % 200) + 20, y, 2, 30); } })
    : canvasTexture((g) => { g.fillStyle = '#d9d8d2'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b9b8b1'; for (let i = 0; i <= 256; i += 64) { g.fillRect(i, 0, 3, 256); g.fillRect(0, i, 256, 3); } });
  floorTex.repeat.set(W / 4, D / 4);
  add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(ox, 0.01, oz), std(0xffffff, { map: floorTex, roughness: 0.6 }), false);
  const wallMat = std(kind === 'maison' ? 0xe9dcc3 : 0xf1f1ee, { side: THREE.DoubleSide });
  add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(ox, H, oz), std(0xf6f4ef, { side: THREE.DoubleSide }), false);
  for (const [w, x, z, rot] of [[W, ox, z0, 0], [W, ox, z1, Math.PI], [D, x0, oz, Math.PI / 2], [D, x1, oz, -Math.PI / 2]] as const) {
    add(new THREE.PlaneGeometry(w, H).rotateY(rot).translate(x, H / 2, z), wallMat, false);
    add(new THREE.BoxGeometry(w, 0.12, 0.04).rotateY(rot).translate(x + Math.sin(rot) * 0.02, 0.06, z + Math.cos(rot) * 0.02), std(kind === 'maison' ? 0x6b4a30 : 0x9a9a96), false);
  }
  // Porte d'entrée, ouverte sur la lumière du dehors, et fenêtres.
  const daylight = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false });
  add(new THREE.PlaneGeometry(1.4, 2.3).translate(ox, 1.15, z0 + 0.02), daylight, false);
  const frame = std(kind === 'maison' ? 0x5e3c22 : 0x6f7378);
  add(box(0.12, 2.45, 0.14, ox - 0.76, 1.22, z0 + 0.05), frame, false);
  add(box(0.12, 2.45, 0.14, ox + 0.76, 1.22, z0 + 0.05), frame, false);
  add(box(1.64, 0.12, 0.14, ox, 2.42, z0 + 0.05), frame, false);
  const sky = new THREE.MeshBasicMaterial({ color: 0xbfe0f4, fog: false });
  for (const z of [-2.5, 2.5]) for (const side of [-1, 1]) {
    const x = side > 0 ? x1 - 0.02 : x0 + 0.02;
    add(new THREE.PlaneGeometry(2.2, 1.3).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(x, 1.75, oz + z), sky, false);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false });
  for (const x of [-4, 0, 4]) add(box(1.2, 0.04, 0.5, ox + x, H - 0.03, oz), lampMat, false);
  const light = new THREE.PointLight(0xfff0dc, 14, 0, 1.4);
  light.position.set(ox, H - 0.4, oz);
  group.add(light);

  if (kind === 'maison') {
    // Salon et coin repas.
    const fabric = std(0x8c3b2a), wood = std(0x6b4a30), dark = std(0x1a1b1e);
    furniture(3.2, 0.45, 1.0, -4, 3.6, fabric, 0.22);
    furniture(3.2, 0.5, 0.25, -4, 4.15, fabric, 0.7, false);
    for (const x of [-5.7, -2.3]) furniture(0.25, 0.6, 1.0, x, 3.6, fabric, 0.3, false);
    furniture(1.4, 0.4, 0.8, -4, 1.9, wood, 0.2);
    furniture(2.4, 0.5, 0.45, -4, -0.4, wood, 0.25);
    add(box(1.6, 0.9, 0.06, ox - 4, 1.0, oz - 0.4), dark);
    add(new THREE.PlaneGeometry(1.5, 0.82).translate(ox - 4, 1.0, oz - 0.36), new THREE.MeshBasicMaterial({ color: 0x2a4f7a }), false);
    const rug = canvasTexture((g) => { g.fillStyle = '#b8462a'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#f2c14e'; for (let i = 0; i < 8; i++) { g.fillRect(i * 32, 0, 12, 256); } g.fillStyle = '#1f5f4a'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 32 + 10, 256, 6); });
    add(new THREE.PlaneGeometry(3.6, 2.6).rotateX(-Math.PI / 2).translate(ox - 4, 0.02, oz + 2), std(0xffffff, { map: rug }), false);
    furniture(2.2, 0.06, 1.2, 4, 1.5, wood, 0.76);
    for (const x of [3.1, 4.9]) for (const z of [0.7, 2.3]) { furniture(0.45, 0.45, 0.45, x, z, wood, 0.22, false); add(box(0.45, 0.5, 0.05, ox + x, 0.7, oz + z + (z < 1.5 ? -0.2 : 0.2)), wood); }
    for (const [x, z] of [[3.3, 1.5], [4.7, 1.5]] as const) add(box(0.06, 0.74, 0.06, ox + x, 0.37, oz + z), wood);
    furniture(0.5, 2.0, 2.4, 7.6, -3, wood, 1.0);
    const wax = canvasTexture((g) => { g.fillStyle = '#1f5fae'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.fillStyle = (i + j) % 2 ? '#f2c14e' : '#d9482b'; g.beginPath(); g.arc(i * 46 + 23, j * 46 + 23, 15, 0, Math.PI * 2); g.fill(); } });
    add(new THREE.PlaneGeometry(1.8, 1.2).translate(ox + 3, 2.0, z1 - 0.03).rotateY(0), std(0xffffff, { map: wax, side: THREE.DoubleSide }), false);
  } else {
    // Hall d'accueil : comptoir, bureaux, chaises d'attente.
    const counter = std(0x7a6a58), white = std(0xeeeeea), chair = std(0x2b3a55), dark = std(0x16171a);
    furniture(4.2, 1.1, 0.8, 0, 3.2, counter, 0.55);
    add(box(4.4, 0.06, 1.0, ox, 1.13, oz + 3.2), white);
    for (const x of [-5, 5]) {
      furniture(1.8, 0.06, 0.9, x, 0.2, white, 0.75);
      add(box(0.06, 0.72, 0.8, ox + x - 0.85, 0.36, oz + 0.2), white);
      add(box(0.06, 0.72, 0.8, ox + x + 0.85, 0.36, oz + 0.2), white);
      add(box(0.55, 0.36, 0.04, ox + x, 1.0, oz + 0.45), dark);
      furniture(0.5, 0.48, 0.5, x, -0.6, chair, 0.24, false);
    }
    for (let i = 0; i < 5; i++) furniture(0.5, 0.46, 0.5, -6.6 + i * 0.6, -4.4, chair, 0.23);
    for (let i = 0; i < 5; i++) add(box(0.5, 0.5, 0.06, ox - 6.6 + i * 0.6, 0.7, oz - 4.67), chair);
    furniture(0.35, 1.2, 0.35, 7.3, 4.8, std(0x9fc9e8, { roughness: 0.2 }), 0.6);
    const board = canvasTexture((g) => { g.fillStyle = '#c89a62'; g.fillRect(0, 0, 256, 160); for (let i = 0; i < 6; i++) { g.fillStyle = ['#fff', '#f8e7a0', '#d6ecff'][i % 3]!; g.fillRect(16 + (i % 3) * 80, 16 + Math.floor(i / 3) * 70, 64, 56); } }, 256, 160);
    add(new THREE.PlaneGeometry(2.4, 1.5).translate(ox, 1.9, z1 - 0.03).rotateY(0), std(0xffffff, { map: board, side: THREE.DoubleSide }), false);
  }
  // Plantes en pot dans les angles.
  const pot = std(0x9c5a3c), leaves = std(0x3f7a35, { flatShading: true });
  for (const [x, z] of [[-7.2, -5.2], [7.2, -5.2], [-7.2, 5.2]] as const) {
    furniture(0.5, 0.5, 0.5, x, z, pot, 0.25);
    add(new THREE.IcosahedronGeometry(0.5, 0).translate(ox + x, 1.0, oz + z), leaves);
  }

  return { x0, z0, x1, z1, solids, door: [ox, z0 + 0.6], spawn: { x: ox, z: z0 + 3.2, heading: 0 } };
}
