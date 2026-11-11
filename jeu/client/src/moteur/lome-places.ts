import * as THREE from 'three';
import { box, flatGeometry, polygonFlat, ribbon } from './kit';
import type { LomeData } from './lome';
import { mulberry, type Pt } from './sim';
import { ENTRANCE_V, IAI_LOT, iaiFrame } from './iai-interior';

/**
 * Palais des congrès et immeuble du CENETI (IAI-Togo, INSEED), d'après des captures de référence recoupées avec le plan.
 * Aucune de ces images n'est intégrée : tout est redessiné. Les faces non photographiées sont déduites.
 */
export const centre = (p: Pt[]) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length] as Pt, [0, 0] as Pt);
const rad = (d: number) => (d * Math.PI) / 180;
const polar = (az: number, r: number): Pt => [-Math.sin(az) * r, Math.cos(az) * r];
/** Mètres vers l'est et le nord : x croît vers l'ouest dans le jeu. */
const en = (east: number, north: number): Pt => [-east, north];
const SCULPTURE: [number, number] = [-2, -23];
const SQUARE = { az: 70, half: 24, r1: 86, r2: 142 };

function area(loop: Pt[]) { return loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0); }

/** Murs extrudés d'un contour, y0 à y1 ; u en mètres divisés par uStep. Une cour se passe avec `inward`. */
export function walls(ring: Pt[], y0: number, y1: number, uStep: number, inward = false) {
  const loop = [...ring];
  if ((area(loop) > 0) !== inward) loop.reverse();
  const pos: number[] = [], uv: number[] = [];
  loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    const u = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / uStep));
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
    uv.push(0, 0, u, 0, u, 1, 0, 0, u, 1, 0, 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function slabWithHole(outer: Pt[], hole: Pt[] | null, y: number) {
  const shape = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const holes = hole ? [hole.map((p) => new THREE.Vector2(p[0], p[1]))] : [];
  const all = [...shape, ...holes.flat()];
  const pos: number[] = [], under: number[] = [];
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(shape, holes)) {
    const p = all[i!]!, q = all[j!]!, r = all[k!]!;
    const up = (q.y - p.y) * (r.x - p.x) - (q.x - p.x) * (r.y - p.y) > 0;
    const [m, n] = up ? [q, r] : [r, q];
    pos.push(p.x, y, p.y, m.x, y, m.y, n.x, y, n.y);
    under.push(p.x, y, p.y, n.x, y, n.y, m.x, y, m.y);
  }
  // Dalle visible des deux côtés : par-dessous, un balcon ne doit pas laisser voir le ciel.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, ...under], 3));
  const normals = new Float32Array(pos.length + under.length);
  for (let i = 1; i < pos.length; i += 3) normals[i] = 1;
  for (let i = pos.length + 1; i < normals.length; i += 3) normals[i] = -1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return g;
}

