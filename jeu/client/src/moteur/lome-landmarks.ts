import * as THREE from 'three';
import { flatGeometry } from './kit';
import type { LomeData } from './lome';
import { slabWithHole } from './lome-places';
import type { Pt } from './sim';

/**
 * Établissements reconnaissables, redessinés d'après des captures de référence, sur leur emprise de la carte.
 * Les enseignes sont de simples textes : aucun logo n'est repris. Les faces non photographiées répètent la façade vue.
 */
type Paint = (color: string, x: number, y: number, w: number, h: number) => void;
type Draw = (paint: Paint, win: Paint) => void;
const centre = (p: Pt[]) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length] as Pt, [0, 0] as Pt);
const area = (l: Pt[]) => l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
function grow(ring: Pt[], by: number) {
  const [cx, cz] = centre(ring);
  return ring.map((p) => { const d = Math.hypot(p[0] - cx, p[1] - cz) || 1; return [p[0] + ((p[0] - cx) / d) * by, p[1] + ((p[1] - cz) / d) * by] as Pt; });
}
function walls(ring: Pt[], y0: number, y1: number, uStep: number) {
  const loop = [...ring];
  if (area(loop) > 0) loop.reverse();
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
function roof(ring: Pt[], y: number) {
  const shape = ring.map((p) => new THREE.Vector2(p[0], p[1]));
  const pos: number[] = [];
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(shape, [])) {
    const p = shape[i!]!, q = shape[j!]!, r = shape[k!]!;
    const up = (q.y - p.y) * (r.x - p.x) - (q.x - p.x) * (r.y - p.y) > 0;
    const [m, n] = up ? [q, r] : [r, q];
    pos.push(p.x, y, p.y, m.x, y, m.y, n.x, y, n.y);
  }
  return flatGeometry(pos);
}

