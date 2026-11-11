import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from './kit';
import type { VehicleKind } from './sim';
import { buildQ05 } from './changan';
import type { Fleet } from './fleet';

let fleet: Fleet | null = null;
/** Modèles chargés du Car Kit de Kenney ; sans eux, ces véhicules gardent la silhouette générique. */
export function setFleet(f: Fleet | null) { fleet = f; }

function bodyGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-2.18, 0.42);
  s.lineTo(-1.82, 0.34);
  s.absarc(-1.38, 0.38, 0.44, Math.PI, 0, true);
  s.lineTo(0.94, 0.34);
  s.absarc(1.38, 0.38, 0.44, Math.PI, 0, true);
  s.lineTo(2.2, 0.34);
  s.quadraticCurveTo(2.32, 0.62, 2.26, 0.82);
  s.quadraticCurveTo(2.2, 0.98, 1.25, 1.1);
  s.lineTo(-1.9, 1.14);
  s.quadraticCurveTo(-2.2, 1.12, -2.24, 0.85);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1.72, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 12 }).rotateY(-Math.PI / 2).translate(0.86, 0, 0);
}
function glassGeometry() {
  const s = new THREE.Shape();
  s.moveTo(1.3, 1.08);
  s.quadraticCurveTo(0.75, 1.32, 0.35, 1.6);
  s.lineTo(-1.42, 1.63);
  s.quadraticCurveTo(-1.95, 1.6, -2.14, 1.12);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(0.75, 0, 0);
}
function wheelGeometries() {
  const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20).rotateZ(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.22, 0.22, 0.28, 16).rotateZ(Math.PI / 2)];
  for (let i = 0; i < 5; i++) parts.push(new THREE.BoxGeometry(0.29, 0.38, 0.06).rotateX((i / 5) * Math.PI));
  return { tyre, rim: mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)) };
}

/** Pièces animées d'un véhicule ; « eye » est la hauteur des yeux du conducteur, « seat » la place d'un pilote de moto. */
export type CarParts = { group: THREE.Group; wheels: THREE.Group[]; pivots: THREE.Group[]; shell: THREE.Object3D[]; head: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial; left: THREE.MeshStandardMaterial; right: THREE.MeshStandardMaterial; eye: number; seat: THREE.Vector3 | null; rotors?: { main: THREE.Object3D; tail: THREE.Object3D } };

function lamp(color: number) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.3 }); }

/** Silhouette générique, construite en code : ce n'est pas la forme d'un modèle réel. Un GLB officiel la remplacera. */
function buildCar(paint: THREE.Material, shared: ReturnType<typeof sharedCar>): CarParts {
  const group = new THREE.Group();
  const body = new THREE.Mesh(shared.body, paint);
  const glass = new THREE.Mesh(shared.glass, shared.glassMat);
  const roof = new THREE.Mesh(shared.roof, paint);
  const trim = new THREE.Mesh(shared.trim, shared.dark);
  body.castShadow = glass.castShadow = roof.castShadow = true;
  group.add(body, glass, roof, trim);
  const head = lamp(0xf4f7ff), tail = lamp(0xc01018), left = lamp(0xff9a1f), right = lamp(0xff9a1f);
  const addLamp = (geo: THREE.BufferGeometry, mat: THREE.Material) => group.add(new THREE.Mesh(geo, mat));
  addLamp(box(0.5, 0.11, 0.05, 0.6, 0.85, 2.3), head);
  addLamp(box(0.5, 0.11, 0.05, -0.6, 0.85, 2.3), head);
  addLamp(box(0.46, 0.1, 0.05, 0.6, 0.92, -2.3), tail);
  addLamp(box(0.46, 0.1, 0.05, -0.6, 0.92, -2.3), tail);
  addLamp(box(0.16, 0.08, 0.05, 0.86, 0.73, 2.27), left);
  addLamp(box(0.16, 0.08, 0.05, 0.84, 0.8, -2.28), left);
  addLamp(box(0.16, 0.08, 0.05, -0.86, 0.73, 2.27), right);
  addLamp(box(0.16, 0.08, 0.05, -0.84, 0.8, -2.28), right);
  const wheels: THREE.Group[] = [], pivots: THREE.Group[] = [];
  for (const [x, z] of [[0.82, 1.38], [-0.82, 1.38], [0.82, -1.38], [-0.82, -1.38]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(shared.tyre, shared.rubber);
    tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(shared.rim, shared.metal));
    pivot.add(spin);
    group.add(pivot);
    wheels.push(spin);
    pivots.push(pivot);
  }
  return { group, wheels, pivots, shell: [body, glass, roof, trim], head, tail, left, right, eye: 1.33, seat: null };
}

