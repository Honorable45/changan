import * as THREE from 'three';
import { box } from './kit';

/**
 * CHANGAN Nevo Q05 (1re génération), modelée d'après les photographies du catalogue du site et celle de l'habitacle
 * envoyée par l'utilisateur. Dimensions : 4,54 m de long, 1,87 m de large, 1,65 m de haut, 2,66 m d'empattement.
 * Volumes et détails sont redessinés à la main : ce n'est pas un fichier 3D officiel de CHANGAN.
 * Repère : z vers l'avant, x vers la gauche du conducteur, y vers le haut, sol à y = 0.
 */
export const Q05 = { length: 4.54, width: 1.865, height: 1.65, wheelbase: 2.66, frontAxle: 1.35, track: 0.8, wheelRadius: 0.355, eye: 1.38 };

type Curve = [number, number][];
/** Valeur d'un profil défini par points, interpolée en douceur (Catmull-Rom). */
function profile(points: Curve) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[xs.length - 1]!) return ys[ys.length - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const t = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
    const p0 = ys[Math.max(0, i - 1)]!, p1 = ys[i]!, p2 = ys[i + 1]!, p3 = ys[Math.min(ys.length - 1, i + 2)]!;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}

// Silhouette relevée sur les vues du catalogue (z de l'arrière, -2,27, à l'avant, +2,27).
const TOP = profile([[-2.27, 0.78], [-2.25, 0.95], [-2.18, 1.06], [-2.07, 1.16], [-1.92, 1.28], [-1.72, 1.43], [-1.5, 1.53], [-1.1, 1.6], [-0.6, 1.632], [0.25, 1.65], [0.72, 1.57], [1.2, 1.3], [1.56, 1.07], [2.0, 0.99], [2.16, 0.93], [2.24, 0.84], [2.27, 0.74]]);
const BOTTOM = profile([[-2.27, 0.32], [-2.22, 0.28], [-1.9, 0.22], [1.9, 0.22], [2.2, 0.28], [2.27, 0.36]]);
const BELT = profile([[-2.27, 1.02], [-1.92, 1.18], [-1.2, 1.16], [0.6, 1.08], [1.56, 1.05], [2.27, 0.9]]);
const HALF = profile([[-2.27, 0.66], [-2.17, 0.86], [-1.95, 0.925], [1.75, 0.932], [2.08, 0.88], [2.27, 0.68]]);
const ROOF_HALF = profile([[-1.95, 0.62], [-1.6, 0.7], [0.5, 0.72], [1.5, 0.82]]);
/** La verrière va de la lunette au pare-brise. */
const GLASS: [number, number] = [-1.92, 1.56];
const WHEELS: [number, number][] = [[Q05.frontAxle, 1], [Q05.frontAxle - Q05.wheelbase, -1]];

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Arche de roue : le bas de caisse remonte en demi-cercle autour de chaque roue. */
function archBottom(z: number) {
  let y = BOTTOM(z);
  for (const [wz] of WHEELS) {
    const d = Math.abs(z - wz), r = 0.44;
    if (d < r) y = Math.max(y, Q05.wheelRadius + Math.sqrt(r * r - d * d) - 0.02);
  }
  return y;
}

/**
 * Caisse lissée : une suite de sections, du bas de caisse au toit. Chaque bande de la section a son matériau :
 * peinture sur la caisse, vitre sur la verrière, noir sur le pavillon flottant.
 */