/** Arrondit les angles : c'est la signature des balcons filants du CENETI. */
function chaikin(ring: Pt[], passes = 3) {
  let out = ring;
  for (let n = 0; n < passes; n++) {
    const next: Pt[] = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length]!;
      next.push([a[0] * 0.9 + b[0] * 0.1, a[1] * 0.9 + b[1] * 0.1], [a[0] * 0.1 + b[0] * 0.9, a[1] * 0.1 + b[1] * 0.9]);
    });
    out = next;
  }
  return out;
}
export function grow(ring: Pt[], by: number) {
  const [cx, cz] = centre(ring);
  return ring.map((p) => { const d = Math.hypot(p[0] - cx, p[1] - cz) || 1; return [p[0] + ((p[0] - cx) / d) * by, p[1] + ((p[1] - cz) / d) * by] as Pt; });
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function iaiOrigin(data: LomeData): Pt {
  return data.iaiPoint;
}
/** Autour de l'immeuble : positions relevées depuis le point de l'IAI sur la carte. */
const fromIai = (data: LomeData, east: number, north: number): Pt => { const o = iaiOrigin(data); return [o[0] - east, o[1] + north]; };

const palaceFence = (): Pt[] => Array.from({ length: 21 }, (_, i) => polar(rad(SQUARE.az - SQUARE.half + (i / 20) * 2 * SQUARE.half), SQUARE.r1 - 2));

/** Collisions ajoutées : grille de l'esplanade et sculpture. */
export function placesSolids(data: LomeData): Pt[][] {
  const out: Pt[][] = [];
  const fence = palaceFence();
  fence.slice(1).forEach((b, i) => {
    const a = fence[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * 0.1, nz = ((b[0] - a[0]) / len) * 0.1;
    out.push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]);
  });
  const [x, z] = fromIai(data, ...SCULPTURE);
  out.push([[x - 1.5, z - 1.5], [x + 1.5, z - 1.5], [x + 1.5, z + 1.5], [x - 1.5, z + 1.5]]);
  // Poteaux et murets de l'abri du parking de l'IAI.
  const iaiB = data.buildings.find((b) => b.n === data.iai);
  if (iaiB) {
    const fr = iaiFrame(iaiB.p), L = IAI_LOT, span = L.u1 - L.carU0 - 2;
    const sq = (u: number, v: number, hu: number, hv: number): Pt[] => [[u - hu, v - hv], [u + hu, v - hv], [u + hu, v + hv], [u - hu, v + hv]].map(([a, b]) => fr.world(a!, b!));
    for (let k = 0; k <= 6; k++) { const u = L.carU0 + 1 + (k * span) / 6; out.push(sq(u, L.v0 + 2.4 + 2.4, 0.12, 0.12), sq(u, L.v0 + 2.4 - 1.3, 0.12, 1.1)); }
  }
  const fao = data.places.find((p) => p.n === 'Place FAO');
  if (fao) out.push([[fao.x - 2.5, fao.z - 2.5], [fao.x + 2.5, fao.z - 2.5], [fao.x + 2.5, fao.z + 2.5], [fao.x - 2.5, fao.z + 2.5]]);
  return out;
}

