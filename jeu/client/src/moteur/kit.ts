import * as THREE from 'three';
import type { Pt } from './sim';

export function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
export function flat(w: number, d: number, x: number, y: number, z: number) {
  return new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
}

export function windowsTexture(lit: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000' : '#fff';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (lit) {
      if (Math.abs(Math.sin(x * 12.9 + y * 78.2) * 43758.5 % 1) > 0.42) continue;
      g.fillStyle = (x + y) % 3 ? '#ffd9a0' : '#ffeccb';
    } else g.fillStyle = (x * 3 + y) % 5 === 0 ? '#39424c' : '#27303a';
    g.fillRect(x * 32 + 7, y * 32 + 7, 18, 19);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,225,170,.75)');
  r.addColorStop(1, 'rgba(255,225,170,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Enveloppe de la nuit commune aux deux villes : chaque décor règle ses propres lumières. */
export type Decor = { night: (on: boolean) => void; dispose: () => void; near?: (x: number, z: number) => void };

export function ribbon(pts: Pt[], width: number, y: number, positions: number[]) {
  const half = width / 2;
  const normals = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)]!, b = pts[Math.min(i + 1, pts.length - 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as Pt;
  });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, na = normals[i - 1]!, nb = normals[i]!;
    const al = [a[0] + na[0] * half, a[1] + na[1] * half], ar = [a[0] - na[0] * half, a[1] - na[1] * half];
    const bl = [b[0] + nb[0] * half, b[1] + nb[1] * half], br = [b[0] - nb[0] * half, b[1] - nb[1] * half];
    positions.push(al[0]!, y, al[1]!, br[0]!, y, br[1]!, ar[0]!, y, ar[1]!, al[0]!, y, al[1]!, bl[0]!, y, bl[1]!, br[0]!, y, br[1]!);
  }
  // Disques aux extrémités : les rues se raccordent sans trou aux croisements.
  for (const c of [pts[0]!, pts[pts.length - 1]!]) {
    for (let k = 0; k < 12; k++) {
      const u = (k / 12) * Math.PI * 2, v = ((k + 1) / 12) * Math.PI * 2;
      positions.push(c[0], y, c[1], c[0] + Math.sin(v) * half, y, c[1] + Math.cos(v) * half, c[0] + Math.sin(u) * half, y, c[1] + Math.cos(u) * half);
    }
  }
}

export function flatGeometry(positions: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const n = new Float32Array(positions.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

export function polygonFlat(polys: Pt[][], y: number) {
  const positions: number[] = [];
  for (const poly of polys) {
    const ring = poly.map((p) => new THREE.Vector2(p[0], p[1]));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(ring, [])) {
      const pa = ring[a!]!, pb = ring[b!]!, pc = ring[c!]!;
      const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y) > 0;
      const [q, r] = up ? [pb, pc] : [pc, pb];
      positions.push(pa.x, y, pa.y, q.x, y, q.y, r.x, y, r.y);
    }
  }
  return flatGeometry(positions);
}