function bodyGeometry() {
  const N = 72, z0 = -Q05.length / 2, z1 = Q05.length / 2;
  // Points d'une demi-section : y, demi-largeur, et matériau de la bande qui suit (0 peinture, 1 vitre, 2 noir).
  const section = (z: number) => {
    const bottom = archBottom(z), top = TOP(z), hw = HALF(z);
    const inGlass = z > GLASS[0] && z < GLASS[1];
    // Montant arrière couleur caisse, derrière la custode : seul le pavillon reste noir.
    const pillar = z < -1.62;
    const belt = Math.min(BELT(z), top - 0.02);
    const rw = inGlass ? Math.min(ROOF_HALF(z), hw * 0.85) : hw * 0.86;
    const shoulder = Math.min(belt - 0.08, bottom + (belt - bottom) * 0.72);
    // Habillage noir sur tout le bas : boucliers, bas de portes, passages de roues.
    const clad = bottom + (z > 1.95 ? 0.16 : z < -1.95 ? 0.26 : 0.17);
    return [
      [bottom, 0, 2], [bottom, hw * 0.88, 2], [bottom + 0.08, hw * 0.975, 2], [clad, hw * 0.995, 0], [shoulder, hw, 0], [belt, hw * 0.955, inGlass && !pillar ? 1 : 0],
      [inGlass ? top - 0.07 : top - 0.015, inGlass ? rw : rw * 1.02, inGlass ? 2 : 0], [top, rw * 0.72, inGlass ? 2 : 0], [top + 0.004, 0, 0],
    ] as [number, number, number][];
  };
  const pos: number[] = [], uv: number[] = [], groups: number[][] = [[], [], []];
  const per = 9, stride = per * 2;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = z0 + (z1 - z0) * t;
    const s = section(z);
    // Côté gauche (x positif) puis côté droit en miroir.
    for (const side of [1, -1]) for (const [y, w] of s) { pos.push(side * w, y, z); uv.push(t, y / 1.7); }
  }
  for (let i = 0; i < N; i++) {
    const zMid = z0 + (z1 - z0) * ((i + 0.5) / N);
    const s = section(zMid);
    for (let side = 0; side < 2; side++) for (let k = 0; k < per - 1; k++) {
      const a = i * stride + side * per + k, b = a + 1, c = a + stride, d = c + 1;
      const mat = s[k]![2];
      // L'ordre des sommets tourne les faces vers l'extérieur, des deux côtés (le côté droit est en miroir).
      if (side === 0) groups[mat]!.push(a, b, c, b, d, c); else groups[mat]!.push(a, c, b, b, c, d);
    }
  }
  // Faces d'extrémité : la face avant et la face arrière, refermées en éventail.
  const cap = (ring: number, front: boolean) => {
    const base = ring * stride;
    for (let side = 0; side < 2; side++) for (let k = 0; k < per - 1; k++) {
      const a = base + side * per + k, b = a + 1, c = base + (side === 0 ? per : 0) + per - 1;
      const m = 0;
      if ((side === 0) === front) groups[m]!.push(a, b, c); else groups[m]!.push(a, c, b);
    }
  };
  cap(N, true);
  cap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const index: number[] = [];
  groups.forEach((list, m) => { g.addGroup(index.length, list.length, m); index.push(...list); });
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Avant ou arrière de la caisse à la hauteur y : le z le plus avancé (ou reculé) où la section couvre cette hauteur. */
function endAt(y: number, front: boolean) {
  const step = 0.004;
  for (let z = front ? Q05.length / 2 : -Q05.length / 2; front ? z > 0 : z < 0; z += front ? -step : step) if (TOP(z) >= y && BOTTOM(z) <= y) return z;
  return front ? Q05.length / 2 - 0.3 : -Q05.length / 2 + 0.3;
}
/** Pose un détail sur la face avant ou arrière : x demandé, ramené dans la largeur de la caisse à cet endroit. */
function onEnd(x: number, y: number, front: boolean, out = 0.012) {
  // La face est plate au centre ; vers les angles, la caisse se rétrécit : on recule jusqu'à la largeur voulue.
  let z = endAt(y, front);
  for (let k = 0; k < 120 && HALF(z) * 0.98 < Math.abs(x); k++) z += front ? -0.004 : 0.004;
  return new THREE.Vector3(x, y, z + (front ? out : -out));
}

export type Q05Parts = {
  group: THREE.Group; wheels: THREE.Group[]; pivots: THREE.Group[]; shell: THREE.Object3D[];
  head: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial; left: THREE.MeshStandardMaterial; right: THREE.MeshStandardMaterial;
  eye: number; seat: null;
};

