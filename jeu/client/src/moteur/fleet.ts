import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { box } from './kit';
import type { VehicleKind } from './sim';
import type { CarParts } from './vehicles';

/**
 * Voitures du Car Kit de Kenney (CC0, www.kenney.nl) : modèles stylisés et sans marque.
 * Chaque modèle est mis à la taille d'une vraie voiture : longueur et largeur visées, roues gardées rondes.
 */
const MODELS: Partial<Record<VehicleKind, { file: string; length: number; width: number; eye: number }>> = {
  sportive: { file: 'sedan-sports', length: 4.45, width: 1.9, eye: 1.05 },
  coupe: { file: 'hatchback-sports', length: 4.3, width: 1.82, eye: 1.15 },
  luxe: { file: 'suv-luxury', length: 4.9, width: 1.98, eye: 1.6 },
  taxi: { file: 'taxi', length: 4.5, width: 1.82, eye: 1.3 },
  fourgon: { file: 'van', length: 5.0, width: 2.0, eye: 1.75 },
};
export const FLEET_KINDS = Object.keys(MODELS) as VehicleKind[];

function lamp(color: number) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.3 }); }

export async function loadFleet(base = '/game/voitures/') {
  const loader = new GLTFLoader();
  const entries = await Promise.all(FLEET_KINDS.map(async (kind) => [kind, await loader.loadAsync(`${base}${MODELS[kind]!.file}.glb`)] as const));
  const scenes = new Map(entries.map(([k, g]) => [k, g.scene]));
  // La palette du kit, nette et sans filtrage flou entre ses cases de couleur.
  for (const s of scenes.values()) s.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map) { m.map.minFilter = THREE.NearestFilter; m.map.magFilter = THREE.NearestFilter; m.roughness = 0.45; m.metalness = 0.15; }
  });

  function make(kind: VehicleKind): CarParts | null {
    const spec = MODELS[kind], source = scenes.get(kind);
    if (!spec || !source) return null;
    const group = new THREE.Group();
    const model = source.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const s = spec.length / size.z;
    model.scale.set(spec.width / size.x, s, s);
    group.add(model);
    const wheels: THREE.Group[] = [], pivots: THREE.Group[] = [];
    const shell: THREE.Object3D[] = [];
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      o.castShadow = true;
    });
    for (const o of [...model.children]) {
      if (!o.name.startsWith('wheel')) { shell.push(o); continue; }
      // La roue tourne sur son axe dans un pivot qui braque : le pivot prend la place de la roue.
      const pivot = new THREE.Group();
      pivot.position.copy(o.position);
      model.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      o.position.set(0, 0, 0);
      spin.add(o);
      wheels.push(spin);
      if (o.name.includes('front')) pivots.push(pivot);
    }
    const height = size.y * s, half = spec.length / 2, w = spec.width / 2;
    const head = lamp(0xf4f7ff), tail = lamp(0xc01018), left = lamp(0xff9a1f), right = lamp(0xff9a1f);
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => group.add(new THREE.Mesh(g, m));
    const y = height * 0.42;
    for (const side of [1, -1]) {
      add(box(0.34, 0.1, 0.04, side * w * 0.62, y, half + 0.01), head);
      add(box(0.3, 0.1, 0.04, side * w * 0.66, y + 0.06, -half - 0.01), tail);
      add(box(0.1, 0.07, 0.04, side * w * 0.88, y - 0.12, half + 0.01), side > 0 ? left : right);
      add(box(0.1, 0.07, 0.04, side * w * 0.9, y - 0.08, -half - 0.01), side > 0 ? left : right);
    }
    return { group, wheels, pivots, shell, head, tail, left, right, eye: spec.eye, seat: null };
  }
  return { make };
}
export type Fleet = Awaited<ReturnType<typeof loadFleet>>;