export function buildPlaces(scene: THREE.Scene, data: LomeData, low: boolean) {
  const textures: THREE.Texture[] = [];
  const keep = (t: THREE.Texture) => { textures.push(t); return t; };
  const glowing: { mat: THREE.MeshStandardMaterial; power: number }[] = [];
  const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.3, ...extra });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && !low;
    mesh.receiveShadow = !low;
    scene.add(mesh);
    return mesh;
  };

  /* ---- Palais des congrès ---- */
  const palace = data.buildings.find((b) => b.n === 'Parlement');
  if (palace) {
    // Une travée : pilotis vitrés, bandeau de béton, longue baie bleue, acrotère de béton.
    const bay = (lit: boolean) => (g: CanvasRenderingContext2D) => {
      g.fillStyle = lit ? '#000' : '#8f9191';
      g.fillRect(0, 0, 128, 256);
      if (lit) {
        g.fillStyle = '#ffd9a0';
        g.fillRect(4, 56, 120, 84);
        g.fillStyle = '#ffe6bd';
        g.fillRect(16, 188, 96, 60);
        return;
      }
      g.fillStyle = '#2f6fae';
      g.fillRect(0, 52, 128, 92);
      g.fillStyle = 'rgba(190,220,240,.35)';
      for (const x of [0, 32, 64, 96]) g.fillRect(x + 1, 52, 2, 92);
      g.fillRect(0, 96, 128, 2);
      g.fillStyle = '#1b2228';
      g.fillRect(0, 176, 128, 80);
      g.fillStyle = '#b9bbb8';
      g.fillRect(52, 176, 24, 80); // poteau
      g.fillStyle = '#a4a6a4';
      g.fillRect(0, 144, 128, 32);
    };
    const facadeDay = keep(canvasTexture(128, 256, bay(false), true)), facadeLit = keep(canvasTexture(128, 256, bay(true), true));
    const facade = new THREE.MeshStandardMaterial({ map: facadeDay, emissive: 0xffffff, emissiveMap: facadeLit, emissiveIntensity: 0, roughness: 0.35, metalness: 0.25, envMapIntensity: 0.45 });
    glowing.push({ mat: facade, power: 0.7 });
    const h = 14;
    add(walls(palace.p, 0, h, 6.5), facade);
    add(slabWithHole(palace.p, null, h), std(0x8d8f8b, 0.9));

    // Rotonde en retrait : tambour clair, bande vitrée sombre, toit plissé à pointes débordantes.
    const [dx, dz] = en(182, 56);
    const drum = new THREE.Group();
    drum.scale.set(1, 1, 0.8);
    drum.position.set(dx, 0, dz);
    drum.add(new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 3, 48, 1, true).translate(0, h + 1.5, 0), std(0x1a2026, 0.25)));
    drum.add(new THREE.Mesh(new THREE.CylinderGeometry(37, 36, 4, 48, 1, true).translate(0, h + 5, 0), std(0xc4c8c6, 0.6)));
    const teeth = 30, rim = 42, valley = 38, topR = 15;
    const pos: number[] = [];
    const yEdge = h + 7.5, yTop = h + 15;
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.5) / teeth) * Math.PI * 2, a2 = ((i + 1) / teeth) * Math.PI * 2;
      const t0: [number, number, number] = [Math.sin(a0) * topR, yTop, Math.cos(a0) * topR];
      const t2: [number, number, number] = [Math.sin(a2) * topR, yTop, Math.cos(a2) * topR];
      const v0: [number, number, number] = [Math.sin(a0) * valley, yEdge, Math.cos(a0) * valley];
      const v2: [number, number, number] = [Math.sin(a2) * valley, yEdge, Math.cos(a2) * valley];
      const tip: [number, number, number] = [Math.sin(a1) * rim, yEdge + 0.9, Math.cos(a1) * rim];
      pos.push(...t0, ...v0, ...tip, ...t0, ...tip, ...t2, ...t2, ...tip, ...v2);
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roof.computeVertexNormals();
    drum.add(new THREE.Mesh(roof, std(0x3f4b4a, 0.7, { flatShading: true, side: THREE.DoubleSide })));
    drum.add(new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.4, 32).translate(0, yTop + 0.2, 0), std(0x6c7472, 0.8)));
    drum.add(new THREE.Mesh(box(14, 2, 8, 0, yTop + 1.2, 0), std(0xbfc3c0, 0.7)));
    drum.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = !low; });
    scene.add(drum);

    // Voile en cône devant l'entrée, posé sur son anneau et ses jambes : la façade regarde le monument.
    const [cx, cz] = en(133, 28);
    const canopy = new THREE.Group();
    const concrete = std(0xc7c7bf, 0.7);
    const profile = [[0.05, 22.5], [0.9, 20], [2.1, 16], [3.2, 12.5], [3.6, 10.2]].map(([r, y]) => new THREE.Vector2(r, y));
    canopy.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 24).scale(1, 1, 0.75), std(0xd2d2ca, 0.55, { side: THREE.DoubleSide })));
    const sign = keep(canvasTexture(1024, 96, (g) => {
      g.fillStyle = '#cfcfc8';
      g.fillRect(0, 0, 1024, 96);
      g.fillStyle = '#26282b';
      g.font = '600 62px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PALAIS DES CONGRÈS', 512, 50);
    }));
    canopy.add(new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.2, 1.3, 32).scale(1, 1, 0.75).translate(0, 9.5, 0), concrete));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 }));
    label.position.set(0, 9.5, 4.7);
    canopy.add(label);
    for (const [a, b] of [[-3.6, 2], [3.6, 2], [-2.6, -2.4], [2.6, -2.4]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 9.2, 8).translate(0, 4.6, 0), concrete);
      leg.position.set(a, 0, b);
      leg.rotation.z = a < 0 ? -0.13 : 0.13;
      canopy.add(leg);
    }
    canopy.position.set(cx, 0.1, cz);
    canopy.rotation.y = Math.atan2(-cx, -cz);
    canopy.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = !low; });
    scene.add(canopy);

    // Esplanade dallée, avec ses deux grandes bandes blanches en éventail, et sa grille.
    const slice = (r1: number, r2: number, az: number, half: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i <= 12; i++) out.push(polar(rad(az - half + (i / 12) * 2 * half), r2));
      for (let i = 12; i >= 0; i--) out.push(polar(rad(az - half + (i / 12) * 2 * half), r1));
      return out;
    };
    add(polygonFlat([slice(SQUARE.r1, SQUARE.r2, SQUARE.az, SQUARE.half)], 0.06), std(0xbcb6a8, 0.95), false);
    add(polygonFlat([slice(SQUARE.r1, SQUARE.r2, 70 - 17, 3.5), slice(SQUARE.r1, SQUARE.r2, 70 + 17, 3.5)], 0.075), std(0xe9e6dc, 0.9), false);
    const joints: number[] = [];
    for (let r = SQUARE.r1 + 4; r < SQUARE.r2; r += 4) ribbon([polar(rad(SQUARE.az - SQUARE.half), r), polar(rad(SQUARE.az - 8), r), polar(rad(SQUARE.az + 8), r), polar(rad(SQUARE.az + SQUARE.half), r)], 0.08, 0.08, joints);
    add(flatGeometry(joints), std(0x8d877a, 0.9), false);

    const fence = palaceFence();
    const rail = std(0xb5b8ba, 0.45, { metalness: 0.6 });
    const parts = new THREE.Group();
    fence.slice(1).forEach((b, i) => {
      const a = fence[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (const y of [0.35, 1.15]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), rail);
        m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
        m.rotation.y = yaw;
        parts.add(m);
      }
      const post = new THREE.Mesh(box(0.22, 1.4, 0.22, a[0], 0.7, a[1]), rail);
      parts.add(post);
    });
    scene.add(parts);
    const bars: Pt[] = [];
    fence.slice(1).forEach((b, i) => { const a = fence[i]!; for (let t = 0; t < 1; t += 0.08) bars.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); });
    const barMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5).translate(0, 0.65, 0), rail, bars.length);
    const o = new THREE.Object3D();
    bars.forEach((q, i) => { o.position.set(q[0], 0, q[1]); o.updateMatrix(); barMesh.setMatrixAt(i, o.matrix); });
    scene.add(barMesh);

    // Mâts dressés le long de l'acrotère.
    const front: Pt[] = [en(146, -12), en(148, 10), en(146, 32), en(140, 57), en(128, 82), en(115, 101)];
    const masts: Pt[] = [];
    front.slice(1).forEach((b, i) => { const a = front[i]!; const n = 6; for (let k = 0; k < n; k++) masts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); });
    const mastMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.05, 6, 5).translate(0, h + 3, 0), rail, masts.length);
    masts.forEach((q, i) => { o.position.set(q[0], 0, q[1]); o.updateMatrix(); mastMesh.setMatrixAt(i, o.matrix); });
    scene.add(mastMesh);
  }

  /* ---- Immeuble du CENETI : long côté ouest sur le parking, balcons filants, toit en C ---- */
  const iai = data.buildings.find((b) => b.n === data.iai);
  if (iai) {
    const outer = chaikin(iai.p, 2);
    const inner = grow(outer, -1.4);
    const yard = iai.hole ?? null;
    const FLOORS = 4, STOREY = 3.5, TOP = FLOORS * STOREY;
    const bandMat = std(0xcfccc2, 0.9), wallMat = std(0xa8916f, 0.9);
    const facadeDay = keep(canvasTexture(128, 128, (g) => {
      g.fillStyle = '#a58f6e';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#42596a';
      g.fillRect(16, 42, 96, 52);
      g.fillStyle = '#d9dcdc';
      for (const x of [16, 48, 80, 110]) g.fillRect(x, 42, 3, 52);
      g.fillRect(16, 66, 96, 2);
    }, true));
    const facadeLit = keep(canvasTexture(128, 128, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffd9a0';
      g.fillRect(16, 42, 96, 52);
    }, true));
    const glass = new THREE.MeshStandardMaterial({ map: facadeDay, emissive: 0xffffff, emissiveMap: facadeLit, emissiveIntensity: 0, roughness: 0.6, envMapIntensity: 0.3 });
    glowing.push({ mat: glass, power: 0.55 });
    for (let f = 0; f < FLOORS; f++) {
      const y0 = f * STOREY;
      add(walls(inner, y0, y0 + STOREY, 4.4), glass);
      if (yard) add(walls(yard, y0, y0 + STOREY, 4.4, true), wallMat);
      if (f > 0) {
        add(walls(outer, y0, y0 + 1.05, 40), bandMat);
        add(slabWithHole(outer, inner, y0 + 1.05), bandMat);
        add(slabWithHole(outer, inner, y0), bandMat);
      }
    }
    add(walls(outer, TOP, TOP + 1.05, 40), bandMat);
    add(slabWithHole(outer, yard, TOP + 1.05), std(0x8d8f8b, 0.95));
    if (iai.tan) add(slabWithHole(iai.tan, null, TOP + 1.2), std(0xc6ad7f, 0.95));

    // Façade ouest : p[3] au sud, p[0] au nord.
    const south = iai.p[3]!, north = iai.p[0]!;
    const [tx, tz] = centre(iai.p);
    const mid: Pt = [(south[0] + north[0]) / 2, (south[1] + north[1]) / 2];
    const yaw = Math.atan2(mid[0] - tx, mid[1] - tz);
    const len = Math.hypot(north[0] - south[0], north[1] - south[1]);
    const ax = (north[0] - south[0]) / len, az = (north[1] - south[1]) / len;
    const ox = Math.sin(yaw), oz = Math.cos(yaw);
    const onFacade = (t: number, y: number, off = 0.15): THREE.Vector3 => new THREE.Vector3(south[0] + ax * t + ox * off, y, south[1] + az * t + oz * off);
    // Grands bandeaux courbes aux deux bouts : ils montent d'un balcon à l'acrotère, comme sur la photo.
    const ribbon3d = (from: number, to: number, y0: number, y1: number) => {
      const curve = new THREE.QuadraticBezierCurve3(onFacade(from, y0), onFacade(to, y0), onFacade(to, y1));
      add(new THREE.TubeGeometry(curve, 14, 0.32, 8, false), bandMat);
    };
    ribbon3d(5.5, 1.2, STOREY + 0.5, TOP + 0.7);
    ribbon3d(len - 5.5, len - 1.2, STOREY + 0.5, TOP + 0.7);
    add(new THREE.CylinderGeometry(1.15, 1.15, 2.1, 14).translate(tx + 12, TOP + 2.2, tz), std(0x15171a, 0.5));

    const panel = (text: string, bg: string, fg: string, w: number, h: number, y: number, at = len * 0.3) => {
      const pixels = Math.round((512 * h) / w);
      const tex = keep(canvasTexture(512, pixels, (g) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, 512, pixels);
        g.fillStyle = fg;
        g.font = `700 ${Math.round(pixels * 0.66)}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, 256, pixels / 2, 490);
      }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      m.position.copy(onFacade(at, y, 0.5));
      m.rotation.y = yaw;
      scene.add(m);
    };
    panel('C.E.N.E.T.I', '#d9c98f', '#7a1f16', 7.5, 0.95, 3 * STOREY + 0.5);
    panel('INSEED', '#e6c33a', '#b3261a', 9.5, 1.9, STOREY + 0.5);

    // Entrée, d'après photographie : porche sous le balcon, murs de marbre noir, portes vitrées, plafond blanc, enseigne.
    // Elle est sur la petite façade qui fait face à la clôture de la rue Agoucon et à la pelouse de la sculpture, au droit de la porte de l'intérieur.
    const fr = iaiFrame(iai.p);
    // Devant le mur de façade, sous le balcon : le mur vitré est en retrait d'un peu moins de 1,4 m.
    // La façade est un peu oblique sur la carte : le porche suit sa vraie ligne, à angle droit.
    const [fa, fb] = iai.p.map((q) => [q, fr.local(q)] as const).sort((x, y) => x[1][0] - y[1][0]).slice(0, 2).sort((x, y) => x[1][1] - y[1][1]);
    const t = (ENTRANCE_V - fa![1][1]) / (fb![1][1] - fa![1][1]);
    const wx = fa![0][0] + (fb![0][0] - fa![0][0]) * t, wz = fa![0][1] + (fb![0][1] - fa![0][1]) * t;
    const elen = Math.hypot(fb![0][0] - fa![0][0], fb![0][1] - fa![0][1]);
    let nx = -(fb![0][1] - fa![0][1]) / elen, nz = (fb![0][0] - fa![0][0]) / elen;
    if (nx * fr.eu[0] + nz * fr.eu[1] > 0) { nx = -nx; nz = -nz; }
    const porch = new THREE.Group();
    porch.position.set(wx - nx * 0.85, 0.08, wz - nz * 0.85);
    porch.rotation.y = Math.atan2(nx, nz);
    const blackMarble = std(0x1c1d20, 0.3), glassDoor = std(0x22303a, 0.15, { metalness: 0.6 }), aluFrame = std(0xb8bcc0, 0.35, { metalness: 0.6 });
    porch.add(new THREE.Mesh(box(6.2, 2.8, 0.12, 0, 1.4, 0), blackMarble));
    porch.add(new THREE.Mesh(box(3.2, 2.45, 0.05, 0, 1.23, 0.08), glassDoor));
    for (const x of [-1.6, 0, 1.6]) porch.add(new THREE.Mesh(box(0.08, 2.45, 0.08, x, 1.23, 0.1), aluFrame));
    porch.add(new THREE.Mesh(box(3.3, 0.08, 0.08, 0, 2.48, 0.1), aluFrame));
    for (const x of [-2.4, 2.25]) porch.add(new THREE.Mesh(box(0.7, 0.9, 0.03, x, 1.5, 0.08), std(0x2f7a4a, 0.8)));
    porch.add(new THREE.Mesh(box(7, 0.05, 0.9, 0, STOREY - 0.03, 0.2), std(0xf1efea, 0.9)));
    const signTex = keep(canvasTexture(1024, 176, (g) => {
      g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, 1024, 176);
      g.strokeStyle = '#c9c9c4'; g.lineWidth = 6; g.strokeRect(3, 3, 1018, 170);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#1b2f6b'; g.font = '700 50px serif'; g.fillText('INSTITUT AFRICAIN D\'INFORMATIQUE (IAI-TOGO)', 512, 58, 980);
      g.fillStyle = '#b3261a'; g.font = 'italic 700 46px serif'; g.fillText('Établissement Inter-États d\'Enseignement Supérieur', 512, 124, 980);
    }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
    sign.position.set(0, STOREY + 0.55, 0.97);
    porch.add(sign);
    porch.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = !low; });
    scene.add(porch);

    // Parking entre l'IAI et BSIC, d'après photographie : dalles de béton, abri à toit de tôle sur poteaux blancs, murets entre les places.
    const L = IAI_LOT;
    const lotPoly: Pt[] = [[L.u0, L.v0], [L.u1, L.v0], [L.u1, L.eastV1], [L.eastU0, L.eastV1], [L.eastU0, L.v1], [L.u0, L.v1]].map(([u, v]) => fr.world(u, v));
    const slabs = keep(canvasTexture(128, 128, (g) => {
      g.fillStyle = '#b7a99a'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(90,80,70,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(120,105,92,.25)'; g.fillRect((i * 37) % 128, (i * 59) % 128, 6, 3); }
    }, true));
    const lotGeo = polygonFlat([lotPoly], 0.07);
    const lp = lotGeo.getAttribute('position') as THREE.BufferAttribute, luv = new Float32Array(lp.count * 2);
    for (let i = 0; i < lp.count; i++) { const [u, v] = fr.local([lp.getX(i), lp.getZ(i)]); luv.set([u / 3.5, v / 3.5], i * 2); }
    lotGeo.setAttribute('uv', new THREE.BufferAttribute(luv, 2));
    add(lotGeo, new THREE.MeshStandardMaterial({ map: slabs, roughness: 0.95, envMapIntensity: 0.25 }), false);
    const carport = new THREE.Group();
    const [cx0, cz0] = fr.world((L.carU0 + 1 + L.u1 - 1) / 2, L.v0 + 2.4);
    carport.position.set(cx0, 0.08, cz0);
    carport.rotation.y = Math.atan2(fr.eu[0], fr.eu[1]) - Math.PI / 2;
    const span = L.u1 - L.carU0 - 2;
    const roofTex = keep(canvasTexture(64, 64, (g) => { g.fillStyle = '#b9b0a2'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#9d9486'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64); }, true));
    roofTex.repeat.set(span / 0.6, 1);
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(span, 0.06, 5.2), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.6, metalness: 0.3 }));
    roofMesh.position.set(0, 2.65, 0);
    roofMesh.rotation.x = 0.06;
    carport.add(roofMesh);
    const postMat = std(0xf2f1ec, 0.6), curb = std(0xd6d2c8, 0.95);
    for (let x = -span / 2; x <= span / 2 + 0.01; x += span / 6) {
      carport.add(new THREE.Mesh(box(0.14, 2.6, 0.14, x, 1.3, 2.4), postMat));
      carport.add(new THREE.Mesh(box(0.18, 0.5, 2.2, x, 0.25, -1.3), curb));
    }
    carport.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = !low; });
    scene.add(carport);

    // Rangée de drapeaux devant la façade ouest, derrière la clôture.
    const stripes = [['#1e7a3c', '#f2c318', '#c8261c'], ['#f2c318', '#1e7a3c'], ['#ffffff', '#1e7a3c', '#c8261c'], ['#1e3f9c', '#f2c318', '#c8261c']];
    const rand = mulberry(3);
    for (let i = 0; i < 11; i++) {
      const at = onFacade(len * 0.42 + i * 1.7, 0, 3.2);
      add(new THREE.CylinderGeometry(0.04, 0.05, 7.5, 6).translate(at.x, 3.75, at.z), std(0xc4c6c8, 0.4, { metalness: 0.6 }));
      const colors = stripes[Math.floor(rand() * stripes.length)]!;
      const tex = keep(canvasTexture(48, 32, (g) => colors.forEach((c, k) => { g.fillStyle = c; g.fillRect((k * 48) / colors.length, 0, 48 / colors.length + 1, 32); })));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.9), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.position.set(at.x + ax * 0.68, 6.9, at.z + az * 0.68);
      flag.rotation.y = yaw + Math.PI / 2 + 0.25;
      scene.add(flag);
    }

    // Clôture de la parcelle, sur le tracé de la carte : muret gris, poteaux à chapeau, barreaux à pointe.
    const rail = std(0xb9bcbe, 0.45, { metalness: 0.55 }), base = std(0x9a988f, 0.95);
    const bars: Pt[] = [];
    const posts: THREE.BufferGeometry[] = [];
    for (const [a, b] of data.iaiFence) {
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const yawSeg = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const midX = (a[0] + b[0]) / 2, midZ = (a[1] + b[1]) / 2;
      add(new THREE.BoxGeometry(0.32, 0.75, seg).rotateY(yawSeg).translate(midX, 0.42, midZ), base);
      for (const y of [1.05, 1.95]) add(new THREE.BoxGeometry(0.06, 0.06, seg).rotateY(yawSeg).translate(midX, y, midZ), rail);
      for (let m = 0; m < seg; m += 0.22) bars.push([a[0] + ((b[0] - a[0]) * m) / seg, a[1] + ((b[1] - a[1]) * m) / seg]);
      for (let m = 0; m <= seg; m += 3) {
        const x = a[0] + ((b[0] - a[0]) * m) / seg, z = a[1] + ((b[1] - a[1]) * m) / seg;
        posts.push(new THREE.BoxGeometry(0.24, 1.7, 0.24).translate(x, 1.45, z), new THREE.ConeGeometry(0.2, 0.28, 4).rotateY(Math.PI / 4).translate(x, 2.42, z));
      }
    }
    for (const g of posts) add(g, rail);
    if (bars.length) {
      const bar = new THREE.BufferGeometry().copy(new THREE.CylinderGeometry(0.018, 0.018, 1.25, 4).translate(0, 1.42, 0));
      const pickets = new THREE.InstancedMesh(bar, rail, bars.length);
      const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 0.17, 4).translate(0, 2.13, 0), rail, bars.length);
      const o = new THREE.Object3D();
      bars.forEach((q, i) => { o.position.set(q[0], 0, q[1]); o.updateMatrix(); pickets.setMatrixAt(i, o.matrix); tips.setMatrixAt(i, o.matrix); });
      scene.add(pickets, tips);
    }

    // Annexe : mur-rideau bleu, balcons blancs, toit brun débordant, abri de voitures devant.
    const annex = data.buildings.find((b) => b.annex);
    if (annex) {
      const tile = keep(canvasTexture(128, 256, (g) => {
        g.fillStyle = '#2d62b8';
        g.fillRect(0, 0, 128, 256);
        g.fillStyle = 'rgba(200,225,250,.45)';
        for (const x of [0, 42, 84]) g.fillRect(x, 0, 2, 256);
        for (const y of [0, 85, 170]) g.fillRect(0, y, 128, 2);
        g.fillStyle = '#f2f1ec';
        g.fillRect(46, 76, 40, 14);
        g.fillRect(46, 162, 40, 14);
      }, true));
      add(walls(annex.p, 3, annex.h, 8), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.2, metalness: 0.4, envMapIntensity: 0.5 }));
      add(walls(annex.p, 0, 3, 6), std(0x4d5359, 0.9));
      add(slabWithHole(grow(annex.p, 1), null, annex.h + 0.2), std(0x6b4a38, 0.85));
      add(slabWithHole(annex.p, null, annex.h + 0.1), std(0x6b4a38, 0.85));
    }
    const [px, pz] = fromIai(data, -28, -37);
    const shelter = new THREE.Group();
    shelter.add(new THREE.Mesh(box(5.5, 0.15, 15, 0, 2.7, 0), std(0x2d3238, 0.7)));
    for (const z of [-7, -2.3, 2.3, 7]) shelter.add(new THREE.Mesh(box(0.14, 2.7, 0.14, 2.5, 1.35, z), rail));
    shelter.position.set(px, 0.08, pz);
    shelter.rotation.y = Math.atan2(az * 0 + (ax), az);
    shelter.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = !low; });
    scene.add(shelter);

    // Sculpture à masques dans la cour, au milieu de la pelouse, bordée de haies jaune-vert.
    const [sxp, szp] = fromIai(data, ...SCULPTURE);
    const cream = std(0xdcd2b6, 0.95), dark = std(0x4a3f33, 1);
    const sculpt = new THREE.Group();
    sculpt.add(new THREE.Mesh(box(3, 0.6, 2.4, 0, 0.3, 0), cream));
    sculpt.add(new THREE.Mesh(box(1.9, 2, 1.4, 0.15, 1.6, 0), cream));
    sculpt.add(new THREE.Mesh(box(2.5, 1, 1.5, -0.1, 3.1, 0.05).rotateZ(-0.05), cream));
    sculpt.add(new THREE.Mesh(box(1.3, 1.6, 1, 0.2, 4.4, 0), cream));
    sculpt.add(new THREE.Mesh(box(1.8, 0.8, 1.1, 0, 5.5, 0.05), cream));
    sculpt.add(new THREE.Mesh(box(0.7, 1.6, 0.7, -0.3, 6.6, 0).rotateZ(0.2), cream));
    for (const [mx, my, mz, scale] of [[-1.25, 1.7, 0.45, 0.6], [0.7, 3.2, 0.8, 0.55], [-1, 4.7, 0.5, 0.68]] as const) {
      sculpt.add(new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 10).scale(0.75, 1.1, 0.5).translate(mx, my, mz), std(0xe8dfc4, 0.9)));
      for (const e of [-0.2, 0.2]) sculpt.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5).translate(mx + e * scale * 1.3, my + scale * 0.2, mz + scale * 0.45), dark));
    }
    sculpt.position.set(sxp, 0.08, szp);
    sculpt.rotation.y = yaw;
    sculpt.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = !low; });
    scene.add(sculpt);
    const hedge = std(0x8fa52a, 1);
    const hedgeRun = (a: Pt, b: Pt) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      add(new THREE.BoxGeometry(0.8, 0.7, l).rotateY(Math.atan2(b[0] - a[0], b[1] - a[1])).translate((a[0] + b[0]) / 2, 0.42, (a[1] + b[1]) / 2), hedge);
    };
    // La pelouse suit la rue Agoucon : les haies longent son bord nord et encadrent la sculpture.
    hedgeRun(fromIai(data, -25, -22), fromIai(data, 38, 1));
    hedgeRun(fromIai(data, -12, -18), fromIai(data, -9, -27));
    hedgeRun(fromIai(data, 8, -11), fromIai(data, 11, -20));
  }

  return {
    night(on: boolean) { for (const g of glowing) g.mat.emissiveIntensity = on ? g.power : 0; },
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