const shared = (() => {
  let cache: ReturnType<typeof make> | null = null;
  function make() {
    const body = bodyGeometry();
    // Lignes d'ouvrants et poignées affleurantes, peintes sur la peinture.
    const panel = canvasTexture(1024, 256, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = 'rgba(40,40,44,.75)'; g.lineWidth = 2;
      const x = (z: number) => ((z + Q05.length / 2) / Q05.length) * 1024, y = (h: number) => 256 - (h / 1.7) * 256;
      for (const z of [-0.55, 0.62]) { g.beginPath(); g.moveTo(x(z), y(0.38)); g.lineTo(x(z + 0.04), y(1.1)); g.stroke(); }
      g.beginPath(); g.moveTo(x(-1.45), y(0.42)); g.lineTo(x(-1.5), y(1.1)); g.stroke();
      g.beginPath(); g.moveTo(x(1.55), y(0.95)); g.lineTo(x(1.62), y(1.05)); g.stroke();
      g.fillStyle = 'rgba(30,30,34,.6)';
      for (const z of [-0.95, 0.15]) g.fillRect(x(z), y(1.0), 26, 4);
      // Trappe de recharge sur l'aile avant.
      g.strokeRect(x(1.62), y(0.98), 22, 18);
    });
    const tyre = new THREE.CylinderGeometry(Q05.wheelRadius, Q05.wheelRadius, 0.23, 28).rotateZ(Math.PI / 2);
    const rimTex = canvasTexture(256, 256, (g) => {
      // Jante 18 pouces bi-ton : cinq doubles branches gris clair sur fond anthracite.
      g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b9bdc2';
      for (let k = 0; k < 5; k++) for (const off of [-0.16, 0.16]) {
        const a = (k / 5) * Math.PI * 2 + off;
        g.save(); g.translate(128, 128); g.rotate(a); g.beginPath(); g.moveTo(-9, -22); g.lineTo(9, -22); g.lineTo(16, -118); g.lineTo(-4, -118); g.closePath(); g.fill(); g.restore();
      }
      g.fillStyle = '#c9ccd0'; g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1b1e'; g.beginPath(); g.arc(128, 128, 12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8d9196'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke();
    });
    const rim = new THREE.CircleGeometry(Q05.wheelRadius * 0.74, 32).rotateY(Math.PI / 2);
    return {
      body, panel, tyre, rim, rimTex,
      glass: new THREE.MeshStandardMaterial({ color: 0x24313c, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.4 }),
      black: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.3, metalness: 0.4 }),
      cladding: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.85 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.18, metalness: 1 }),
      rimMat: new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }),
      grille: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }),
    };
  }
  return () => (cache ??= make());
})();

function lamp(color: number) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.25 }); }