export function sharedCar() {
  const { tyre, rim } = wheelGeometries();
  return {
    body: bodyGeometry(), glass: glassGeometry(), tyre, rim,
    roof: box(1.52, 0.05, 1.86, 0, 1.66, -0.52),
    trim: mergeGeometries([box(1.5, 0.3, 0.06, 0, 0.62, 2.3), box(1.8, 0.14, 0.1, 0, 0.42, 2.26), box(1.8, 0.16, 0.1, 0, 0.44, -2.26)].map((g) => g.toNonIndexed())),
    glassMat: new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.08, metalness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, roughness: 0.3, metalness: 0.9 }),
  };
}

/** Roue montée sur un pivot de direction, à l'échelle voulue. */
function mountWheel(group: THREE.Group, shared: ReturnType<typeof sharedCar>, x: number, z: number, scale: number, width = 1) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.36 * scale, z);
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(shared.tyre, shared.rubber);
  tyre.castShadow = true;
  spin.add(tyre, new THREE.Mesh(shared.rim, shared.metal));
  spin.scale.set(width, scale, scale);
  pivot.add(spin);
  group.add(pivot);
  return { pivot, spin };
}

/** Véhicules génériques du jeu, construits en code : aucune marque ni aucun modèle réel n'est reproduit. */
export function buildVehicle(kind: VehicleKind, paint: THREE.Material, shared: ReturnType<typeof sharedCar>): CarParts {
  if (kind === 'berline') return buildQ05(paint);
  if (kind === 'helico') return buildHelico(paint, shared);
  const model = fleet?.make(kind);
  if (model) return model;
  if (kind === 'suv' || kind === 'luxe' || kind === 'fourgon') {
    // Berline rehaussée et élargie, barres de toit.
    const parts = buildCar(paint, shared);
    parts.group.scale.set(1.07, 1.17, 1.06);
    for (const x of [0.62, -0.62]) parts.group.add(new THREE.Mesh(box(0.05, 0.06, 1.5, x, 1.72, -0.5), shared.dark));
    return { ...parts, eye: 1.55 };
  }
  if (kind === 'sportive' || kind === 'coupe' || kind === 'taxi') return buildCar(paint, shared);
  const group = new THREE.Group();
  const shell: THREE.Object3D[] = [];
  const part = (g: THREE.BufferGeometry, m: THREE.Material, inShell = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; group.add(mesh); if (inShell) shell.push(mesh); return mesh; };
  const head = lamp(0xf4f7ff), tail = lamp(0xc01018), left = lamp(0xff9a1f), right = lamp(0xff9a1f);
  const wheels: THREE.Group[] = [], pivots: THREE.Group[] = [];
  const axle = (z: number, x: number, scale: number, front: boolean, width = 1) => {
    for (const side of x ? [x, -x] : [0]) {
      const w = mountWheel(group, shared, side, z, scale, width);
      wheels.push(w.spin);
      if (front) pivots.push(w.pivot);
    }
  };
  if (kind === 'pickup') {
    part(box(1.9, 0.6, 5.2, 0, 0.82, 0), paint);
    part(box(1.86, 0.78, 2.3, 0, 1.5, 0.55), paint);
    part(box(1.9, 0.5, 2.0, 0, 1.55, 0.62), shared.glassMat);
    part(box(1.8, 0.1, 2.2, 0, 1.93, 0.55), paint);
    for (const x of [0.9, -0.9]) part(box(0.08, 0.42, 2.4, x, 1.32, -1.35), paint);
    part(box(1.88, 0.42, 0.08, 0, 1.32, -2.56), paint);
    part(box(1.78, 0.06, 2.4, 0, 1.12, -1.35), shared.dark);
    part(box(1.94, 0.18, 0.1, 0, 0.52, 2.62), shared.dark);
    part(box(1.94, 0.18, 0.1, 0, 0.52, -2.62), shared.dark);
    for (const x of [0.62, -0.62]) { part(box(0.42, 0.14, 0.05, x, 1.0, 2.61), head, false); part(box(0.2, 0.3, 0.05, x * 1.35, 1.2, -2.61), tail, false); }
    part(box(0.12, 0.08, 0.05, 0.88, 0.86, 2.61), left, false); part(box(0.12, 0.08, 0.05, -0.88, 0.86, 2.61), right, false);
    axle(1.65, 0.86, 1.15, true); axle(-1.6, 0.86, 1.15, false);
    return { group, wheels, pivots, shell, head, tail, left, right, eye: 1.6, seat: null };
  }
  if (kind === 'minibus') {
    part(box(2.0, 1.95, 5.4, 0, 1.38, 0), paint);
    part(box(2.03, 0.62, 4.6, 0, 1.92, -0.3), shared.glassMat);
    part(box(1.9, 0.8, 0.08, 0, 1.82, 2.68), shared.glassMat);
    part(box(1.4, 0.12, 3.6, 0, 2.42, -0.4), shared.dark);
    part(box(2.04, 0.22, 5.44, 0, 0.5, 0), shared.dark);
    part(box(2.04, 0.14, 5.44, 0, 1.38, 0), new THREE.MeshStandardMaterial({ color: 0xf2c318, roughness: 0.6 }));
    for (const x of [0.7, -0.7]) { part(box(0.36, 0.16, 0.05, x, 0.95, 2.71), head, false); part(box(0.18, 0.36, 0.05, x * 1.3, 1.0, -2.71), tail, false); }
    part(box(0.12, 0.08, 0.05, 0.92, 0.78, 2.71), left, false); part(box(0.12, 0.08, 0.05, -0.92, 0.78, 2.71), right, false);
    axle(1.85, 0.86, 1.05, true); axle(-1.75, 0.86, 1.05, false);
    return { group, wheels, pivots, shell, head, tail, left, right, eye: 2.0, seat: null };
  }
  const frame = shared.dark;
  const black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7 });
  const chrome = shared.metal;
  const ball = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) => {
    const mesh = part(new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz).rotateX(rx).translate(x, y, z), m);
    return mesh;
  };
  const tube = (r: number, len: number, x: number, y: number, z: number, rx: number, m: THREE.Material, rz = 0) =>
    part(new THREE.CylinderGeometry(r, r, len, 8).rotateX(rx).rotateZ(rz).translate(x, y, z), m);
  /** Profil latéral (z, y) extrudé sur la largeur, arêtes adoucies : carénages et coques. */
  const profile = (pts: [number, number][], width: number, m: THREE.Material) => {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 6 });
    return part(g.rotateY(-Math.PI / 2).translate((width - 0.06) / 2, 0, 0), m);
  };
  const signals = (zf: number, yf: number, zr: number, yr: number, w: number) => {
    part(box(0.06, 0.05, 0.05, w, yf, zf), left, false); part(box(0.06, 0.05, 0.05, -w, yf, zf), right, false);
    part(box(0.06, 0.05, 0.05, w * 0.8, yr, zr), left, false); part(box(0.06, 0.05, 0.05, -w * 0.8, yr, zr), right, false);
  };
  if (kind === 'scooter') {
    // Scooter : tablier avant galbé, plancher plat, coque arrière sous la selle, petites roues.
    // Tablier et plancher, puis coque arrière sous la selle.
    profile([[0.36, 0.3], [0.5, 0.62], [0.5, 1.0], [0.4, 1.04], [0.3, 0.5], [0.22, 0.42], [-0.12, 0.42], [-0.12, 0.3]], 0.44, paint);
    profile([[-0.08, 0.4], [-0.22, 0.78], [-0.86, 0.8], [-0.96, 0.66], [-0.82, 0.4], [-0.3, 0.32]], 0.34, paint);
    part(box(0.3, 0.1, 0.62, 0, 0.86, -0.42), black);
    part(box(0.36, 0.04, 0.4, 0, 0.45, 0.06), black);
    ball(0.12, 1.4, 0.8, 1, 0, 1.06, 0.55, paint);
    part(box(0.62, 0.035, 0.035, 0, 1.08, 0.5), frame);
    for (const x of [0.31, -0.31]) part(box(0.05, 0.05, 0.09, x, 1.08, 0.5), black);
    tube(0.028, 0.66, 0, 0.62, 0.66, -0.35, frame);
    ball(0.25, 0.5, 0.25, 1.1, 0, 0.42, 0.66, paint);
    ball(0.25, 0.5, 0.3, 1.2, 0, 0.42, -0.66, paint);
    part(box(0.14, 0.08, 0.04, 0, 1.06, 0.68), head, false);
    part(box(0.16, 0.05, 0.04, 0, 0.72, -0.86), tail, false);
    tube(0.035, 0.42, 0.12, 0.3, -0.62, Math.PI / 2, chrome);
    signals(0.66, 1.02, -0.85, 0.72, 0.13);
    axle(0.65, 0, 0.68, true, 0.5); axle(-0.62, 0, 0.68, false, 0.55);
    return { group, wheels, pivots, shell, head, tail, left, right, eye: 1.55, seat: new THREE.Vector3(0, 0.56, -0.3) };
  }
  if (kind === 'motosport') {
    // Moto sportive : carénage intégral, bulle, réservoir, coque arrière relevée, échappement sous la selle.
    // Carénage avant, réservoir et coque arrière effilée : un seul profil de moto de course.
    profile([[0.96, 0.84], [0.82, 1.0], [0.58, 1.1], [0.3, 1.04], [0.02, 1.0], [-0.22, 0.9], [-0.5, 0.96], [-0.98, 1.1], [-0.96, 1.0], [-0.5, 0.84], [-0.3, 0.7], [0.1, 0.56], [0.55, 0.5], [0.82, 0.62]], 0.36, paint);
    // Sabot noir sous le moteur, bulle fumée, selle.
    profile([[0.5, 0.52], [0.1, 0.56], [-0.25, 0.66], [-0.3, 0.4], [0.35, 0.32]], 0.3, frame);
    part(new THREE.PlaneGeometry(0.3, 0.26).rotateX(-1.05).translate(0, 1.14, 0.66), shared.glassMat);
    part(box(0.26, 0.05, 0.3, 0, 0.93, -0.32), black);
    tube(0.06, 0.5, 0.11, 0.62, -0.62, Math.PI / 2 - 0.3, chrome);
    for (const x of [0.2, -0.2]) part(box(0.2, 0.03, 0.03, x * 1.05, 0.98, 0.4), frame);
    tube(0.03, 0.7, 0, 0.66, 0.66, -0.42, chrome);
    tube(0.03, 0.62, 0, 0.5, -0.36, 1.25, frame);
    for (const x of [0.07, -0.07]) part(box(0.08, 0.05, 0.04, x, 0.88, 0.86), head, false);
    part(box(0.14, 0.05, 0.04, 0, 0.98, -0.94), tail, false);
    signals(0.78, 0.86, -0.92, 0.94, 0.16);
    axle(0.74, 0, 0.92, true, 0.55); axle(-0.68, 0, 0.94, false, 0.72);
    return { group, wheels, pivots, shell, head, tail, left, right, eye: 1.5, seat: new THREE.Vector3(0, 0.7, -0.24) };
  }
  // Moto : cadre, réservoir, selle, moteur, échappement, garde-boues, guidon et phare ; le pilote est posé dessus par le rendu.
  ball(0.2, 0.75, 0.62, 1.45, 0, 0.88, 0.16, paint);
  part(box(0.28, 0.1, 0.72, 0, 0.9, -0.32), black);
  part(box(0.26, 0.32, 0.42, 0, 0.5, -0.02), chrome);
  for (let i = 0; i < 4; i++) part(box(0.3, 0.02, 0.36, 0, 0.42 + i * 0.07, -0.02), frame);
  tube(0.04, 0.95, 0.14, 0.4, -0.4, Math.PI / 2 - 0.08, chrome);
  part(box(0.22, 0.08, 0.5, 0, 0.72, -0.62), paint);
  ball(0.24, 0.45, 0.22, 1, 0, 0.46, 0.73, paint);
  tube(0.03, 0.72, 0.07, 0.66, 0.6, -0.42, frame); tube(0.03, 0.72, -0.07, 0.66, 0.6, -0.42, frame);
  part(box(0.72, 0.04, 0.04, 0, 1.04, 0.46), frame);
  for (const x of [0.3, -0.3]) { tube(0.012, 0.22, x, 1.14, 0.44, 0, frame); ball(0.045, 1, 0.7, 0.3, x, 1.26, 0.44, frame); }
  ball(0.11, 1, 1, 0.8, 0, 0.98, 0.7, paint);
  part(box(0.12, 0.1, 0.04, 0, 0.98, 0.79), head, false);
  part(box(0.12, 0.06, 0.04, 0, 0.74, -0.88), tail, false);
  signals(0.72, 0.92, -0.86, 0.74, 0.16);
  axle(0.72, 0, 0.88, true, 0.5); axle(-0.64, 0, 0.88, false, 0.55);
  return { group, wheels, pivots, shell, head, tail, left, right, eye: 1.62, seat: new THREE.Vector3(0, 0.62, -0.28) };
}

