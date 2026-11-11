import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Pt, Room } from './sim';

/**
 * Intérieur de l'immeuble du CENETI (IAI-Togo), d'après une vidéo de visite, huit photographies et l'emprise de la carte.
 * Repris des images : hall d'entrée à sol de marbre gris et blanc en carrés concentriques, plafond blanc sculpté, accueil,
 * ascenseur gris, escalier de marbre ; portes vitrées du hall sur la cour ; galeries tout autour de la cour, en porte-à-faux,
 * angles arrondis, parapet de marbre blanc à bandeau gris côté cour et vert côté galerie ; climatiseurs aux murs ;
 * couloirs en damier noir et crème à portes de bois ; escalier de béton gris et escalier à marches terre cuite ;
 * cour : pelouse bordée de haies, allée brun-rouge sous les galeries, bassin rond entouré d'une haie basse, pas japonais.
 * Supposé : le plan des salles et leur mobilier, la place des escaliers, de l'ascenseur et de la porte, le nombre de salles.
 * Aucune salle n'est nommée. L'intérieur est construit loin de la ville, à plat dans le repère du bâtiment
 * (u le long du grand côté, v en travers). L'entrée est sur la petite façade u = 0, face à la clôture de la rue Agoucon et à la pelouse de la sculpture,
 * et non côté parking, comme l'a indiqué l'utilisateur.
 */
export const STOREY = 3.5;
export const FLOORS = 4;
/** Porte d'entrée sur la petite façade ouest (u = 0), face à la clôture de la rue Agoucon : sa place le long de la façade, en mètres. */
export const ENTRANCE_V = 17.9;
/**
 * Parking de l'IAI, entre l'immeuble et BSIC, dans l'enceinte, comme l'a indiqué l'utilisateur, dans le repère du bâtiment :
 * la bande entre la façade côté BSIC et la clôture (motos le long de la clôture, abri au bout), et une bande le long de la façade est.
 */
export const IAI_LOT = { u0: 12, carU0: 33, u1: 53.4, v0: -5.6, v1: -0.3, eastU0: 46, eastV1: 14 };
const ORIGIN: Pt = [9400, 9000];
const OUT = 5.6, COR = 2.2, G = 2.0, T = 0.2, DOOR = 1.0, DOOR_H = 2.2;

/** Repère du bâtiment d'après son grand côté : passage de la ville au plan, et retour. */
export function iaiFrame(p: Pt[]) {
  let best = 0, a = p[0]!, b = p[1]!;
  p.forEach((q, i) => { const r = p[(i + 1) % p.length]!; const l = Math.hypot(r[0] - q[0], r[1] - q[1]); if (l > best) { best = l; a = q; b = r; } });
  const eu: Pt = [(b[0] - a[0]) / best, (b[1] - a[1]) / best], ev: Pt = [-eu[1], eu[0]];
  const proj = (q: Pt): Pt => [q[0] * eu[0] + q[1] * eu[1], q[0] * ev[0] + q[1] * ev[1]];
  const pr = p.map(proj);
  const u0 = Math.min(...pr.map((q) => q[0])), v0 = Math.min(...pr.map((q) => q[1]));
  return {
    eu, ev,
    local: (q: Pt): Pt => { const [u, v] = proj(q); return [u - u0, v - v0]; },
    world: (u: number, v: number): Pt => [(u + u0) * eu[0] + (v + v0) * ev[0], (u + u0) * eu[1] + (v + v0) * ev[1]],
    W: Math.max(...pr.map((q) => q[0])) - u0, D: Math.max(...pr.map((q) => q[1])) - v0,
  };
}

/** Allées des étudiants dans l'enceinte de l'IAI, dehors : devant l'entrée, autour de la sculpture, sur l'allée du portail et le long du parking. */
export function iaiGroundRoutes(footprint: Pt[]): { y: number; p: Pt[] }[] {
  const fr = iaiFrame(footprint);
  const loops: Pt[][] = [
    [[-3, 2], [-3, 34], [-3, 2]],
    [[-17.5, 25], [-11, 25], [-11, 36], [-17.5, 36], [-17.5, 25]],
    [[-3, -3], [30, -3], [-3, -3]],
    [[-4.5, 8], [-4.5, 28], [-8, 33], [-4.5, 28], [-4.5, 8]],
    [[48.5, -2], [48.5, 20], [48.5, -2]],
  ];
  return loops.map((l) => ({ y: 0.05, p: l.map(([u, v]) => fr.world(u, v)) }));
}

type Seg = { a: Pt; b: Pt; doors?: number[]; gaps?: [number, number][]; glass?: [number, number][]; face?: 'court' | 'outer' };
type RoomRect = { u0: number; v0: number; u1: number; v1: number; kind: 'classe' | 'bureau' | 'labo'; board: 'v0' | 'v1' | 'u0' | 'u1' };