/** Nevo Q05 complète : caisse, verrière, pavillon noir, feux, habillages, roues. */
export function buildQ05(paint: THREE.Material): Q05Parts {
  const s = shared();
  const group = new THREE.Group();
  const shell: THREE.Object3D[] = [];
  const paintSide = (paint as THREE.MeshPhysicalMaterial).clone();
  (paintSide as THREE.MeshPhysicalMaterial).map = s.panel;
  // La couleur choisie reste celle du matériau partagé : on la recopie à chaque reconstruction.
  (paintSide as THREE.MeshPhysicalMaterial).color = (paint as THREE.MeshPhysicalMaterial).color;
  const body = new THREE.Mesh(s.body, [paintSide, s.glass, s.black]);
  body.castShadow = true;
  group.add(body);
  shell.push(body);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, inShell = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; group.add(mesh); if (inShell) shell.push(mesh); return mesh; };
  const head = lamp(0xf4f7ff), tail = lamp(0xd0101a), left = lamp(0xff9a1f), right = lamp(0xff9a1f);

  // Avant : bandeau lumineux continu en haut du nez, phares effilés aux angles, blocs en C sur le bouclier.
  const put = (g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3, yaw = 0, inShell = true) => { const mesh = add(g, m, inShell); mesh.position.copy(at); mesh.rotation.y = yaw; return mesh; };
  put(new THREE.BoxGeometry(1.34, 0.04, 0.03), s.black, onEnd(0, 0.86, true, 0.006));
  put(new THREE.BoxGeometry(1.3, 0.018, 0.03), head, onEnd(0, 0.865, true, 0.012), 0, false);
  for (const sx of [1, -1]) {
    put(new THREE.BoxGeometry(0.28, 0.035, 0.05), head, onEnd(sx * 0.62, 0.84, true), sx * 0.45, false);
    put(new THREE.BoxGeometry(0.22, 0.17, 0.06), s.black, onEnd(sx * 0.62, 0.58, true), sx * 0.4);
    put(new THREE.BoxGeometry(0.13, 0.02, 0.07), head, onEnd(sx * 0.6, 0.64, true, 0.02), sx * 0.4, false);
    put(new THREE.BoxGeometry(0.03, 0.12, 0.07), head, onEnd(sx * 0.7, 0.58, true, 0.02), sx * 0.4, false);
    put(new THREE.BoxGeometry(0.07, 0.025, 0.07), sx > 0 ? left : right, onEnd(sx * 0.74, 0.82, true, 0.02), sx * 0.5, false);
  }
  // Logo ovale CHANGAN, calandre basse trapézoïdale à lames, jonc argent.
  put(new THREE.TorusGeometry(0.045, 0.007, 6, 20).scale(1.5, 0.75, 1), s.chrome, onEnd(0, 0.8, true, 0.015));
  put(new THREE.BoxGeometry(0.03, 0.035, 0.012), s.chrome, onEnd(0, 0.8, true, 0.015));
  put(new THREE.BoxGeometry(0.95, 0.15, 0.06), s.grille, onEnd(0, 0.43, true));
  for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(0.9, 0.008, 0.065), s.black, onEnd(0, 0.37 + k * 0.035, true, 0.016));
  put(new THREE.BoxGeometry(1.2, 0.025, 0.06), s.chrome, onEnd(0, 0.33, true, 0.016));

  // Arrière : barre de feux rouges sur toute la largeur, pointes en flèche, bouclier noir, catadioptres, aileron.
  put(new THREE.BoxGeometry(1.45, 0.035, 0.03), tail, onEnd(0, 1.02, false), 0, false);
  for (const sx of [1, -1]) {
    put(new THREE.BoxGeometry(0.2, 0.07, 0.04), tail, onEnd(sx * 0.7, 1.02, false), -sx * 0.45, false);
    put(new THREE.BoxGeometry(0.08, 0.025, 0.04), sx > 0 ? left : right, onEnd(sx * 0.56, 0.97, false, 0.018), 0, false);
    put(new THREE.BoxGeometry(0.16, 0.025, 0.03), tail, onEnd(sx * 0.6, 0.43, false, 0.03), 0, false);
  }
  // Boucliers bas noirs, plaqués sur la caisse, avant et arrière ; sabot argenté à l'arrière.
  put(new THREE.BoxGeometry(HALF(endAt(0.42, false)) * 1.7, 0.22, 0.02), s.cladding, onEnd(0, 0.42, false, 0.004));
  put(new THREE.BoxGeometry(HALF(endAt(0.42, true)) * 1.5, 0.12, 0.02), s.cladding, onEnd(0, 0.42, true, 0.004));
  // Sabot argenté sur le bouclier noir.
  put(new THREE.BoxGeometry(0.6, 0.035, 0.06), s.chrome, onEnd(0, 0.38, false, 0.02));
  add(box(1.3, 0.04, 0.3, 0, TOP(-1.6) + 0.01, -1.72), s.black);
  add(box(0.25, 0.012, 0.02, 0, TOP(-1.6) + 0.035, -1.86), tail, false);

  // Rétroviseurs noirs, sur la portière avant.
  for (const sx of [1, -1]) {
    add(box(0.05, 0.035, 0.08, sx * 0.97, 1.13, 0.98), s.black);
    add(new THREE.SphereGeometry(0.11, 12, 8).scale(1.1, 0.6, 0.55).translate(sx * 1.06, 1.17, 0.95), s.black);
  }

  // Roues : pneu, jante bi-ton, sur pivot pour la direction.
  const wheels: THREE.Group[] = [], pivots: THREE.Group[] = [];
  for (const [wz] of WHEELS) for (const sx of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * Q05.track, Q05.wheelRadius, wz);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(s.tyre, s.rubber);
    tyre.castShadow = true;
    const face = new THREE.Mesh(s.rim, s.rimMat);
    face.position.x = sx * 0.117;
    if (sx < 0) face.rotation.y = Math.PI;
    spin.add(tyre, face);
    pivot.add(spin);
    group.add(pivot);
    wheels.push(spin);
    if (wz > 0) pivots.push(pivot);
  }
  return { group, wheels, pivots, shell, head, tail, left, right, eye: Q05.eye, seat: null };
}

