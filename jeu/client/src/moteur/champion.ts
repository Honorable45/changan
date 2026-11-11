import * as THREE from 'three';
import { box } from './kit';
import type { Pt, Room, Spot } from './sim';

/**
 * Supermarché Le Champion : intérieur imaginé pour le jeu (rayons, frigos, étals, caisses), où Honorable fait ses courses.
 * Produits génériques, sans marque. Prix indicatifs en francs CFA : relevés en ligne quand une source existe
 * (supermarchés en ligne du Cameroun et de Côte d'Ivoire, faute de prix publiés à Lomé), sinon estimés.
 */
export type Product = { id: string; name: string; price: number; color: number; shape: 'box' | 'bag' | 'bottle' | 'can' | 'fruit'; source: 'relevé' | 'estimé' };
export const PRODUCTS: Product[] = [
  { id: 'riz', name: 'Riz parfumé 5 kg', price: 4500, color: 0xf3efe6, shape: 'bag', source: 'relevé' },
  { id: 'spaghetti', name: 'Spaghetti 500 g', price: 600, color: 0x2f5fb3, shape: 'box', source: 'relevé' },
  { id: 'huile', name: 'Huile végétale 1 L', price: 1100, color: 0xf2c94c, shape: 'bottle', source: 'relevé' },
  { id: 'lait', name: 'Lait en poudre 400 g', price: 3200, color: 0xf4f4f0, shape: 'can', source: 'relevé' },
  { id: 'sucre', name: 'Sucre en morceaux 1 kg', price: 900, color: 0xe8edf5, shape: 'box', source: 'estimé' },
  { id: 'tomate', name: 'Concentré de tomate 70 g', price: 150, color: 0xc8221a, shape: 'can', source: 'estimé' },
  { id: 'farine', name: 'Farine de maïs 1 kg', price: 500, color: 0xf0d27a, shape: 'bag', source: 'estimé' },
  { id: 'gari', name: 'Gari 1 kg', price: 600, color: 0xefe6cf, shape: 'bag', source: 'estimé' },
  { id: 'sardines', name: 'Sardines à l’huile 125 g', price: 500, color: 0x3d7fc4, shape: 'can', source: 'estimé' },
  { id: 'cafe', name: 'Café soluble 50 g', price: 1500, color: 0x5a3220, shape: 'can', source: 'estimé' },
  { id: 'biscuits', name: 'Biscuits 200 g', price: 300, color: 0xe08a2c, shape: 'box', source: 'estimé' },
  { id: 'pain', name: 'Pain de mie', price: 1000, color: 0xd9a35a, shape: 'bag', source: 'estimé' },
  { id: 'savon', name: 'Savon de toilette', price: 300, color: 0x6fc3a8, shape: 'box', source: 'estimé' },
  { id: 'lessive', name: 'Lessive en poudre 500 g', price: 1000, color: 0x2d9cdb, shape: 'box', source: 'estimé' },
  { id: 'papier', name: 'Papier toilette × 4', price: 1200, color: 0xfafafa, shape: 'bag', source: 'estimé' },
  { id: 'dentifrice', name: 'Dentifrice 75 ml', price: 800, color: 0xe23b3b, shape: 'box', source: 'estimé' },
  { id: 'eau', name: 'Eau minérale 1,5 L', price: 400, color: 0x8fd0f0, shape: 'bottle', source: 'estimé' },
  { id: 'jus', name: 'Jus d’ananas 1 L', price: 1200, color: 0xf6c12d, shape: 'box', source: 'estimé' },
  { id: 'soda', name: 'Soda 33 cl', price: 400, color: 0xd7262e, shape: 'can', source: 'estimé' },
  { id: 'yaourt', name: 'Yaourt nature', price: 500, color: 0xf5f5f5, shape: 'can', source: 'estimé' },
  { id: 'fromage', name: 'Fromage en portions', price: 1500, color: 0xe8312f, shape: 'can', source: 'estimé' },
  { id: 'poulet', name: 'Cuisses de poulet 1 kg', price: 2500, color: 0xf0c7a8, shape: 'box', source: 'estimé' },
  { id: 'bananes', name: 'Bananes (le kg)', price: 500, color: 0xf2d43a, shape: 'fruit', source: 'estimé' },
  { id: 'ananas', name: 'Ananas (la pièce)', price: 700, color: 0xd99a2b, shape: 'fruit', source: 'estimé' },
  { id: 'tomates', name: 'Tomates (le kg)', price: 800, color: 0xd8321f, shape: 'fruit', source: 'estimé' },
  { id: 'oignons', name: 'Oignons (le kg)', price: 600, color: 0xb0603a, shape: 'fruit', source: 'estimé' },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
export const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

const ORIGIN: Pt = [9600, 9000];
const W = 30, D = 24, H = 4.6;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildChampion(scene: THREE.Scene, low: boolean) {
  const [ox, oz] = ORIGIN;
  const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz - D / 2, z1 = oz + D / 2;
  const group = new THREE.Group();
  scene.add(group);
  const solids: Pt[][] = [];
  const spots: Spot[] = [];
  const textures: THREE.Texture[] = [];
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, envMapIntensity: 0.35, ...extra });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = false) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow && !low; mesh.receiveShadow = !low; group.add(mesh); return mesh; };
  /** Bloc posé au sol en coordonnées locales (origine au centre du magasin), avec son emprise. */
  const block = (w: number, h: number, d: number, x: number, z: number, m: THREE.Material, y = h / 2, solid = true) => {
    add(box(w, h, d, ox + x, y, oz + z), m, true);
    if (solid) solids.push([[ox + x - w / 2, oz + z - d / 2], [ox + x + w / 2, oz + z - d / 2], [ox + x + w / 2, oz + z + d / 2], [ox + x - w / 2, oz + z + d / 2]]);
  };
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const t = canvasTexture(w, h, draw); textures.push(t); return t; };
  const label = (text: string, sub: string, w: number, h: number, colors = { bg: '#ffffff', fg: '#16181c', accent: '#c81e2a' }) => tex(512, Math.round(512 * h / w), (g) => {
    const H2 = g.canvas.height;
    g.fillStyle = colors.bg; g.fillRect(0, 0, 512, H2);
    g.fillStyle = colors.accent; g.fillRect(0, 0, 14, H2);
    g.fillStyle = colors.fg; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(H2 * 0.36)}px sans-serif`; g.fillText(text, 30, H2 * (sub ? 0.34 : 0.5), 470);
    if (sub) { g.fillStyle = colors.accent; g.font = `800 ${Math.round(H2 * 0.4)}px sans-serif`; g.fillText(sub, 30, H2 * 0.74, 470); }
  });

  /* Sol carrelé, murs, plafond lumineux */
  const floor = tex(256, 256, (g) => { g.fillStyle = '#eceae4'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d4d1c8'; for (let i = 0; i <= 256; i += 128) { g.fillRect(i, 0, 3, 256); g.fillRect(0, i, 256, 3); } });
  floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
  floor.repeat.set(W / 1.2, D / 1.2);
  add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(ox, 0.01, oz), std(0xffffff, { map: floor, roughness: 0.35 }));
  add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(ox, H, oz), std(0xf4f4f2, { side: THREE.DoubleSide }));
  const wall = std(0xf3f1ec, { side: THREE.DoubleSide });
  for (const [w, x, z, rot] of [[W, ox, z0, 0], [W, ox, z1, Math.PI], [D, x0, oz, Math.PI / 2], [D, x1, oz, -Math.PI / 2]] as const) {
    add(new THREE.PlaneGeometry(w, H).rotateY(rot).translate(x, H / 2, z), wall);
    // Plinthe et bandeau rouges, aux couleurs de l'enseigne.
    add(new THREE.BoxGeometry(w, 0.5, 0.04).rotateY(rot).translate(x + Math.sin(rot) * 0.03, 3.6, z + Math.cos(rot) * 0.03), std(0xc81e2a));
    add(new THREE.BoxGeometry(w, 0.14, 0.04).rotateY(rot).translate(x + Math.sin(rot) * 0.03, 0.07, z + Math.cos(rot) * 0.03), std(0x8f1a20));
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let x = -12; x <= 12; x += 6) for (let z = -9; z <= 9; z += 4.5) add(box(3.6, 0.04, 0.3, ox + x, H - 0.03, oz + z), glow);
  const light = new THREE.PointLight(0xffffff, 30, 0, 1.2);
  light.position.set(ox, H - 0.5, oz);
  group.add(light);
  if (!low) { const back = new THREE.PointLight(0xfff6e8, 16, 0, 1.4); back.position.set(ox, H - 0.6, oz + 7); group.add(back); }

  /* Entrée vitrée et enseigne */
  const daylight = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false });
  add(new THREE.PlaneGeometry(4.2, 2.6).translate(ox, 1.3, z0 + 0.02), daylight);
  for (const x of [-2.2, 2.2]) add(box(0.14, 2.8, 0.14, ox + x, 1.4, z0 + 0.06), std(0x2b2e33, { metalness: 0.6, roughness: 0.35 }));
  add(new THREE.PlaneGeometry(9, 1.6).rotateY(Math.PI).translate(ox, 2.9, z1 - 0.02), new THREE.MeshBasicMaterial({ map: tex(1024, 180, (g) => {
    g.fillStyle = '#c81e2a'; g.fillRect(0, 0, 1024, 180);
    g.fillStyle = '#fff'; g.font = 'italic 800 110px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Le Champion', 512, 92);
  }), side: THREE.DoubleSide }));
  const notice = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: tex(512, 216, (g) => {
    g.fillStyle = '#16181c'; g.fillRect(0, 0, 512, 216);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 40px sans-serif'; g.fillText('Bienvenue', 256, 60);
    g.font = '24px sans-serif'; g.fillStyle = '#d8dade';
    g.fillText('Prix indicatifs du jeu, en francs CFA.', 256, 112); g.fillText('Prenez vos articles, puis passez en caisse.', 256, 150); g.fillText('Intérieur imaginé.', 256, 188);
  }) }));
  notice.position.set(ox + 4.6, 1.9, z0 + 0.03);
  group.add(notice);

  /* Produits : instances colorées, une forme par type d'emballage */
  const shapes = {
    box: new THREE.BoxGeometry(0.22, 0.3, 0.16).translate(0, 0.15, 0),
    bag: new THREE.BoxGeometry(0.34, 0.2, 0.26).translate(0, 0.1, 0),
    bottle: new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8).translate(0, 0.15, 0),
    can: new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10).translate(0, 0.07, 0),
    fruit: new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.08, 0),
  };
  const items: Record<Product['shape'], { m: THREE.Matrix4; c: THREE.Color }[]> = { box: [], bag: [], bottle: [], can: [], fruit: [] };
  const m4 = new THREE.Object3D();
  const tint = new THREE.Color();
  const put = (p: Product, x: number, y: number, z: number, k: number) => {
    m4.position.set(ox + x, y, oz + z);
    m4.rotation.set(0, (k % 3) * 0.08, 0);
    m4.updateMatrix();
    // Les couleurs varient un peu d'un paquet à l'autre.
    tint.setHex(p.color).multiplyScalar(0.9 + ((k * 7) % 5) * 0.03);
    items[p.shape].push({ m: m4.matrix.clone(), c: tint.clone() });
  };
  const step: Record<Product['shape'], number> = { box: 0.26, bag: 0.38, bottle: 0.14, can: 0.14, fruit: 0.2 };

  /** Une section de rayon : plusieurs étagères remplies du même produit, une étiquette de prix, un point de prise. */
  const shelfSection = (p: Product, cx: number, z: number, len: number, face: 1 | -1, depth: number, levels: number[]) => {
    for (const y of levels) {
      const n = Math.floor((len - 0.2) / step[p.shape]);
      for (let i = 0; i < n; i++) {
        const along = z - len / 2 + 0.1 + (i + 0.5) * ((len - 0.2) / n);
        for (const d of [0.2, 0.46]) if (d < depth) put(p, cx + face * d, y + 0.02, along, i + levels.indexOf(y));
      }
    }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.36), new THREE.MeshBasicMaterial({ map: label(p.name, fcfa(p.price), 1.6, 0.36) }));
    tag.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    tag.position.set(ox + cx + face * (depth + 0.02), 1.42, oz + z);
    group.add(tag);
    spots.push({ x: ox + cx + face * (depth + 0.9), z: oz + z, r: 1.3, id: `p:${p.id}`, label: `Prendre : ${p.name} · ${fcfa(p.price)}` });
  };

  /* Gondoles : quatre îlots, deux faces, deux produits par face */
  const metal = std(0xe4e5e7, { metalness: 0.3, roughness: 0.4 });
  const shelfMat = std(0xd5d7da, { metalness: 0.4, roughness: 0.35 });
  const LEVELS = [0.12, 0.62, 1.12, 1.62];
  const aisleCats = [
    ['Épicerie', ['riz', 'spaghetti', 'huile', 'farine']],
    ['Petit-déjeuner', ['lait', 'sucre', 'cafe', 'biscuits']],
    ['Conserves et pain', ['tomate', 'sardines', 'gari', 'pain']],
    ['Hygiène et entretien', ['savon', 'dentifrice', 'lessive', 'papier']],
  ] as const;
  const GZ = 1.25, GL = 12.5;
  aisleCats.forEach(([cat, ids], i) => {
    const cx = -10.5 + i * 7;
    // Dos central mince ; les étagères débordent de chaque côté et portent les produits.
    add(box(0.1, 2.0, GL, ox + cx, 1.0, oz + GZ), metal, true);
    add(box(1.3, 0.12, GL, ox + cx, 0.06, oz + GZ), metal);
    solids.push([[ox + cx - 0.7, oz + GZ - GL / 2], [ox + cx + 0.7, oz + GZ - GL / 2], [ox + cx + 0.7, oz + GZ + GL / 2], [ox + cx - 0.7, oz + GZ + GL / 2]]);
    for (const y of LEVELS) add(box(1.3, 0.04, GL, ox + cx, y, oz + GZ), shelfMat);
    ids.forEach((id, k) => {
      const p = productById(id)!;
      const face = k < 2 ? -1 : 1;
      shelfSection(p, cx, GZ - GL / 4 + (k % 2) * (GL / 2), GL / 2 - 0.3, face as 1 | -1, 0.65, LEVELS);
    });
    // Panneau suspendu au-dessus de l'allée.
    // Deux faces dos à dos : le nom se lit des deux bouts de l'allée.
    const signMat = new THREE.MeshBasicMaterial({ map: label(cat, '', 2.8, 0.6, { bg: '#c81e2a', fg: '#ffffff', accent: '#8f1a20' }) });
    for (const rot of [0, Math.PI]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), signMat);
      sign.rotation.y = rot + Math.PI;
      sign.position.set(ox + cx, 3.3, oz + GZ - GL / 2 - 0.2 + (rot ? 0.01 : -0.01));
      group.add(sign);
    }
    add(box(0.02, 0.9, 0.02, ox + cx - 1, 3.95, oz + GZ - GL / 2 - 0.2), metal);
    add(box(0.02, 0.9, 0.02, ox + cx + 1, 3.95, oz + GZ - GL / 2 - 0.2), metal);
  });

  /* Frigos vitrés au fond : boissons, laitages, volaille */
  const fridgeIds = ['eau', 'jus', 'soda', 'yaourt', 'fromage', 'poulet'];
  const fridgeBody = std(0x2b2f36, { metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const fridgeGlow = new THREE.MeshBasicMaterial({ color: 0xeef7ff, fog: false });
  fridgeIds.forEach((id, i) => {
    const cx = -12.5 + i * 5, len = 4.6, fz = D / 2 - 0.5;
    block(len, 2.3, 0.95, cx, fz, fridgeBody, 1.15);
    add(box(len - 0.2, 0.03, 0.8, ox + cx, 2.2, oz + fz), fridgeGlow);
    const p = productById(id)!;
    for (const y of [0.3, 0.8, 1.3, 1.75]) {
      add(box(len - 0.2, 0.03, 0.8, ox + cx, y, oz + fz), shelfMat);
      const n = Math.floor((len - 0.4) / step[p.shape]);
      for (let k = 0; k < n; k++) put(p, cx - len / 2 + 0.2 + (k + 0.5) * ((len - 0.4) / n), y + 0.02, fz - 0.2, k);
    }
    add(new THREE.PlaneGeometry(len - 0.1, 2.0).translate(ox + cx, 1.15, oz + fz - 0.49), glass);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.36), new THREE.MeshBasicMaterial({ map: label(p.name, fcfa(p.price), 1.6, 0.36) }));
    tag.position.set(ox + cx, 2.45, oz + fz - 0.5);
    tag.rotation.y = Math.PI;
    group.add(tag);
    spots.push({ x: ox + cx, z: oz + fz - 1.4, r: 1.5, id: `p:${p.id}`, label: `Prendre : ${p.name} · ${fcfa(p.price)}` });
  });

  /* Étals de fruits et légumes, près de l'entrée */
  const crate = std(0x9a6a3c, { roughness: 0.9 });
  ['bananes', 'ananas', 'tomates', 'oignons'].forEach((id, i) => {
    const cx = 4.6 + i * 2.7, cz = -8.2;
    block(1.6, 0.8, 1.2, cx, cz, crate, 0.4);
    const p = productById(id)!;
    for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) put(p, cx - 0.62 + a * 0.25, 0.8 + ((a + b) % 2) * 0.05, cz - 0.42 + b * 0.28, a + b);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.32), new THREE.MeshBasicMaterial({ map: label(p.name, fcfa(p.price), 1.4, 0.32) }));
    tag.position.set(ox + cx, 0.55, oz + cz - 0.61);
    tag.rotation.y = Math.PI;
    group.add(tag);
    spots.push({ x: ox + cx, z: oz + cz - 1.5, r: 1.2, id: `p:${p.id}`, label: `Prendre : ${p.name} · ${fcfa(p.price)}` });
  });

  /* Caisses : tapis, terminal, écran ; une caissière derrière chacune */
  const counter = std(0x3a3e45, { roughness: 0.5 });
  const belt = std(0x111214, { roughness: 0.9 });
  const staff: { x: number; z: number; heading: number }[] = [];
  for (const cx of [-12, -8.6, -5.2]) {
    const cz = -8.4;
    block(0.9, 0.9, 2.6, cx, cz, counter, 0.45);
    add(box(0.6, 0.03, 2.2, ox + cx, 0.92, oz + cz), belt);
    add(box(0.3, 0.3, 0.25, ox + cx + 0.2, 1.07, oz + cz - 0.9), std(0x1d1f23));
    add(box(0.28, 0.2, 0.03, ox + cx + 0.2, 1.38, oz + cz - 0.9), new THREE.MeshBasicMaterial({ color: 0x4f86ff }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(ox + cx - 0.35, 1.6, oz + cz + 1.2), metal);
    group.add(pole);
    add(box(0.5, 0.36, 0.04, ox + cx - 0.35, 2.4, oz + cz + 1.2), new THREE.MeshBasicMaterial({ map: label('Caisse', '', 0.5, 0.36, { bg: '#c81e2a', fg: '#ffffff', accent: '#c81e2a' }) }));
    staff.push({ x: ox + cx - 1.0, z: oz + cz, heading: Math.PI / 2 });
    spots.push({ x: ox + cx + 1.05, z: oz + cz, r: 1.4, id: 'caisse', label: '' });
  }
  // Paniers empilés à l'entrée.
  for (let k = 0; k < 4; k++) add(box(0.5, 0.18, 0.36, ox - 3.2, 0.12 + k * 0.12, z0 + 1.3), std(0xc81e2a, { roughness: 0.6 }));
  solids.push([[ox - 3.5, z0 + 1.1], [ox - 2.9, z0 + 1.1], [ox - 2.9, z0 + 1.5], [ox - 3.5, z0 + 1.5]]);

  for (const [shape, list] of Object.entries(items) as [Product['shape'], { m: THREE.Matrix4; c: THREE.Color }[]][]) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(shapes[shape], std(0xffffff, { roughness: shape === 'bottle' ? 0.2 : 0.6 }), list.length);
    list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
    group.add(mesh);
  }

  const room: Omit<Room, 'name'> = { x0, z0, x1, z1, solids, door: [ox, z0 + 0.6], spawn: { x: ox, z: z0 + 2.6, heading: 0 }, spots };
  return {
    room,
    staff,
    dispose() { textures.forEach((t) => t.dispose()); Object.values(shapes).forEach((g) => g.dispose()); },
  };
}