function canvasTexture(draw: (g: CanvasRenderingContext2D) => void, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildIaiInterior(scene: THREE.Scene, footprint: Pt[], hole: Pt[] | null, low: boolean) {
  const frame = iaiFrame(footprint);
  // Le contour réel est un quadrilatère un peu oblique : l'intérieur en garde les dimensions moyennes.
  const W = Math.round(frame.W - 1.2), D = Math.round(frame.D - 0.4);
  const yard = hole?.map(frame.local) ?? [[12, 12.4], [30, 12.4], [30, 23.6], [12, 23.6]] as Pt[];
  const cu0 = Math.max(OUT + 4, Math.min(...yard.map((q) => q[0]))), cu1 = Math.min(W - OUT - 4, Math.max(...yard.map((q) => q[0])));
  const cv0 = Math.max(OUT + COR + 4, Math.min(...yard.map((q) => q[1]))), cv1 = Math.min(D - OUT - COR - 4, Math.max(...yard.map((q) => q[1])));
  const lawn = { u0: cu0 + G, u1: cu1 - G, v0: cv0 + G, v1: cv1 - G };
  const [ox, oz] = ORIGIN;
  const X = (u: number) => ox + u, Z = (v: number) => oz + v;

  const group = new THREE.Group();
  scene.add(group);
  const textures: THREE.Texture[] = [];
  const keep = (t: THREE.Texture) => { textures.push(t); return t; };
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, envMapIntensity: 0.3, ...extra });
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => { const list = parts.get(m); if (list) list.push(g); else parts.set(m, [g]); };
  /** Pavé en coordonnées du bâtiment : u, v au sol, y en hauteur ; regroupé par matériau. */
  const block = (m: THREE.Material, u0: number, v0: number, u1: number, v1: number, y0: number, y1: number) =>
    put(m, new THREE.BoxGeometry(Math.abs(u1 - u0), y1 - y0, Math.abs(v1 - v0)).translate(X((u0 + u1) / 2), (y0 + y1) / 2, Z((v0 + v1) / 2)));
  const rect = (u0: number, v0: number, u1: number, v1: number): Pt[] => [[X(Math.min(u0, u1)), Z(Math.min(v0, v1))], [X(Math.max(u0, u1)), Z(Math.min(v0, v1))], [X(Math.max(u0, u1)), Z(Math.max(v0, v1))], [X(Math.min(u0, u1)), Z(Math.max(v0, v1))]];

  const marble = keep(canvasTexture((g) => {
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(140,140,138,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo((i * 53) % 256, 0); g.bezierCurveTo(((i * 91) % 256), 90, ((i * 37) % 256), 170, ((i * 71) % 256), 256); g.stroke(); }
    g.fillStyle = '#8f9194'; g.fillRect(0, 150, 256, 26);
  }));
  const wallLow = std(0x6f685c), wallHigh = std(0x9d9584), court = std(0xb9a27c), outerIn = std(0x9f9786);
  const wood = std(0x4a2f22, { roughness: 0.6 }), leaf = std(0xdcc07a, { roughness: 0.55 }), alu = std(0xb8bcc0, { metalness: 0.6, roughness: 0.35 });
  const marbleMat = std(0xffffff, { map: marble, roughness: 0.4 }), green = std(0x6f9f8a), white = std(0xeeeeea);
  const lamp = new THREE.MeshBasicMaterial({ color: 0xf6f1e2, fog: false });

  /* ---- Plan ---- */
  // Le hall occupe la petite aile ouest, de la porte d'entrée (face à la clôture de la rue Agoucon) jusqu'aux portes vitrées de la cour.
  const SA: [number, number] = [3.6, 9.6], SB: [number, number] = [W - 10, W - 4], SH: [number, number] = [3.5, 9.5];
  const LIFT = { u0: 1.0, u1: 2.8, v0: cv0, v1: cv0 + 2.0 };
  const split = (a: number, b: number, size = 5.6) => { if (b - a < 0.5) return []; const n = Math.max(1, Math.round((b - a) / size)); return Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n] as [number, number]); };

  function plan(level: number) {
    const list: Seg[] = [], rooms: RoomRect[] = [];
    const seen = new Set<string>();
    const add = (...items: Seg[]) => { for (const it of items) { const k = `${it.a.join()}|${it.b.join()}`; if (!seen.has(k)) { seen.add(k); list.push(it); } } };
    const ground = level === 0;
    add({ a: [0, 0], b: [W, 0], face: 'outer' }, { a: [0, D], b: [W, D], face: 'outer' }, { a: [0, 0], b: [0, D], face: 'outer', gaps: ground ? [[ENTRANCE_V - 1.2, ENTRANCE_V + 1.2]] : [] }, { a: [W, 0], b: [W, D], face: 'outer' });
    for (const north of [false, true]) {
      // Ailes longues : salles côté rue, couloir en damier, salles côté cour ouvrant aussi sur la galerie.
      const vo = north ? D : 0, dir = north ? -1 : 1;
      const vc1 = vo + dir * OUT, vc2 = vo + dir * (OUT + COR), vi = north ? cv1 : cv0;
      const band = (va: number, vb: number) => [Math.min(va, vb), Math.max(va, vb)] as const;
      const stair = north ? SB : SA;
      const corridorDoors: number[] = [];
      for (const [fa, fb] of [[0, stair[0]], [stair[1], W]] as [number, number][]) for (const [a, b] of split(fa, fb)) {
        corridorDoors.push(b - 1.2);
        const [v0, v1] = band(vo, vc1);
        rooms.push({ u0: a, u1: b, v0, v1, kind: 'classe', board: north ? 'v0' : 'v1' });
        if (a > 0) add({ a: [a, vo], b: [a, vc1] });
      }
      add({ a: [stair[0], vo], b: [stair[0], vc1] }, { a: [stair[1], vo], b: [stair[1], vc1] });
      corridorDoors.push(stair[0] + 0.7);
      add({ a: [0, vc1], b: [W, vc1], doors: corridorDoors });
      // Côté cour : deux passages relient le couloir à la galerie.
      const P1: [number, number] = [cu0 + 2, cu0 + 4.2], P2: [number, number] = [cu1 - 4.2, cu1 - 2];
      const innerDoors: number[] = [], courtDoors: number[] = [];
      const [iv0, iv1] = band(vc2, vi);
      for (const [ra, rb] of [[0, P1[0]], [P1[1], P2[0]], [P2[1], W]] as [number, number][]) for (const [a, b] of split(ra, rb, ra < cu0 || rb > cu1 ? 4.8 : 6)) {
        innerDoors.push(a + 1.2);
        if (a >= cu0 - 0.01 && b <= cu1 + 0.01) courtDoors.push(b - 1.2);
        rooms.push({ u0: a, u1: b, v0: iv0, v1: iv1, kind: 'bureau', board: 'u0' });
        if (a > 0) add({ a: [a, vc2], b: [a, vi] });
      }
      for (const [a, b] of [P1, P2]) add({ a: [a, vc2], b: [a, vi] }, { a: [b, vc2], b: [b, vi] });
      add({ a: [0, vc2], b: [W, vc2], doors: innerDoors, gaps: [P1, P2] });
      add({ a: [0, vi], b: [cu0, vi] }, { a: [cu0, vi], b: [cu1, vi], face: 'court', doors: courtDoors, gaps: [P1, P2] }, { a: [cu1, vi], b: [W, vi] });
    }
    // Petites ailes. À l'ouest, le rez-de-chaussée est le hall, ouvert sur la cour par des portes vitrées ; aux étages, une grande salle.
    for (const east of [false, true]) {
      const uw = east ? cu1 : cu0, mid = (cv0 + cv1) / 2;
      const hall = !east && ground;
      const glass: [number, number][] = hall ? [[ENTRANCE_V - 1.8, ENTRANCE_V + 1.8]] : [];
      add({ a: [uw, cv0], b: [uw, cv1], face: 'court', doors: hall ? [] : [mid - 2.6, mid + 2.6], gaps: glass, glass });
      if (!hall) rooms.push({ u0: east ? cu1 : 0, u1: east ? W : cu0, v0: cv0, v1: cv1, kind: 'labo', board: east ? 'u1' : 'u0' });
    }
    // Escalier de marbre : ouvert sur le hall au rez-de-chaussée, en cage aux étages. Ascenseur dans l'angle du hall.
    if (!ground) add({ a: [SH[0], cv1 - OUT], b: [SH[0], cv1] }, { a: [SH[1], cv1 - OUT], b: [SH[1], cv1] }, { a: [SH[0], cv1 - OUT], b: [SH[1], cv1 - OUT], doors: [SH[0] + 0.7] });
    add({ a: [LIFT.u0, LIFT.v0], b: [LIFT.u0, LIFT.v1] }, { a: [LIFT.u1, LIFT.v0], b: [LIFT.u1, LIFT.v1] }, { a: [LIFT.u0, LIFT.v1], b: [LIFT.u1, LIFT.v1] });
    return { segs: list, rooms };
  }

  /* ---- Murs : maillages et collisions ---- */
  const common: Pt[][] = [], groundOnly: Pt[][] = [], upperOnly: Pt[][] = [], topOnly: Pt[][] = [];
  const plans = Array.from({ length: FLOORS }, (_, l) => plan(l));
  for (let l = 0; l < FLOORS; l++) {
    const y0 = l * STOREY, y1 = y0 + STOREY;
    for (const s of plans[l]!.segs) {
      const horizontal = s.a[1] === s.b[1];
      const start = horizontal ? s.a[0] : s.a[1];
      const len = (horizontal ? s.b[0] : s.b[1]) - start;
      // Portes et passages sont donnés en coordonnée absolue : on les ramène le long du mur.
      const gaps = (s.gaps ?? []).map(([a, b]) => [a - start, b - start] as [number, number]);
      const doors = (s.doors ?? []).map((d) => d - start);
      const cuts = [...gaps, ...doors.map((d) => [d - DOOR / 2, d + DOOR / 2] as [number, number])].sort((p, q) => p[0] - q[0]);
      const pieces: [number, number][] = [];
      let at = 0;
      for (const [a, b] of cuts) { if (a > at) pieces.push([at, a]); at = Math.max(at, b); }
      if (at < len) pieces.push([at, len]);
      const pt = (t: number): Pt => horizontal ? [s.a[0] + t, s.a[1]] : [s.a[0], s.a[1] + t];
      const box = (t0: number, t1: number, ya: number, yb: number, m: THREE.Material, thick = T) => {
        const [u0, v0] = pt(t0), [u1, v1] = pt(t1);
        if (horizontal) block(m, u0, v0 - thick / 2, u1, v1 + thick / 2, ya, yb); else block(m, u0 - thick / 2, v0, u1 + thick / 2, v1, ya, yb);
      };
      const faceMat = s.face === 'court' ? court : s.face === 'outer' ? outerIn : null;
      // Un mur identique à tous les niveaux sert de collision commune ; sinon il ne compte qu'au rez-de-chaussée ou aux étages.
      const same = JSON.stringify(s);
      const everywhere = plans.every((pl) => pl.segs.some((o) => JSON.stringify(o) === same));
      for (const [t0, t1] of pieces) {
        if (faceMat) box(t0, t1, y0, y1, faceMat);
        else { box(t0, t1, y0, y0 + 1.1, wallLow); box(t0, t1, y0 + 1.1, y1, wallHigh); }
        const [a, b] = [pt(t0), pt(t1)];
        const poly = horizontal ? rect(a[0], a[1] - T / 2, b[0], b[1] + T / 2) : rect(a[0] - T / 2, a[1], b[0] + T / 2, b[1]);
        if (everywhere) { if (l === 0) common.push(poly); } else if (l === 0) groundOnly.push(poly); else if (l === 1) upperOnly.push(poly);
      }
      // Linteaux, chambranles de bois et vantail ouvert contre le mur.
      for (const d of doors) {
        box(d - DOOR / 2, d + DOOR / 2, y0 + DOOR_H, y1, faceMat ?? wallHigh);
        for (const e of [-1, 1]) box(d + e * (DOOR / 2) - 0.04, d + e * (DOOR / 2) + 0.04, y0, y0 + DOOR_H, wood, T + 0.04);
        box(d - DOOR / 2, d + DOOR / 2, y0 + DOOR_H, y0 + DOOR_H + 0.08, wood, T + 0.04);
        // Le vantail s'ouvre dans la salle : à l'opposé du couloir, ou de la cour pour les portes sur la galerie.
        const [u, v] = pt(d + DOOR / 2);
        if (horizontal) {
          const away = s.face === 'court' ? s.a[1] - (cv0 + cv1) / 2 : s.a[1] - (s.a[1] < D / 2 ? OUT + COR / 2 : D - OUT - COR / 2);
          block(leaf, u - 0.03, v, u + 0.03, v + Math.sign(away) * 0.9, y0, y0 + DOOR_H - 0.02);
        } else block(leaf, u, v - 0.03, u + Math.sign(s.a[0] - (cu0 + cu1) / 2) * 0.9, v + 0.03, y0, y0 + DOOR_H - 0.02);
      }
      for (const [a, b] of gaps) {
        const glassDoor = (s.face === 'outer' && l === 0) || (s.glass ?? []).some(([ga, gb]) => Math.abs(ga - start - a) < 0.01 && Math.abs(gb - start - b) < 0.01);
        if (glassDoor) {
          // Portes vitrées à cadre d'aluminium : l'entrée, et le hall sur la cour.
          box(a, b, y0 + 2.5, y1, faceMat ?? wallHigh);
          for (let t = a; t <= b + 0.01; t += (b - a) / 2) box(t - 0.05, t + 0.05, y0, y0 + 2.5, alu);
          box(a, b, y0 + 2.45, y0 + 2.55, alu);
        } else box(a, b, y0 + 2.6, y1, faceMat ?? wallHigh);
      }
    }
  }

  /* ---- Fenêtres claires : sur la rue, sur la cour et au bout des couloirs ---- */
  const windows: THREE.BufferGeometry[] = [];
  const pane = (u: number, v: number, w: number, along: 'u' | 'v', y: number, inset: number) => {
    const g = new THREE.PlaneGeometry(w, 1.35);
    if (along === 'v') g.rotateY(Math.PI / 2);
    windows.push(g.translate(X(u + (along === 'v' ? inset : 0)), y + 1.75, Z(v + (along === 'u' ? inset : 0))));
  };
  for (let l = 0; l < FLOORS; l++) {
    const y0 = l * STOREY;
    for (const r of plans[l]!.rooms) {
      const cu = (r.u0 + r.u1) / 2 - 0.4, w = Math.min(2.6, r.u1 - r.u0 - 2.6);
      if (w > 0.8 && r.v0 === 0) pane(cu, 0, w, 'u', y0, T / 2 + 0.01);
      if (w > 0.8 && r.v1 === D) pane(cu, D, w, 'u', y0, -T / 2 - 0.01);
      if (w > 0.8 && r.kind === 'bureau' && r.u0 >= cu0 - 0.01 && r.u1 <= cu1 + 0.01) for (const v of [cv0, cv1]) if (r.v0 === v || r.v1 === v) for (const off of [-T / 2 - 0.01, T / 2 + 0.01]) pane(cu - 0.6, v, w, 'u', y0, off);
      if (r.kind === 'labo') { const cv = (r.v0 + r.v1) / 2; const uo = r.u0 === 0 ? 0 : W; for (const dv of [-3.4, 3.4]) pane(uo, cv + dv, 2.0, 'v', y0, r.u0 === 0 ? T / 2 + 0.01 : -T / 2 - 0.01); }
    }
    for (const v of [OUT + COR / 2, D - OUT - COR / 2]) { pane(0, v, 1.6, 'v', y0, T / 2 + 0.01); pane(W, v, 1.6, 'v', y0, -T / 2 - 0.01); }
  }
  group.add(new THREE.Mesh(mergeGeometries(windows), new THREE.MeshBasicMaterial({ color: 0xdcecf6, side: THREE.DoubleSide, fog: false })));

  /* ---- Sols et plafonds ---- */
  const checker = keep(canvasTexture((g) => {
    // Grands carrés de mosaïque : 4 × 4 petits carreaux, joints clairs.
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#2c2e33' : '#e6dec9'; g.fillRect(i * 128, j * 128, 128, 128); }
    g.strokeStyle = 'rgba(120,112,96,.55)'; g.lineWidth = 2;
    for (let k = 0; k <= 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
  }));
  checker.repeat.set(1 / 0.84, 1 / 0.84);
  const shapeOf = (holes: Pt[][]) => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, D), new THREE.Vector2(0, D)]);
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    return s;
  };
  const box2 = (u0: number, v0: number, u1: number, v1: number): Pt[] => [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
  const courtHole = box2(cu0, cv0, cu1, cv1), lawnHole = box2(lawn.u0, lawn.v0, lawn.u1, lawn.v1);
  // Trémies d'escalier : au-dessus du rez-de-chaussée, le sol s'ouvre sur les volées.
  const stairHole = (st: [number, number], vb: number, sgn: number) => { const a = vb + sgn * 0.1, b = vb + sgn * (OUT - 0.1); return box2(st[0] + 1.2, Math.min(a, b), st[1] - 0.1, Math.max(a, b)); };
  // Tournée d'un quart de tour, la forme passe de (u, v) à (x, z) ; sa face regarde alors vers le bas.
  const flat = (holes: Pt[][], at: number) => new THREE.ShapeGeometry(shapeOf(holes)).rotateX(Math.PI / 2).translate(ox, at, oz);
  const floorMat = std(0xffffff, { map: checker, roughness: 0.45, side: THREE.DoubleSide }), ceilMat = std(0xe9e6de);
  for (let l = 0; l <= FLOORS; l++) {
    const y = l * STOREY;
    const holes = l === 0 ? [courtHole] : [lawnHole, ...(l < FLOORS ? [stairHole(SA, 0, 1), stairHole(SB, D, -1), stairHole(SH, cv1, -1)] : [])];
    if (l < FLOORS) { const f = new THREE.Mesh(flat(holes, y + 0.01), floorMat); f.receiveShadow = !low; group.add(f); }
    if (l > 0) group.add(new THREE.Mesh(flat(holes, y - 0.02), ceilMat));
  }
  const roofHole = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, D), new THREE.Vector2(0, D)]);
  roofHole.holes.push(new THREE.Path(lawnHole.map(([u, v]) => new THREE.Vector2(u, v))));
  group.add(new THREE.Mesh(new THREE.ShapeGeometry(roofHole).rotateX(Math.PI / 2).translate(ox, FLOORS * STOREY + 0.3, oz), std(0x8d8f8b, { side: THREE.DoubleSide })));

  /* ---- Hall d'entrée : marbre en carrés concentriques, plafond sculpté, accueil, ascenseur ---- */
  const hallFloor = keep(canvasTexture((g) => {
    g.fillStyle = '#d9d8d3'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#7f8487';
    for (let k = 0; k < 6; k++) { const m = 24 + k * 40, w = 18; g.fillRect(m, m, 512 - 2 * m, w); g.fillRect(m, 512 - m - w, 512 - 2 * m, w); g.fillRect(m, m, w, 512 - 2 * m); g.fillRect(512 - m - w, m, w, 512 - 2 * m); }
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo((i * 61) % 512, 0); g.bezierCurveTo((i * 97) % 512, 200, (i * 43) % 512, 330, (i * 79) % 512, 512); g.stroke(); }
  }, 512, 512));
  const shells = keep(canvasTexture((g) => {
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let i = -1; i < 5; i++) {
      const x = i * 64 + (row % 2) * 32, y = row * 32;
      const grad = g.createRadialGradient(x + 32, y + 30, 4, x + 32, y + 30, 34);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.7, '#e7e5df'); grad.addColorStop(1, '#c9c6be');
      g.fillStyle = grad; g.beginPath(); g.ellipse(x + 32, y + 28, 30, 16, 0, 0, Math.PI * 2); g.fill();
    }
  }));
  shells.repeat.set(3, 3);
  const hallPlane = (mat: THREE.Material, y: number, up: boolean) => {
    const g = new THREE.PlaneGeometry(cu0, cv1 - cv0).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(X(cu0 / 2), y, Z((cv0 + cv1) / 2));
    group.add(new THREE.Mesh(g, mat));
  };
  hallPlane(std(0xffffff, { map: hallFloor, roughness: 0.3 }), 0.02, true);
  hallPlane(std(0xffffff, { map: shells, roughness: 0.9 }), STOREY - 0.04, false);
  // Comptoir d'accueil à gauche en entrant, contre le mur du hall : le passage vers la porte reste libre.
  // Comptoir d'accueil sur le côté du hall, le passage de la porte à la cour reste libre.
  block(white, 4.2, cv0 + 0.4, 7.0, cv0 + 1.1, 0, 1.05);
  block(std(0x5b5f63), 4.15, cv0 + 0.35, 7.05, cv0 + 1.15, 1.05, 1.1);
  groundOnly.push(rect(4.2, cv0 + 0.4, 7.0, cv0 + 1.1));
  block(std(0xc8261c, { roughness: 0.4 }), 0.1, cv0 + 3.0, 0.25, cv0 + 3.3, 0.9, 1.5);
  // Ascenseur : gaine sur toute la profondeur, portes d'acier gris sur le couloir à chaque niveau.
  const steel = std(0x6d747c, { metalness: 0.5, roughness: 0.45 });
  const liftV = LIFT.v1;
  common.push(rect(LIFT.u0, LIFT.v0, LIFT.u1, LIFT.v1));
  for (let l = 0; l < FLOORS; l++) {
    const y0 = l * STOREY;
    block(steel, LIFT.u0 + 0.3, liftV + 0.1, LIFT.u1 - 0.3, liftV + 0.16, y0, y0 + 2.2);
    block(std(0x3a3d40), (LIFT.u0 + LIFT.u1) / 2 - 0.01, liftV + 0.09, (LIFT.u0 + LIFT.u1) / 2 + 0.01, liftV + 0.17, y0, y0 + 2.2);
    block(std(0x8a8c8e), LIFT.u1 + 0.05, liftV + 0.1, LIFT.u1 + 0.18, liftV + 0.18, y0 + 1.1, y0 + 1.35);
  }

  /* ---- Cour : pelouse bordée de haies, allée brun-rouge, bassin rond dans sa haie, pas japonais ---- */
  const grass = keep(canvasTexture((g) => {
    g.fillStyle = '#6f9a45'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = i % 5 ? 'rgba(150,140,70,.28)' : 'rgba(60,110,40,.35)'; g.fillRect((i * 97) % 256, (i * 57 + (i % 7) * 13) % 256, 2 + (i % 4), 2); }
  }));
  grass.repeat.set((lawn.u1 - lawn.u0) / 5, (lawn.v1 - lawn.v0) / 5);
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(lawn.u1 - lawn.u0, lawn.v1 - lawn.v0).rotateX(-Math.PI / 2).translate(X((lawn.u0 + lawn.u1) / 2), 0.03, Z((lawn.v0 + lawn.v1) / 2)), std(0xffffff, { map: grass, roughness: 1 })));
  const pave = keep(canvasTexture((g) => { g.fillStyle = '#86503f'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(60,30,22,.5)'; g.lineWidth = 2; for (let k = 0; k <= 128; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); } }, 128, 128));
  pave.repeat.set(1 / 1.2, 1 / 1.2);
  const walkShape = new THREE.Shape(box2(cu0, cv0, cu1, cv1).map(([u, v]) => new THREE.Vector2(u, v)));
  walkShape.holes.push(new THREE.Path(lawnHole.map(([u, v]) => new THREE.Vector2(u, v))));
  group.add(new THREE.Mesh(new THREE.ShapeGeometry(walkShape).rotateX(Math.PI / 2).translate(ox, 0.025, oz), std(0xffffff, { map: pave, roughness: 0.85, side: THREE.DoubleSide })));
  const hedge = std(0x3f6a37, { flatShading: true });
  for (const [a, b, c, d] of [[lawn.u0, lawn.v0, lawn.u1, lawn.v0 + 0.45], [lawn.u0, lawn.v1 - 0.45, lawn.u1 - 2.4, lawn.v1], [lawn.u0, lawn.v0 + 0.45, lawn.u0 + 0.45, lawn.v1 - 0.45], [lawn.u1 - 0.45, lawn.v0 + 0.45, lawn.u1, lawn.v1 - 2.6]] as const) block(hedge, a, b, c, d, 0, 0.45);
  const bu = (lawn.u0 + lawn.u1) / 2 + 1.5, bv = (lawn.v0 + lawn.v1) / 2;
  const stone = std(0x9fa19e, { roughness: 0.9 });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.05, 0.5, 32, 1, true).translate(X(bu), 0.28, Z(bv)), stone));
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.5, 32, 1, true).translate(X(bu), 0.28, Z(bv)), std(0x8d8f8c, { side: THREE.BackSide })));
  group.add(new THREE.Mesh(new THREE.RingGeometry(1.8, 2.05, 32).rotateX(-Math.PI / 2).translate(X(bu), 0.53, Z(bv)), stone));
  group.add(new THREE.Mesh(new THREE.CircleGeometry(1.8, 32).rotateX(-Math.PI / 2).translate(X(bu), 0.3, Z(bv)), std(0x76817b, { roughness: 0.4 })));
  group.add(new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.35, 6, 28).rotateX(Math.PI / 2).scale(1, 0.9, 1).translate(X(bu), 0.2, Z(bv)), hedge));
  for (let i = 0; i < 8; i++) { const t = i / 7; block(std(0xc9c3b4), lawn.u1 - 0.9 - t * 4 - 0.32, lawn.v1 - 1.2 - t * t * 2 - 0.22, lawn.u1 - 0.9 - t * 4 + 0.32, lawn.v1 - 1.2 - t * t * 2 + 0.22, 0, 0.06); }
  common.push(Array.from({ length: 12 }, (_, i) => [X(bu) + Math.cos((i / 12) * Math.PI * 2) * 2.6, Z(bv) + Math.sin((i / 12) * Math.PI * 2) * 2.6] as Pt));
  // Poubelles vertes et poste de lavage des mains sur l'allée.
  for (const [u, v] of [[cu0 + 0.9, cv1 - 1], [cu1 - 0.9, cv0 + 1]] as const) {
    put(std(0x2f5f3f), new THREE.CylinderGeometry(0.33, 0.3, 0.8, 12).translate(X(u), 0.4, Z(v)));
    common.push(rect(u - 0.35, v - 0.35, u + 0.35, v + 0.35));
  }
  block(white, cu0 + 8.6, cv1 - 1.4, cu0 + 9.1, cv1 - 0.9, 0.9, 1.6);
  block(std(0x9a9c9e), cu0 + 8.8, cv1 - 1.2, cu0 + 8.9, cv1 - 1.1, 0, 0.9);
  put(std(0x2050a0), new THREE.CylinderGeometry(0.25, 0.22, 0.25, 12).translate(X(cu0 + 8.85), 0.13, Z(cv1 - 0.7)));

  /* ---- Galeries : dalle en porte-à-faux, parapet arrondi aux angles, marbre côté cour, vert côté galerie ---- */
  const R = 1.4, ring: Pt[] = [];
  const corner = (cu: number, cv: number, a0: number) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); ring.push([cu + Math.cos(a) * R, cv + Math.sin(a) * R]); } };
  corner(lawn.u0 + R, lawn.v0 + R, Math.PI); corner(lawn.u1 - R, lawn.v0 + R, Math.PI * 1.5); corner(lawn.u1 - R, lawn.v1 - R, 0); corner(lawn.u0 + R, lawn.v1 - R, Math.PI / 2);
  /** Pavés le long du contour de la pelouse ; « off » positif vers la pelouse. */
  const along = (m: THREE.Material, off: number, thick: number, y0: number, y1: number) => ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) return;
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    const mu = (a[0] + b[0]) / 2 + nx * off, mv = (a[1] + b[1]) / 2 + nz * off;
    put(m, new THREE.BoxGeometry(len + 0.06, y1 - y0, thick).rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])).translate(X(mu), (y0 + y1) / 2, Z(mv)));
  });
  const ac = std(0xe9e9e4, { roughness: 0.5 }), red = std(0xc0392b);
  for (let l = 1; l <= FLOORS; l++) {
    const y = l * STOREY;
    along(marbleMat, 0.1, 0.14, y - 0.45, y + (l < FLOORS ? 1.0 : 0.4));
    if (l < FLOORS) { along(green, -0.05, 0.08, y, y + 0.95); along(white, 0.03, 0.3, y + 0.95, y + 1.05); }
  }
  upperOnly.push(box2(lawn.u0 - 0.1, lawn.v0 - 0.1, lawn.u1 + 0.1, lawn.v1 + 0.1).map(([u, v]) => [X(u), Z(v)] as Pt));
  for (let l = 0; l < FLOORS; l++) {
    const y0 = l * STOREY;
    // Climatiseurs posés contre les murs de la cour ; tuyau rouge le long de la galerie.
    for (const [u, v, ou] of [[cu0 + 6.5, cv0, 1], [cu1 - 5, cv0, 1], [cu0 + 9, cv1, -1], [cu1 - 7.5, cv1, -1]] as const) block(ac, u, v + ou * 0.12, u + 0.8, v + ou * 0.42, y0 + (l ? 0 : 2.0), y0 + (l ? 0.55 : 2.55));
    if (l > 0) block(red, cu0 + 0.5, cv0 + 0.25, cu1 - 0.5, cv0 + 0.28, y0 + 0.02, y0 + 0.05);
  }

  /* ---- Escaliers à palier : béton gris (A), terre cuite (B), marbre dans le hall (H) ---- */
  const rail = std(0xc9cbcc, { metalness: 0.6, roughness: 0.35 });
  const stairs = [
    // vb : le mur d'où partent les volées ; sgn : le sens vers l'intérieur de la cage.
    { span: SA, vb: 0, sgn: 1, tread: std(0x8e8c86), edge: std(0x3d3e40), tube: true },
    { span: SB, vb: D, sgn: -1, tread: std(0xa5462f), edge: std(0xe8e4da), tube: true },
    { span: SH, vb: cv1, sgn: -1, tread: std(0xffffff, { map: marble, roughness: 0.35 }), edge: std(0x55585b), tube: false },
  ];
  for (const st of stairs) {
    const [s0, s1] = st.span;
    const vAt = (sv: number) => st.vb + st.sgn * sv;
    for (let l = 0; l < FLOORS - 1; l++) {
      const base = l * STOREY, half = STOREY / 2, steps = 10, rise = half / steps;
      for (let k = 0; k < steps; k++) {
        // Volée 1 côté rue, en montant vers le palier ; volée 2 côté couloir, en revenant.
        const u1a = s0 + 1.2 + k * 0.3, y1 = base + (k + 1) * rise;
        block(st.edge, u1a, vAt(0.15), u1a + 0.3, vAt(2.7), y1 - rise, y1 - 0.04);
        block(st.tread, u1a, vAt(0.15), u1a + 0.3, vAt(2.7), y1 - 0.04, y1);
        const u2a = s0 + 4.2 - (k + 1) * 0.3, y2 = base + half + (k + 1) * rise;
        block(st.edge, u2a, vAt(2.9), u2a + 0.3, vAt(5.45), y2 - rise, y2 - 0.04);
        block(st.tread, u2a, vAt(2.9), u2a + 0.3, vAt(5.45), y2 - 0.04, y2);
      }
      block(st.tread, s0 + 4.2, vAt(0.15), s1 - 0.1, vAt(5.45), base + half - 0.15, base + half);
      if (st.tube) {
        block(wallHigh, s0 + 1.2, vAt(2.7), s0 + 4.2, vAt(2.9), base, base + STOREY);
        for (const sv of [2.62, 2.98]) put(rail, new THREE.CylinderGeometry(0.025, 0.025, 3.5, 6).rotateZ(Math.PI / 2).rotateZ(sv < 2.8 ? Math.atan2(half, 3) : -Math.atan2(half, 3)).translate(X(s0 + 2.7), base + (sv < 2.8 ? half / 2 : half * 1.5) + 0.9, Z(vAt(sv))));
      } else block(white, s0 + 1.2, vAt(2.74), s0 + 4.2, vAt(2.86), base, base + half + 1.0);
    }
    common.push(rect(s0 + 1.2, vAt(2.7), s0 + 4.2, vAt(2.9)));
    // Au dernier niveau, plus de volée vers le haut : la trémie est fermée par un garde-corps.
    topOnly.push(rect(s0 + 1.2, vAt(0.1), s1, vAt(2.8)), rect(s0 + 4.2, vAt(2.8), s1, vAt(5.5)));
    block(rail, s0 + 1.2, vAt(2.75), s1 - 0.1, vAt(2.85), (FLOORS - 1) * STOREY, (FLOORS - 1) * STOREY + 1.0);
  }
  const ground = (x: number, z: number, y: number) => {
    const u = x - ox, v = z - oz;
    for (const st of stairs) {
      const [s0, s1] = st.span;
      const sv = (v - st.vb) * st.sgn, su = u - s0;
      if (u < s0 || u > s1 || sv < 0 || sv > OUT) continue;
      let best = 0, gap = Infinity;
      for (let l = 0; l < FLOORS; l++) {
        const base = l * STOREY, half = STOREY / 2;
        // Au dernier niveau, seule la bande de départ est un sol : la trémie s'ouvre sur la volée qui descend.
        if (l === FLOORS - 1 && su >= 1.2) continue;
        const c = su < 1.2 ? base : su >= 4.2 ? base + half : sv < 2.8 ? base + ((su - 1.2) / 3) * half : base + half + ((4.2 - su) / 3) * half;
        if (Math.abs(c - y) < gap) { gap = Math.abs(c - y); best = c; }
      }
      return best;
    }
    if (u > lawn.u0 && u < lawn.u1 && v > lawn.v0 && v < lawn.v1) return 0;
    return Math.max(0, Math.min(FLOORS - 1, Math.round(y / STOREY))) * STOREY;
  };

  /* ---- Mobilier supposé : tables et bancs, tableau, bureaux, postes informatiques ---- */
  const desk = mergeGeometries([new THREE.BoxGeometry(1.4, 0.05, 0.55).translate(0, 0.75, 0), new THREE.BoxGeometry(1.4, 0.6, 0.04).translate(0, 0.42, 0.25), new THREE.BoxGeometry(1.4, 0.06, 0.32).translate(0, 0.45, -0.45)])!;
  const desks: THREE.Matrix4[] = [], screens: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const board = std(0x2f4a3a, { roughness: 0.9 });
  const groundDesk: Pt[][] = [], upperDesk: Pt[][] = [];
  for (let l = 0; l < FLOORS; l++) {
    const y0 = l * STOREY;
    for (const r of plans[l]!.rooms) {
      const w = r.u1 - r.u0, d = r.v1 - r.v0;
      block(lamp, r.u0 + w / 2 - 0.6, r.v0 + d / 2 - 0.3, r.u0 + w / 2 + 0.6, r.v0 + d / 2 + 0.3, y0 + STOREY - 0.06, y0 + STOREY - 0.02);
      const solid = (poly: Pt[]) => { if (l === 0) groundDesk.push(poly); else if (l === 1) upperDesk.push(poly); };
      if (r.kind === 'classe' && w > 4) {
        // Tables face au tableau, sur le mur du couloir ; la porte reste dégagée.
        const toward = r.board === 'v1' ? 1 : -1, wallV = r.board === 'v1' ? r.v1 : r.v0;
        block(board, r.u0 + w / 2 - 1.7, wallV - toward * 0.13, r.u0 + w / 2 + 0.7, wallV - toward * 0.07, y0 + 1.0, y0 + 2.2);
        for (let row = 0; row < 3; row++) {
          const v = wallV - toward * (1.7 + row * 1.25);
          for (const du of [-0.8, 0.8]) desks.push(m4.clone().makeRotationY(toward > 0 ? 0 : Math.PI).setPosition(X(r.u0 + w / 2 + du - 0.3), y0, Z(v)));
          solid(rect(r.u0 + w / 2 - 1.85, v - 0.5, r.u0 + w / 2 + 1.25, v + 0.5));
        }
      } else if (r.kind === 'labo') {
        for (let row = 0; row < 3; row++) for (let k = 0; k < 3; k++) {
          const u = r.u0 + 2 + k * ((w - 4) / 2), v = r.v0 + 2.2 + row * ((d - 4.4) / 2);
          if (r.u0 === 0 && ((u < LIFT.u1 + 1 && v < LIFT.v1 + 1.5) || (u > SH[0] - 1 && u < SH[1] + 1 && v > cv1 - OUT - 1))) continue;
          desks.push(m4.clone().makeRotationY(Math.PI / 2).setPosition(X(u), y0, Z(v)));
          screens.push(m4.clone().makeRotationY(Math.PI / 2).setPosition(X(u), y0 + 0.98, Z(v)));
          solid(rect(u - 0.5, v - 0.75, u + 0.5, v + 0.75));
        }
      } else if (r.kind === 'bureau' && w > 3) {
        desks.push(m4.clone().setPosition(X(r.u0 + w / 2), y0, Z((r.v0 + r.v1) / 2)));
        screens.push(m4.clone().setPosition(X(r.u0 + w / 2), y0 + 0.98, Z((r.v0 + r.v1) / 2)));
        solid(rect(r.u0 + w / 2 - 0.75, (r.v0 + r.v1) / 2 - 0.55, r.u0 + w / 2 + 0.75, (r.v0 + r.v1) / 2 + 0.55));
      }
    }
  }
  const deskMesh = new THREE.InstancedMesh(desk, std(0x7b5a3c, { roughness: 0.7 }), desks.length);
  desks.forEach((m, i) => deskMesh.setMatrixAt(i, m));
  deskMesh.castShadow = !low;
  group.add(deskMesh);
  const screenMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.34, 0.05), std(0x141518, { emissive: 0x1d2c44, emissiveIntensity: 0.6 }), Math.max(1, screens.length));
  screens.forEach((m, i) => screenMesh.setMatrixAt(i, m));
  group.add(screenMesh);
  for (let l = 0; l < FLOORS; l++) for (const v of [OUT + COR / 2, D - OUT - COR / 2]) for (let u = 3; u < W - 2; u += 4) block(lamp, u - 0.25, v - 0.25, u + 0.25, v + 0.25, l * STOREY + STOREY - 0.05, l * STOREY + STOREY - 0.02);

  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!, m);
    mesh.castShadow = !low && m !== lamp;
    mesh.receiveShadow = !low;
    group.add(mesh);
  }
  const light = new THREE.PointLight(0xfff2de, 9, 14, 1.4);
  group.add(light);

  const room: Omit<Room, 'name'> = {
    x0: X(0.15), z0: Z(0.15), x1: X(W - 0.15), z1: Z(D - 0.15), solids: common, ground,
    levels: [
      { from: -10, to: STOREY / 2, solids: [...groundOnly, ...groundDesk] },
      { from: STOREY / 2, to: 99, solids: [...upperOnly, ...upperDesk] },
      { from: (FLOORS - 1) * STOREY - 0.5, to: 99, solids: topOnly },
    ],
    lift: { points: [[X((LIFT.u0 + LIFT.u1) / 2), Z(liftV + 0.9)]], storey: STOREY, floors: FLOORS },
    door: [X(0.7), Z(ENTRANCE_V)], spawn: { x: X(2.6), z: Z(ENTRANCE_V), heading: Math.PI / 2 },
  };
  // Parcours des étudiants : couloirs en aller-retour, tour des galeries, allée de la cour et hall.
  const routes: { y: number; p: Pt[] }[] = [];
  const gallery: Pt[] = [[cu0 + 1, cv0 + 1], [cu1 - 1, cv0 + 1], [cu1 - 1, cv1 - 1], [cu0 + 1, cv1 - 1], [cu0 + 1, cv0 + 1]];
  for (let l = 0; l < FLOORS; l++) {
    const y = l * STOREY;
    for (const v of [OUT + COR / 2, D - OUT - COR / 2]) routes.push({ y, p: [[1.2, v], [W - 1.2, v], [1.2, v]] });
    routes.push({ y, p: l ? gallery : gallery.map(([u, v]) => [u - 0.2, v] as Pt) });
  }
  routes.push({ y: 0, p: [[2.8, ENTRANCE_V], [cu0 + 1, ENTRANCE_V], [2.8, ENTRANCE_V]] });
  for (const r of routes) r.p = r.p.map(([u, v]) => [X(u), Z(v)] as Pt);

  return {
    room,
    routes,
    /** Lumière d'appoint qui suit Honorable dans les couloirs. */
    follow(x: number, y: number, z: number) { light.position.set(x, y + 2.4, z); },
    level: (y: number) => Math.round(y / STOREY),
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