/**
 * Habitacle de la Nevo Q05, d'après la photo envoyée et celles du catalogue, conduite à gauche :
 * planche de bord sombre à bandeau en suédine fauve, grand écran central flottant, combiné numérique fin derrière le volant,
 * volant à moyeu horizontal, pastilles de commandes cerclées de chrome, logo « (○) » et branche basse en V argentée.
 */
export function buildQ05Cabin(paint: THREE.Material) {
  const cabin = new THREE.Group();
  const soft = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.85 });
  const suede = new THREE.MeshStandardMaterial({ color: 0x8b6a4c, roughness: 0.95 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.2, metalness: 1 });
  const piano = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.15, metalness: 0.4 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(g, m); cabin.add(mesh); return mesh; };
  // Planche de bord : dessus sombre, bandeau fauve sur toute la largeur, partie basse noire.
  add(box(1.74, 0.11, 0.8, 0, 1.05, 0.98), soft);
  add(box(1.74, 0.13, 0.04, 0, 0.93, 0.6), suede);
  add(box(1.74, 0.3, 0.45, 0, 0.72, 0.8), soft);
  add(box(1.66, 0.08, 1.1, 0, 1.06, 1.85), paint);
  // Aérateurs en fente cerclés de chrome, aux extrémités, et deux sous l'écran.
  for (const x of [0.78, -0.78]) { add(box(0.16, 0.035, 0.03, x, 0.95, 0.585), chrome); add(box(0.14, 0.018, 0.031, x, 0.95, 0.583), piano); }
  for (const x of [0.07, -0.07]) { add(box(0.12, 0.045, 0.03, x, 0.83, 0.58), chrome); add(box(0.1, 0.03, 0.031, x, 0.83, 0.578), piano); }
  // Portes, montants et pavillon : le reste de la caisse est masqué depuis le volant.
  for (const side of [1, -1]) {
    add(box(0.08, 0.55, 1.9, side * 0.9, 0.85, 0.05), soft);
    add(box(0.09, 0.02, 0.5, side * 0.88, 1.0, 0.25), chrome);
    const pillar = add(new THREE.BoxGeometry(0.06, 0.82, 0.08), leather);
    pillar.position.set(side * 0.78, 1.42, 0.85);
    pillar.rotation.set(-0.95, 0, 0);
  }
  add(box(1.72, 0.04, 1.6, 0, 1.6, -0.15), new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.95 }));
  add(box(0.22, 0.05, 0.012, 0, 1.52, 0.42), new THREE.MeshStandardMaterial({ color: 0x8a939e, roughness: 0.05, metalness: 1 }));
  // Console centrale, porte-gobelets et accoudoir.
  add(box(0.26, 0.2, 1.1, 0, 0.6, -0.05), soft);
  for (const z of [0.18, 0.04]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16).translate(0, 0.705, z), piano);
  add(box(0.26, 0.08, 0.4, 0, 0.74, -0.42), leather);

  // Grand écran central flottant, réglages du véhicule à l'affichage.
  const screenTex = canvasTexture(768, 448, (g) => {
    g.fillStyle = '#0c1424'; g.fillRect(0, 0, 768, 448);
    g.fillStyle = '#16203a'; g.fillRect(0, 0, 768, 34);
    g.fillStyle = '#c9d3e6'; g.font = '500 18px sans-serif'; g.fillText('17:55', 18, 23);
    g.fillStyle = '#e8edf6'; g.font = '600 26px sans-serif'; g.fillText('Véhicule', 40, 82);
    ['Conduite', 'Aides', 'Carrosserie', 'Éclairage', 'Énergie', 'Son'].forEach((t, i) => {
      if (i === 5) { g.fillStyle = '#26314f'; g.beginPath(); g.roundRect(28, 108 + i * 46, 200, 38, 10); g.fill(); }
      g.fillStyle = '#b8c3d8'; g.font = '19px sans-serif'; g.fillText(t, 48, 133 + i * 46);
    });
    g.fillStyle = '#1b2540';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(250, 70 + i * 66, 300, 54, 10); g.fill(); }
    g.fillStyle = '#d7deeb'; g.font = '17px sans-serif';
    ['Volume réduit en marche arrière', 'Son de verrouillage', 'Bip des capteurs', 'Ambiance : Élégante'].forEach((t, i) => g.fillText(t, 266, 103 + i * 66));
    // Vue de dessus de la voiture, sièges chauffants allumés.
    g.fillStyle = '#2a3552'; g.beginPath(); g.roundRect(600, 90, 110, 230, 40); g.fill();
    g.fillStyle = '#ff8a3c'; for (const [x, y] of [[625, 150], [665, 150], [625, 230], [665, 230]]) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#121a2e'; g.fillRect(0, 400, 768, 48);
    g.fillStyle = '#9fb0cf'; g.font = '18px sans-serif'; g.fillText('A/C', 200, 430); g.fillText('‹ 18.5 ›', 330, 430); g.fillText('AUTO', 470, 430);
  });
  const screen = new THREE.Group();
  screen.add(new THREE.Mesh(box(0.37, 0.225, 0.02, 0, 0, 0), piano));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.355, 0.207), new THREE.MeshBasicMaterial({ map: screenTex }));
  glass.position.z = -0.011;
  glass.rotation.y = Math.PI;
  screen.add(glass);
  screen.add(new THREE.Mesh(box(0.06, 0.08, 0.04, 0, -0.14, 0.03), soft));
  screen.position.set(0.02, 1.24, 0.64);
  screen.rotation.set(-0.12, 0.12, 0);
  cabin.add(screen);

  // Combiné numérique fin et large, posé derrière le volant.
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const clusterTex = new THREE.CanvasTexture(canvas);
  clusterTex.colorSpace = THREE.SRGBColorSpace;
  add(box(0.33, 0.115, 0.03, 0.38, 1.19, 0.68), piano);
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.1), new THREE.MeshBasicMaterial({ map: clusterTex, side: THREE.DoubleSide }));
  cluster.position.set(0.38, 1.19, 0.664);
  cluster.rotation.set(-0.08, Math.PI, 0);
  cabin.add(cluster);

  // Volant : jante cousue, moyeu horizontal, deux pastilles à cerclage chrome, logo « (○) », branche basse en V argentée.
  const mount = new THREE.Group();
  mount.position.set(0.38, 1.02, 0.42);
  mount.rotation.x = 0.4;
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 14, 56), leather));
  const hub = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 16).rotateZ(Math.PI / 2).scale(1, 1, 0.45), leather);
  hub.position.set(0, 0.005, -0.012);
  wheel.add(hub);
  for (const x of [0.115, -0.115]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24).rotateY(Math.PI), new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.5 }));
    pad.position.set(x, 0.005, -0.036);
    wheel.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0035, 6, 28), chrome);
    ring.position.set(x, 0.005, -0.036);
    wheel.add(ring);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.018), leather);
    arm.position.set(x * 1.35, 0.005, -0.008);
    wheel.add(arm);
  }
  // Logo : deux parenthèses et l'ovale central.
  for (const sx of [1, -1]) {
    const bracket = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0028, 4, 16, Math.PI * 0.7).rotateZ(sx > 0 ? -Math.PI * 0.35 : Math.PI * 0.65), chrome);
    bracket.position.set(0, 0.005, -0.038);
    wheel.add(bracket);
  }
  const core = new THREE.Mesh(box(0.012, 0.018, 0.004, 0, 0.005, -0.038), chrome);
  wheel.add(core);
  for (const sx of [1, -1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.15, 0.012), chrome);
    v.position.set(sx * 0.035, -0.105, -0.01);
    v.rotation.z = sx * 0.32;
    wheel.add(v);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.016), leather);
    lower.position.set(sx * 0.035, -0.105, -0.004);
    lower.rotation.z = sx * 0.32;
    wheel.add(lower);
  }
  mount.add(wheel);
  mount.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 14).rotateX(Math.PI / 2).translate(0, 0, 0.17), soft));
  for (const side of [1, -1]) mount.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.15, 8).rotateZ(Math.PI / 2).translate(side * 0.1, 0.02, 0.04), soft));
  cabin.add(mount);
  return { cabin, wheel, canvas, clusterTex, screenTex };
}