export function buildLandmarks(scene: THREE.Scene, data: LomeData, low: boolean) {
  const textures: THREE.Texture[] = [];
  const mats: THREE.MeshStandardMaterial[] = [];
  const std = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.3 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    scene.add(mesh);
    return mesh;
  };
  /** Une travée de façade sur 128 × 256 : le dessin est rejoué en noir et lumière pour la nuit. */
  const facade = (draw: Draw) => {
    const make = (lit: boolean) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 256);
      const fill: Paint = (color, x, y, w, h) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
      draw(lit ? () => {} : fill, lit ? (_, x, y, w, h) => fill('#ffd9a0', x, y, w, h) : fill);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      textures.push(t);
      return t;
    };
    const m = new THREE.MeshStandardMaterial({ map: make(false), emissive: 0xffffff, emissiveMap: make(true), emissiveIntensity: 0, roughness: 0.6, envMapIntensity: 0.3 });
    mats.push(m);
    return m;
  };
  /** La façade principale est le long côté le plus proche d'une rue. */
  const front = (b: LomeData['buildings'][number]) => {
    const [cx, cz] = centre(b.p);
    let best = Infinity, mid: Pt = b.p[0]!, length = 0, along = 0;
    b.p.forEach((a, i) => {
      const q = b.p[(i + 1) % b.p.length]!;
      const m: Pt = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2];
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
      let d = Infinity;
      for (const r of data.roads) { if (r.c === 'service') continue; for (const k of r.p) d = Math.min(d, Math.hypot(k[0] - m[0], k[1] - m[1])); }
      const score = d - len * 0.6;
      if (score < best) { best = score; mid = m; length = len; along = Math.atan2(q[0] - a[0], q[1] - a[1]); }
    });
    return { mid, length, along, yaw: Math.atan2(mid[0] - cx, mid[1] - cz), cx, cz };
  };
  /** Distance libre jusqu'au bord de la chaussée la plus proche. */
  const roadGap = (q: Pt) => {
    let gap = Infinity;
    for (const r of data.roads) r.p.forEach((a, i) => {
      const b = r.p[i + 1];
      if (!b) return;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      gap = Math.min(gap, Math.hypot(a[0] + dx * t - q[0], a[1] + dz * t - q[1]) - r.w / 2);
    });
    return gap;
  };
  const sign = (b: ReturnType<typeof front>, text: string, opts: { bg: string; fg: string; w: number; h: number; y: number; font?: string; off?: number; side?: number; vertical?: boolean }) => {
    const c = document.createElement('canvas');
    c.width = opts.vertical ? 128 : 512;
    c.height = opts.vertical ? 512 : Math.max(48, Math.round((512 * opts.h) / opts.w));
    const g = c.getContext('2d')!;
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = opts.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (opts.vertical) {
      g.font = `800 ${Math.floor(480 / text.length)}px sans-serif`;
      [...text].forEach((ch, i) => g.fillText(ch, 64, (i + 0.5) * (512 / text.length)));
    } else {
      g.font = opts.font ?? `700 ${Math.round(c.height * 0.62)}px sans-serif`;
      g.fillText(text, 256, c.height / 2, 490);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(opts.w, opts.h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 }));
    mats.push(m.material as THREE.MeshStandardMaterial);
    const off = opts.off ?? 0.35, side = opts.side ?? 0;
    m.position.set(b.mid[0] + Math.sin(b.yaw) * off + Math.cos(b.yaw) * side, opts.y, b.mid[1] + Math.cos(b.yaw) * off - Math.sin(b.yaw) * side);
    m.rotation.y = b.yaw;
    scene.add(m);
  };

  const FACADES: Record<string, () => THREE.MeshStandardMaterial> = {
    // Carrelage beige, bandes de fenêtres bleues, soubassement rouge.
    sunu: () => facade((p, w) => {
      p('#dcc6a8', 0, 0, 128, 256);
      for (const y of [18, 74, 130]) { p('#f0e6d2', 0, y - 8, 128, 8); w('#3b6f9e', 0, y, 128, 26); p('#e8e2d2', 0, y, 3, 26); p('#e8e2d2', 42, y, 3, 26); p('#e8e2d2', 86, y, 3, 26); }
      p('#b03a2c', 0, 180, 128, 8);
      w('#23262a', 10, 190, 108, 66);
      p('#c9b394', 0, 188, 10, 68);
    }),
    // Sept niveaux blancs, chaque étage souligné d'un bandeau bleu ajouré.
    ahodikpe: () => facade((p, w) => {
      p('#f3f3ef', 0, 0, 128, 256);
      for (let i = 0; i < 7; i++) {
        const y = i * 36;
        w('#39414a', 40, y + 4, 44, 16);
        p('#233f9e', 0, y + 22, 128, 11);
        for (let x = 4; x < 128; x += 16) p('#8fb0e8', x, y + 25, 6, 5);
      }
    }),
    // Tôle grise nervurée, vitrine en rez-de-chaussée.
    champion: () => facade((p, w) => {
      p('#b9bcbf', 0, 0, 128, 256);
      for (let y = 0; y < 120; y += 8) p('#9ea2a6', 0, y, 128, 2);
      p('#c9c4b6', 0, 120, 128, 12);
      w('#2b3a44', 10, 140, 108, 100);
      p('#d8d8d2', 60, 140, 6, 100);
    }),
    // Mur bas rouge, claustras claires au-dessus.
    metro: () => facade((p, w) => {
      p('#c4262a', 0, 110, 128, 146);
      p('#e8e4da', 0, 0, 128, 110);
      for (let x = 6; x < 128; x += 20) for (let y = 12; y < 100; y += 22) w('#4a4f55', x, y, 12, 14);
      p('#8f1c20', 62, 110, 4, 146);
    }),
    fifty: () => facade((p, w) => {
      p('#cf2430', 0, 0, 128, 256);
      p('#f0efe8', 0, 30, 128, 6);
      w('#7e1a22', 14, 90, 46, 150);
      p('#3f6d78', 80, 90, 34, 166);
    }),
    // Mur rose, pilastres rouges, fenêtres en losange.
    folyana: () => facade((p, w) => {
      p('#efd9cd', 0, 0, 128, 256);
      p('#b8282a', 0, 0, 12, 256);
      p('#b8282a', 0, 232, 128, 24);
      for (let i = -26; i <= 26; i++) { const half = 26 - Math.abs(i); w('#6f7f88', 70 - half, 110 + i, half * 2, 1); }
    }),
    cofina: () => facade((p, w) => {
      p('#d3322c', 0, 0, 128, 256);
      p('#f2f0ea', 0, 196, 128, 60);
      for (let x = 6; x < 128; x += 14) p('#d3322c', x, 206, 5, 40);
      w('#2a2f35', 42, 60, 44, 136);
    }),
    // Deux niveaux beiges à grandes baies grillagées.
    gozem: () => facade((p, w) => {
      p('#d6c29c', 0, 0, 128, 256);
      for (const y of [20, 146]) { w('#59666e', 10, y, 108, 92); for (let x = 10; x < 118; x += 18) p('#e6e3da', x, y, 3, 92); p('#e6e3da', 10, y + 44, 108, 3); }
    }),
    // Lames grises horizontales de la tour ronde d'UTB.
    utbTower: () => facade((p, w) => {
      p('#8f9392', 0, 0, 128, 256);
      for (let y = 0; y < 256; y += 24) { w('#3a4247', 0, y + 3, 128, 13); p('#c6c8c5', 0, y + 16, 128, 8); }
      for (const x of [0, 44, 88]) p('#70757a', x, 0, 5, 256);
    }),
    // Socle bas : murs gris, grandes baies, bandeau bleu en tête.
    utbBase: () => facade((p, w) => {
      p('#a6a8a6', 0, 0, 128, 256);
      p('#1f4f9a', 0, 0, 128, 52);
      w('#23303d', 12, 84, 104, 150);
      p('#a6a8a6', 62, 84, 5, 150);
    }),
    // Mur jaune du fond de la galerie : panneaux de timbres et portes sombres.
    poste: () => facade((p, w) => {
      p('#efb82c', 0, 0, 128, 256);
      p('#7d8b96', 10, 40, 50, 170);
      const stamps = ['#d8d2c2', '#c9a13a', '#9fb4c4', '#e6e0d0', '#b0614a'];
      for (let x = 12; x < 58; x += 6) for (let y = 43; y < 206; y += 9) p(stamps[(x * 7 + y) % 5]!, x, y, 4, 6);
      w('#34393c', 74, 50, 40, 206);
    }),
    // Étage beige au-dessus du bandeau bleu de la galerie.
    posteUpper: () => facade((p, w) => {
      p('#e8d6a8', 0, 0, 128, 256);
      w('#52503f', 34, 30, 60, 70);
      p('#1f4fb8', 0, 156, 128, 100);
    }),
    // Mur-rideau bleuté, allèges vertes à chaque étage, montants blancs.
    orabank: () => facade((p, w) => {
      p('#f2f4f4', 0, 0, 128, 256);
      for (let y = 0; y < 256; y += 32) { w('#5d8fc0', 8, y + 4, 112, 22); p('#12907e', 8, y + 26, 112, 4); }
      for (const x of [8, 45, 82, 119]) p('#e3e9ec', x - 1, 0, 3, 256);
    }),
    // Pavillon d'accueil : panneaux blancs et grand vitrage quadrillé.
    orabankBase: () => facade((p, w) => {
      p('#f4f5f3', 0, 0, 128, 256);
      w('#3d4a52', 6, 64, 116, 192);
      for (const x of [6, 35, 64, 93, 119]) p('#e8ebea', x, 64, 3, 192);
      p('#e8ebea', 6, 150, 116, 3);
    }),
    // Bandeaux de béton gris et baies sombres.
    postes: () => facade((p, w) => {
      p('#a3a5a2', 0, 0, 128, 256);
      for (let y = 0; y < 256; y += 42) w('#242a30', 0, y + 24, 128, 18);
    }),
    // Couronne d'ailettes de béton, au sommet de la tour grise.
    postesCrown: () => facade((p, w) => {
      p('#2b3136', 0, 0, 128, 256);
      for (const x of [0, 32, 64, 96]) p('#bdbfb9', x, 0, 22, 256);
      void w;
    }),
    // Remises à arcades : bas de mur blanc, grandes portes pour les engins.
    pompiers: () => facade((p, w) => {
      p('#e6e2d6', 0, 0, 128, 256);
      w('#2e2b28', 16, 80, 96, 176);
      p('#b8392c', 26, 170, 76, 80);
    }),
    // Verre bleu tramé et montants blancs de la tour, d'après photographie.
    bsic: () => facade((p, w) => {
      p('#f4f6f8', 0, 0, 128, 256);
      w('#1f5fae', 18, 12, 92, 232);
      for (let y = 12; y < 244; y += 17) p('#d7e2ee', 18, y, 92, 2);
      p('#d7e2ee', 62, 12, 4, 232);
    }),
    bsicBase: () => facade((p, w) => {
      p('#f4f6f8', 0, 0, 128, 256);
      for (let i = 0; i <= 54; i++) { const half = Math.round(30 * Math.sqrt(1 - ((54 - i) / 54) ** 2)); w('#1f5fae', 64 - half, 70 + i, half * 2, 1); }
      w('#1f5fae', 34, 124, 60, 132);
    }),
  };
  const white = std(0xf1f0ea, 0.7);

  for (const b of data.buildings) {
    if (!b.sig) continue;
    const f = front(b);
    const mat = FACADES[b.sig]?.();
    if (!mat) continue;
    const u = b.sig === 'sunu' ? 12 : 6;
    if (b.sig === 'utbTower') {
      add(walls(b.p, 6, b.h, 8), mat);
      add(walls(grow(b.p, 0.9), b.h, b.h + 1.6, 40), std(0x1f4f9a, 0.5));
      add(roof(grow(b.p, 0.9), b.h + 1.6), std(0x70757a));
      sign({ ...f, mid: f.mid }, 'UTB', { bg: '#1f4f9a', fg: '#ffffff', w: 7, h: 1.4, y: b.h + 0.8, off: 1.2 });
      continue;
    }
    if (b.sig === 'postes') {
      // Tour grise sur grand socle : étages décalés et couronne d'ailettes, vus sur la photographie.
      add(walls(b.p, 0, 7, 6), FACADES.utbBase!());
      add(roof(b.p, 7), std(0x8d8f8b));
      const shaft = grow(b.p, -20), top = grow(b.p, -17);
      add(walls(shaft, 7, 23, 8), mat);
      add(roof(top, 23), std(0x8d8f8b));
      add(walls(top, 23, b.h, 6), FACADES.postesCrown!());
      add(roof(top, b.h), std(0x8d8f8b));
      add(new THREE.CylinderGeometry(0.25, 0.7, 7, 4).translate(f.cx, b.h + 3.5, f.cz), std(0xb07a4a, 0.6));
      continue;
    }
    if (b.sig === 'pompiers') {
      add(walls(b.p, 0, b.h, 9), mat);
      add(roof(grow(b.p, 1.2), b.h + 0.1), std(0xdedbd2));
      // Portique sur la rue, tours de manœuvre et murs d'enceinte, côté façade.
      let road: Pt = f.mid, gap = Infinity;
      for (const r of data.roads) { if (r.c === 'service') continue; for (const k of r.p) { const d = Math.hypot(k[0] - f.mid[0], k[1] - f.mid[1]); if (d < gap) { gap = d; road = k; } } }
      const yaw = Math.atan2(road[0] - f.mid[0], road[1] - f.mid[1]);
      const dist = Math.max(6, Math.min(gap - 6, 34));
      const gx = f.mid[0] + Math.sin(yaw) * dist, gz = f.mid[1] + Math.cos(yaw) * dist;
      const gate = new THREE.Group();
      const flagColor = [0xf2c318, 0x1e7a3c, 0xc8261c, 0xf2c318, 0x1e7a3c, 0xc8261c];
      for (const side of [-6, 6]) flagColor.forEach((c, i) => gate.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(side, 0.5 + i, 0), std(c, 0.7))));
      gate.add(new THREE.Mesh(new THREE.BoxGeometry(13, 0.45, 0.45).translate(0, 6.2, 0), std(0x17181a, 0.6)));
      const c = document.createElement('canvas');
      c.width = 512; c.height = 96;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f0ede2'; g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#b0241c'; g.font = '800 34px sans-serif'; g.textAlign = 'center';
      g.fillText('CORPS DES SAPEURS-POMPIERS', 256, 38, 490);
      g.fillStyle = '#17181a'; g.font = '700 25px sans-serif';
      g.fillText('CENTRE DE SECOURS PRINCIPAL DE LOMÉ', 256, 76, 490);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      textures.push(t);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
      banner.position.set(0, 5.4, 0.3);
      gate.add(banner);
      const wallTex = (() => {
        const m = document.createElement('canvas');
        m.width = 512; m.height = 128;
        const d = m.getContext('2d')!;
        d.fillStyle = '#f2efe6'; d.fillRect(0, 0, 512, 128);
        d.fillStyle = '#c8261c'; d.fillRect(0, 112, 512, 16);
        d.fillStyle = '#1f3f7a'; d.font = '800 32px sans-serif'; d.textAlign = 'center';
        d.fillText('SAPEURS-POMPIERS', 256, 50);
        d.font = 'italic 26px serif'; d.fillText('La passion de sauver', 256, 90);
        const x = new THREE.CanvasTexture(m);
        x.colorSpace = THREE.SRGBColorSpace;
        textures.push(x);
        return x;
      })();
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 0.4).translate(side * 17, 1.5, 0), side > 0 ? [std(0xe4e0d4), std(0xe4e0d4), std(0xe4e0d4), std(0xe4e0d4), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), std(0xb9b6ad)] : std(0xb9b6ad));
        gate.add(panel);
      }
      gate.position.set(gx, 0.09, gz);
      gate.rotation.y = yaw;
      gate.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = !low; });
      scene.add(gate);
      const tx = f.mid[0] + Math.cos(yaw) * 26 + Math.sin(yaw) * (dist - 2);
      const tz = f.mid[1] - Math.sin(yaw) * 26 + Math.cos(yaw) * (dist - 2);
      add(new THREE.BoxGeometry(3.4, 18, 3.4).translate(tx, 9, tz), std(0xa78b6c, 0.95));
      add(new THREE.BoxGeometry(5, 1.4, 5).translate(tx, 18.5, tz), std(0x8f7a60, 0.95));
      continue;
    }
    if (b.sig === 'poste') {
      // Galerie sous l'étage, d'après la vidéo : mur du fond en retrait, piliers jaunes carrés sur l'alignement, plafond.
      const arcade = 4.4, back = grow(b.p, -2.6), yellow = std(0xefb82c, 0.9);
      add(walls(back, 0, arcade, 6), mat);
      add(walls(b.p, arcade, b.h, 6), FACADES.posteUpper!());
      add(slabWithHole(b.p, back, arcade), yellow);
      add(roof(grow(b.p, 0.5), b.h + 0.1), std(0xc2a36e));
      b.p.forEach((a, i) => {
        const q = b.p[(i + 1) % b.p.length]!;
        const n = Math.max(1, Math.round(Math.hypot(q[0] - a[0], q[1] - a[1]) / 4.2));
        const yaw = Math.atan2(q[0] - a[0], q[1] - a[1]);
        for (let k = 0; k < n; k++) add(new THREE.BoxGeometry(0.7, arcade, 0.7).rotateY(yaw).translate(a[0] + ((q[0] - a[0]) * k) / n, arcade / 2, a[1] + ((q[1] - a[1]) * k) / n), yellow);
      });
      sign(f, 'LA POSTE', { bg: '#1f4fb8', fg: '#f4f1e6', w: 5, h: 1, y: arcade + 0.6, off: 0.05 });
      continue;
    }
    if (b.sig === 'bsic') {
      // Socle à arcades, puis deux volumes de verre décalés sous des cadres blancs.
      add(walls(grow(b.p, 2), 0, 7, 7), FACADES.bsicBase!());
      add(roof(grow(b.p, 2), 7), white);
      add(walls(b.p, 7, 30, 6), mat);
      add(roof(b.p, 30), white);
      const upper = grow(b.p, -2.2);
      add(walls(upper, 30, 39, 6), mat);
      add(roof(upper, 39), white);
      add(walls(grow(upper, 0.5), 39, 40, 40), white);
      add(roof(grow(upper, 0.5), 40), white);
      add(new THREE.CylinderGeometry(0.1, 0.25, 9, 5).translate(f.cx, 44.5, f.cz), std(0xcc3a30));
      // Le nom court sur le socle, côté boulevard du 13 Janvier.
      sign({ ...f, mid: [f.mid[0] + Math.sin(f.yaw) * 2, f.mid[1] + Math.cos(f.yaw) * 2] }, 'BSIC-TOGO', { bg: '#f4f6f8', fg: '#1b4f9c', w: 9, h: 1.3, y: 6, off: 0.5 });
      sign(f, 'BSIC', { bg: '#ffffff', fg: '#1b4f9c', w: 5, h: 5, y: 26, off: 0.6 });
      continue;
    }
    add(walls(b.p, 0, b.h, u), mat);
    if (b.sig === 'sunu') {
      add(roof(grow(b.p, 1.4), b.h + 0.25), std(0x8f8578));
      add(walls(grow(b.p, 1.4), b.h - 0.2, b.h + 0.25, 40), std(0xb03a2c));
      // Tour d'escalier au bout de la façade, portant le nom en lettres rouges.
      const tx = f.mid[0] + Math.cos(f.along) * 0 + Math.sin(f.along) * f.length * 0.5 - Math.sin(f.yaw) * 1.5;
      const tz = f.mid[1] + Math.cos(f.along) * f.length * 0.5 - Math.cos(f.yaw) * 1.5;
      const tower = new THREE.BoxGeometry(7, b.h + 7, 7).rotateY(f.yaw).translate(tx, (b.h + 7) / 2, tz);
      add(tower, std(0xdab9a4));
      const nameBack = { ...f, mid: [tx + Math.sin(f.yaw) * 3.5, tz + Math.cos(f.yaw) * 3.5] as Pt };
      sign(nameBack, 'SUNU', { bg: '#dab9a4', fg: '#b3202a', w: 4.5, h: 15, y: (b.h + 7) * 0.58, vertical: true });
      sign(f, 'SUNU Assurances', { bg: '#f0e6d2', fg: '#b3202a', w: 11, h: 1.5, y: b.h - 1.6, off: 0.9 });
    } else if (b.sig === 'ahodikpe') {
      add(roof(b.p, b.h), white);
      const top = grow(b.p, -2.8);
      add(walls(top, b.h, b.h + 3.2, 6), FACADES.ahodikpe!());
      add(roof(grow(top, 0.6), b.h + 3.3), white);
      sign(f, 'Hotel Ahodikpe', { bg: '#1c3a94', fg: '#f2d060', w: 10, h: 2.3, y: 6.5, font: 'italic 700 64px serif' });
    } else if (b.sig === 'champion') {
      add(roof(b.p, b.h), std(0x8f9296));
      sign(f, 'Le Champion', { bg: '#c81e2a', fg: '#ffffff', w: 9, h: 2.2, y: b.h + 0.4, font: 'italic 800 64px sans-serif' });
    } else if (b.sig === 'metro') {
      add(roof(grow(b.p, 1.1), b.h + 0.1), std(0x8a8d8e));
      sign(f, 'BIG METRO', { bg: '#efe4d4', fg: '#2b3a7a', w: 6, h: 1.4, y: b.h - 0.7, off: 1.3 });
    } else if (b.sig === 'fifty') {
      add(roof(grow(b.p, 0.9), b.h + 0.1), std(0x9a9d9e));
      sign(f, 'FIFTY-FIFTY', { bg: '#f7f5ef', fg: '#c81e2a', w: 5, h: 1.2, y: b.h - 0.8, off: 1.1 });
    } else if (b.sig === 'folyana') {
      add(roof(grow(b.p, 0.8), b.h + 0.2), std(0xc98b5a));
      sign(f, 'HOTEL FOLYANA', { bg: '#f4efe6', fg: '#b3202a', w: 5.5, h: 1, y: b.h + 0.9, off: 0.9 });
    } else if (b.sig === 'cofina') {
      add(roof(b.p, b.h), std(0xd9d6cf));
      sign(f, 'cofina', { bg: '#ffffff', fg: '#d3322c', w: 1.4, h: 6.4, y: 3.3, off: 4, side: f.length * 0.25, vertical: true });
    } else if (b.sig === 'utbBase') {
      add(roof(b.p, b.h), std(0x8d8f8b));
      sign(f, 'UTB', { bg: '#1f4f9a', fg: '#ffffff', w: 6, h: 1, y: b.h - 0.6, off: 0.3 });
    } else if (b.sig === 'orabank') {
      add(roof(b.p, b.h), std(0xbfc2c0));
      // Deux lames blanches dépassent du toit aux bouts de la façade ; l'une porte le nom à la verticale.
      const blade = std(0xf2f4f4, 0.7);
      for (const end of [-1, 1]) {
        const s = end * (f.length / 2 - 3);
        const bx = f.mid[0] + Math.sin(f.along) * s + Math.sin(f.yaw) * 0.6, bz = f.mid[1] + Math.cos(f.along) * s + Math.cos(f.yaw) * 0.6;
        add(new THREE.BoxGeometry(5, b.h + 5, 4).rotateY(f.yaw).translate(bx, (b.h + 5) / 2, bz), blade);
        if (end > 0) sign({ ...f, mid: [bx + Math.sin(f.yaw) * 2, bz + Math.cos(f.yaw) * 2] }, 'Orabank', { bg: '#f2f4f4', fg: '#12907e', w: 1.6, h: 12, y: b.h - 4, off: 0.03, vertical: true });
      }
      sign(f, 'Orabank', { bg: '#ffffff', fg: '#12907e', w: 8, h: 1.5, y: b.h - 1.6, off: 0.4 });
      // Pavillon bas d'un niveau devant le siège, avec son entrée verte.
      const depth = Math.min(9, roadGap(f.mid) - 7);
      if (depth >= 4) {
        const half = Math.min(f.length * 0.3, 11);
        const ax = Math.sin(f.along), az = Math.cos(f.along), nx = Math.sin(f.yaw), nz = Math.cos(f.yaw);
        const ring: Pt[] = [[-half, 0.3], [half, 0.3], [half, depth], [-half, depth]].map(([s, d]) => [f.mid[0] + ax * s! + nx * d!, f.mid[1] + az * s! + nz * d!] as Pt);
        add(walls(ring, 0, 4.2, 4), FACADES.orabankBase!());
        add(roof(ring, 4.2), white);
        add(new THREE.BoxGeometry(2.6, 4.8, depth + 0.4).rotateY(f.yaw).translate(f.mid[0] + ax * (half + 1.3) + nx * (depth / 2 + 0.3), 2.4, f.mid[1] + az * (half + 1.3) + nz * (depth / 2 + 0.3)), std(0x0f6b48, 0.6));
      }
    } else if (b.sig === 'gozem') {
      add(roof(b.p, b.h), std(0xbdb6a6));
      sign(f, 'GOZEM', { bg: '#0f8f5a', fg: '#ffffff', w: 13, h: 1.5, y: b.h * 0.47 });
      sign(f, 'GOZEM', { bg: '#d6c29c', fg: '#0f8f5a', w: 8, h: 1.6, y: b.h + 0.9 });
    }
  }

  // Place FAO : colonne de béton gris fendue sur toute sa hauteur, sur son socle, d'après la vidéo. Hauteur estimée.
  const fao = data.places.find((p) => p.n === 'Place FAO');
  if (fao) {
    const concrete = std(0x9c9c97, 0.95);
    add(new THREE.BoxGeometry(5, 1.2, 5).translate(fao.x, 0.6, fao.z), std(0xb7b3aa, 0.95));
    add(new THREE.BoxGeometry(3.4, 2.4, 3.4).translate(fao.x, 2.4, fao.z), concrete);
    for (const side of [-0.7, 0.7]) add(new THREE.BoxGeometry(1, 25, 2.4).translate(fao.x + side, 16.1, fao.z), concrete);
    add(new THREE.BoxGeometry(0.5, 25, 1.6).translate(fao.x, 16.1, fao.z), std(0x55585a, 0.95));
    add(new THREE.BoxGeometry(2.1, 1.8, 2.1).translate(fao.x, 29.5, fao.z), std(0x45484a, 0.9));
    add(new THREE.BoxGeometry(2.8, 0.6, 2.8).translate(fao.x, 28.9, fao.z), concrete);
    add(new THREE.BoxGeometry(2.8, 0.6, 2.8).translate(fao.x, 30.7, fao.z), concrete);
  }

  return {
    night(on: boolean) { for (const m of mats) m.emissiveIntensity = on ? 0.6 : 0; },
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
