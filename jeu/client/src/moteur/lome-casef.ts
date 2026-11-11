import * as THREE from 'three';
import { box, polygonFlat, ribbon, flatGeometry } from './kit';
import type { LomeData } from './lome';
import { canvasTexture, centre, grow, slabWithHole, walls } from './lome-places';
import type { Pt } from './sim';

/**
 * Centre administratif des services économiques et financiers (CASEF), d'après des captures de référence.
 * Emprises relevées sur vue aérienne, rotonde et rues issues de la carte. Hauteurs déduites du nombre d'étages visibles.
 */
const STOREY = 3.6;

export function buildCasef(scene: THREE.Scene, data: LomeData, low: boolean) {
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T) => { textures.push(t); return t; };
  const glowing: THREE.MeshStandardMaterial[] = [];
  const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.3, ...extra });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && !low;
    mesh.receiveShadow = !low;
    scene.add(mesh);
    return mesh;
  };

  const band = std(0x8e7c6d, 0.85), underside = std(0x6f6155, 0.9), roofTop = std(0x667a6c, 0.95);
  // Travée d'étage : baies dorées et trumeaux clairs, sous le bandeau taupe.
  const floorDay = keep(canvasTexture(128, 128, (g) => {
    g.fillStyle = '#ece6da';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e5b16e';
    g.fillRect(4, 18, 120, 98);
    g.fillStyle = '#9c8468';
    for (const x of [4, 44, 84, 122]) g.fillRect(x, 18, 3, 98);
    g.fillRect(4, 56, 120, 2);
  }, true));
  const floorLit = keep(canvasTexture(128, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffd9a0';
    g.fillRect(4, 18, 120, 98);
  }, true));
  const glass = new THREE.MeshStandardMaterial({ map: floorDay, emissive: 0xffffff, emissiveMap: floorLit, emissiveIntensity: 0, roughness: 0.55, envMapIntensity: 0.3 });
  glowing.push(glass);
  // Rez-de-chaussée : arcades sombres sous dalle.
  const arcade = keep(canvasTexture(128, 128, (g) => {
    g.fillStyle = '#a68f76';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#2b2622';
    g.beginPath();
    g.moveTo(16, 128); g.lineTo(16, 56); g.quadraticCurveTo(64, -8, 112, 56); g.lineTo(112, 128);
    g.closePath();
    g.fill();
  }, true));
  const arcadeMat = new THREE.MeshStandardMaterial({ map: arcade, roughness: 0.85, envMapIntensity: 0.3 });

  /** Étages en léger encorbellement : chaque niveau déborde un peu sur celui du dessous, comme sur les photos. */
  const tiered = (footprint: Pt[], floors: number) => {
    const baseH = 4.4;
    const inset = -2.8;
    add(walls(grow(footprint, inset - 1), 0, baseH, 5.5), arcadeMat);
    add(slabWithHole(grow(footprint, inset + 1), null, baseH), underside);
    for (let i = 0; i < floors; i++) {
      const y0 = baseH + i * STOREY;
      const widen = inset + (i * 1.3) / floors;
      const inner = grow(footprint, widen);
      const outer = grow(footprint, widen + 1.3);
      add(walls(inner, y0, y0 + STOREY, 3.6), glass);
      add(walls(outer, y0 - 0.2, y0 + 0.75, 40), band);
      add(slabWithHole(outer, inner, y0 + 0.75), band);
      add(slabWithHole(outer, inner, y0 - 0.2), underside);
    }
    const yTop = baseH + floors * STOREY;
    const lastOuter = grow(footprint, inset + 1.3 + 1.3);
    // Toit flottant : un dernier niveau en retrait, sous une large dalle débordante.
    add(walls(lastOuter, yTop - 0.2, yTop + 0.7, 40), band);
    add(slabWithHole(lastOuter, null, yTop + 0.7), std(0xb8ac97));
    add(walls(grow(footprint, inset - 1.5), yTop + 0.7, yTop + 3.6, 3.6), std(0x4b4037, 0.8));
    add(walls(grow(footprint, inset + 1.6), yTop + 3.6, yTop + 4.5, 40), band);
    add(slabWithHole(grow(footprint, inset + 1.6), null, yTop + 4.5), roofTop);
    return yTop + 4.5;
  };

  const main = data.buildings.find((b) => b.sig === 'casefMain');
  if (main) {
    const top = tiered(main.p, 9);
    const [cx, cz] = centre(main.p);
    add(new THREE.CylinderGeometry(0.06, 0.16, 8, 5).translate(cx - 6, top + 4, cz + 3), std(0xc9c9c6, 0.5, { metalness: 0.6 }));
    add(new THREE.CylinderGeometry(0.05, 0.1, 3, 5).translate(cx + 8, top + 1.5, cz - 6), std(0xc9c9c6, 0.5, { metalness: 0.6 }));
    add(box(9, 2.2, 7, cx, top + 1.1, cz), std(0xb9a98f, 0.8));
  }
  const wing = data.buildings.find((b) => b.sig === 'casefLow');
  if (wing) tiered(wing.p, 5);

  const round = data.buildings.find((b) => b.sig === 'casefRound');
  if (round) {
    // Rotonde : quatre niveaux débordants sur arcades, couronne en retrait.
    const [cx, cz] = centre(round.p);
    const r = Math.max(...round.p.map((q) => Math.hypot(q[0] - cx, q[1] - cz)));
    const circle = (radius: number): Pt[] => Array.from({ length: 56 }, (_, i) => [cx + Math.sin((i / 56) * Math.PI * 2) * radius, cz + Math.cos((i / 56) * Math.PI * 2) * radius] as Pt);
    const baseH = 4.4;
    add(walls(circle(r - 4), 0, baseH, 5.5), arcadeMat);
    add(slabWithHole(circle(r - 2.5), null, baseH), underside);
    for (let i = 0; i < 4; i++) {
      const y0 = baseH + i * STOREY;
      const inner = circle(r - 3 + i * 0.5), outer = circle(r - 1.5 + i * 0.5);
      add(walls(inner, y0, y0 + STOREY, 3.6), glass);
      add(walls(outer, y0 - 0.2, y0 + 0.8, 40), band);
      add(slabWithHole(outer, inner, y0 + 0.8), band);
      add(slabWithHole(outer, inner, y0 - 0.2), underside);
    }
    const yTop = baseH + 4 * STOREY;
    add(walls(circle(r + 0.8), yTop - 0.2, yTop + 1, 40), band);
    add(slabWithHole(circle(r + 0.8), null, yTop + 1), std(0x6d7f70, 0.95));
    add(new THREE.CylinderGeometry(r * 0.32, r * 0.42, 2, 24).translate(cx, yTop + 2, cz), std(0xa59681, 0.85));
  }

  // Pelouse de la parcelle, sous les voies.
  if (data.casefArea.length) add(polygonFlat([data.casefArea], 0.045), std(0x5a8f42, 1), false);

  /* Clôture repeinte, d'après la vidéo la plus récente : muret jaune, poteaux et barreaux bleu-gris, pointes dorées */
  const fenceBase = std(0xd9a530, 0.9), rail = std(0x7f93ad, 0.5, { metalness: 0.4 }), gold = std(0xd6a540, 0.4, { metalness: 0.6 });
  const bars: Pt[] = [];
  const posts: THREE.BufferGeometry[] = [];
  for (const [a, b] of data.casefFence) {
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    add(new THREE.BoxGeometry(0.4, 0.9, seg).rotateY(yaw).translate(mx, 0.5, mz), fenceBase);
    for (const y of [1.15, 2.2]) add(new THREE.BoxGeometry(0.07, 0.07, seg).rotateY(yaw).translate(mx, y, mz), rail);
    for (let m = 0; m < seg; m += 0.3) bars.push([a[0] + ((b[0] - a[0]) * m) / seg, a[1] + ((b[1] - a[1]) * m) / seg]);
    posts.push(new THREE.BoxGeometry(0.34, 2.1, 0.34).translate(a[0], 1.75, a[1]));
    add(new THREE.ConeGeometry(0.28, 0.42, 4).rotateY(Math.PI / 4).translate(a[0], 3.0, a[1]), gold, false);
  }
  for (const g of posts) add(g, rail, false);
  if (bars.length) {
    const pickets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 4).translate(0, 1.67, 0), rail, bars.length);
    const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.26, 4).translate(0, 2.52, 0), gold, bars.length);
    const o = new THREE.Object3D();
    bars.forEach((q, i) => { o.position.set(q[0], 0, q[1]); o.updateMatrix(); pickets.setMatrixAt(i, o.matrix); tips.setMatrixAt(i, o.matrix); });
    scene.add(pickets, tips);
  }

  /* Rond-point de la Vasque : anneau fleuri, margelle et vasque sur son pied */
  const vasque = data.places.find((p) => p.n === 'La Vasque Fontaine');
  if (vasque) {
    const { x, z } = vasque;
    const ring = (radius: number): Pt[] => Array.from({ length: 28 }, (_, i) => [x + Math.sin((i / 28) * Math.PI * 2) * radius, z + Math.cos((i / 28) * Math.PI * 2) * radius] as Pt);
    add(polygonFlat([ring(7.5)], 0.12), std(0xe2ded3, 0.9), false);
    add(polygonFlat([ring(6.4)], 0.17), std(0x4f8f3a, 1), false);
    const edge: number[] = [];
    ribbon([...ring(7.3), ring(7.3)[0]!], 0.5, 0.2, edge);
    add(flatGeometry(edge), std(0xb9352b, 0.85), false);
    const stone = std(0x8d7a64, 0.9);
    add(new THREE.CylinderGeometry(2.6, 2.9, 0.8, 20).translate(x, 0.5, z), stone);
    add(new THREE.CylinderGeometry(0.35, 0.55, 1.8, 12).translate(x, 1.8, z), stone);
    add(new THREE.CylinderGeometry(1.7, 0.5, 0.8, 20).translate(x, 3, z), stone);
  }

  return {
    night(on: boolean) { for (const m of glowing) m.emissiveIntensity = on ? 0.75 : 0; },
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
