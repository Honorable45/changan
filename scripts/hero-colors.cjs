// Génère les teintes simulées du hero depuis la photo de profil de l'UNI-K. Usage : node scripts/hero-colors.cjs
const { join } = require('node:path');
const root = join(__dirname, '..');
const sharp = require(join(root, 'backend/node_modules/sharp'));
const OUT = join(root, 'frontend/public/hero');
const source = join(OUT, 'uni-k-profil-2400.webp');
const S = 2400 / 2678; // Les relevés ci-dessous sont en pixels de la photo d'origine.

const COLORS = { blanc: [236, 237, 238], noir: [38, 40, 44], gris: [112, 116, 122], bleu: [28, 52, 110] };
const K = 2678 / 1500; // Les vitres ont été relevées sur une vue de 1500 px.
const EXCLUDED = [
  [[478, 108], [600, 45], [760, 35], [1045, 50], [1178, 130], [1085, 145], [760, 152], [515, 158]], // vitres latérales
  [[1235, 90], [1370, 45], [1440, 135], [1370, 145]], // lunette
  [[1345, 395], [1450, 395], [1450, 460], [1345, 460]], // échappements
  [[1445, 225], [1500, 225], [1500, 285], [1445, 285]], // plaque
].map((poly) => poly.map(([x, y]) => [x * K, y * K]));
const WHEELS = [[398, 734, 235], [2012, 794, 240]];
const SILL = [[390, 405], [1010, 405], [1010, 470], [390, 470]].map(([x, y]) => [x * K, y * K]);

const inside = (x, y, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const smooth = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

(async () => {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const mask = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const ox = x / S, oy = y / S;
    // Bas de caisse poussiéreux et reflets brûlés : neutres sur la photo, mais ils appartiennent à la carrosserie.
    const neutralBody = inside(ox, oy, SILL) || Math.min(data[i], data[i + 1], data[i + 2]) > 170;
    let m = (neutralBody ? 1 : smooth(0, 7, data[i + 2] - data[i])) * (data[i + 3] / 255);
    if (m && (EXCLUDED.some((p) => inside(ox, oy, p)) || WHEELS.some(([cx, cy, r]) => (ox - cx) ** 2 + (oy - cy) ** 2 < r * r))) m = 0;
    mask[y * W + x] = m;
  }
  for (const [name, tint] of Object.entries(COLORS)) {
    const out = Buffer.from(data);
    for (let p = 0; p < W * H; p++) {
      const m = mask[p];
      if (!m) continue;
      const i = p * 4;
      const v = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 / 0.62;
      const shade = Math.min(v, 1) ** 1.25, shine = smooth(1.1, 1.7, v) * 0.3;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((1 - m) * data[i + c] + m * Math.min(255, tint[c] * shade + (255 - tint[c] * shade) * shine));
    }
    const image = sharp(out, { raw: { width: W, height: H, channels: 4 } });
    for (const w of [1280, 2400]) await image.clone().resize(w).webp({ quality: 80, alphaQuality: 90, effort: 5 }).toFile(join(OUT, `uni-k-${name}-${w}.webp`));
  }
})();