/** Hélicoptère léger, imaginé pour le jeu : cabine vitrée, poutre de queue, dérive, patins, rotor principal à quatre pales et rotor de queue. */
function buildHelico(paint: THREE.Material, shared: ReturnType<typeof sharedCar>): CarParts {
  const group = new THREE.Group();
  const shell: THREE.Object3D[] = [];
  const part = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group, inShell = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; parent.add(mesh); if (inShell) shell.push(mesh); return mesh; };
  const extrude = (pts: [number, number][], width: number, bevel: number) => {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    return new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(width / 2 - bevel, 0, 0);
  };
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.45, metalness: 0.2 });
  const dark = shared.dark, metal = shared.metal;
  // Cabine : profil de côté, adouci, peinte de la couleur du véhicule, bandeau blanc.
  part(extrude([[2.05, 0.75], [2.3, 1.15], [1.6, 2.1], [0.4, 2.35], [-0.9, 2.3], [-1.7, 1.95], [-2.0, 1.5], [-1.5, 0.75], [0.2, 0.62]], 1.7, 0.18), paint);
  part(extrude([[2.0, 1.15], [2.36, 1.3], [1.62, 2.16], [0.6, 2.33], [0.5, 1.35]], 1.76, 0.12), shared.glassMat);
  part(box(1.74, 0.16, 2.6, 0, 1.08, 0.1), white);
  // Moteur et mât sur le toit.
  part(extrude([[0.6, 2.3], [0.2, 2.62], [-1.0, 2.6], [-1.5, 2.2]], 0.9, 0.12), paint);
  part(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 10).translate(0, 2.8, -0.1), metal);
  // Poutre de queue, dérive et stabilisateur.
  part(new THREE.CylinderGeometry(0.13, 0.3, 4.4, 12).rotateX(Math.PI / 2).translate(0, 1.85, -3.9), paint);
  part(extrude([[-5.6, 1.85], [-6.35, 3.0], [-6.75, 3.0], [-6.4, 1.6]], 0.1, 0.03), paint);
  part(box(1.6, 0.06, 0.42, 0, 1.9, -5.3), paint);
  // Patins sur leurs jambes de train.
  for (const x of [0.88, -0.88]) {
    part(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8).rotateX(Math.PI / 2).translate(x, 0.07, 0.2), metal);
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8).rotateX(Math.PI / 2 - 0.6).translate(x, 0.12, 1.95), metal);
    for (const z of [1.0, -0.7]) part(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6).rotateZ(x > 0 ? 0.35 : -0.35).translate(x * 0.86, 0.4, z), metal);
  }
  // Rotor principal : moyeu et quatre pales ; il tourne autour de l'axe vertical.
  const main = new THREE.Group();
  main.position.set(0, 3.02, -0.1);
  part(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), dark, main);
  for (let i = 0; i < 4; i++) part(box(0.3, 0.035, 4.6, 0, 0.02, 2.4).rotateY((i * Math.PI) / 2), dark, main);
  group.add(main);
  // Rotor de queue, sur le côté de la dérive.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.12, 2.6, -6.45);
  for (let i = 0; i < 2; i++) part(new THREE.BoxGeometry(0.03, 1.2, 0.14).rotateX((i * Math.PI) / 2), dark, tailRotor);
  group.add(tailRotor);
  // Feux : phare sous le nez, feu arrière rouge, feux de position latéraux.
  const lamp = (color: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.3 });
  const head = lamp(0xf4f7ff), tail = lamp(0xc01018), left = lamp(0xff3030), right = lamp(0x30ff60);
  part(new THREE.SphereGeometry(0.09, 10, 8).translate(0, 0.78, 2.12), head, group, false);
  part(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 3.0, -6.7), tail, group, false);
  part(new THREE.SphereGeometry(0.06, 8, 6).translate(0.82, 1.9, -5.3), left, group, false);
  part(new THREE.SphereGeometry(0.06, 8, 6).translate(-0.82, 1.9, -5.3), right, group, false);
  return { group, wheels: [], pivots: [], shell, head, tail, left, right, eye: 1.85, seat: null, rotors: { main, tail: tailRotor } };
}
