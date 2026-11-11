// Génère le plan de jeu du quartier administratif de Lomé depuis OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL).
// Usage : node scripts/lome-map.cjs <export-overpass.json> '[[est,nord],...]'  (points de passage du parcours, en mètres depuis le monument)
// Export (overpass-api.de/api/interpreter), boîte b = 6.1149,1.2072,6.1371,1.2246 :
// [out:json];rel["boundary"="administrative"]["name"="Quartier Administratif"](6.11,1.20,6.14,1.23)->.x;.x out geom;(way["highway"](b);way["building"](b);way["leisure"](b);way["landuse"](b);way["barrier"](b);way["amenity"="parking"](b);way["natural"](6.11,1.2,6.1371,1.2246);node["highway"="traffic_signals"](b);node["name"](b);nwr["tourism"](b);nwr["historic"](b););out geom;
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const elements = JSON.parse(readFileSync(process.argv[2], 'utf8')).elements;
const LAT0 = 6.1299621, LON0 = 1.2160115; // Monument de l'Indépendance
// x vers l'ouest et z vers le nord : le jeu regarde vers +z avec sa droite vers -x, la carte n'est donc pas inversée.
const project = (p) => [+(-(p.lon - LON0) * 111320 * Math.cos(LAT0 * Math.PI / 180)).toFixed(1), +((p.lat - LAT0) * 110574).toFixed(1)];
const MARGIN = 110;
const IAI_POINT = project({ lat: 6.1254731, lon: 1.2105188 });
const fromIai = ([east, north]) => [+(IAI_POINT[0] - east).toFixed(1), +(IAI_POINT[1] + north).toFixed(1)];

const rel = elements.find((e) => e.type === 'relation');
const pieces = rel.members.filter((m) => m.type === 'way' && m.role === 'outer').map((m) => m.geometry.map(project));
const boundary = [...pieces.shift()];
while (pieces.length) {
  const end = boundary[boundary.length - 1];
  const dist = (a) => Math.hypot(a[0] - end[0], a[1] - end[1]);
  let best = 0, flip = false, score = Infinity;
  pieces.forEach((w, i) => {
    if (dist(w[0]) < score) { score = dist(w[0]); best = i; flip = false; }
    if (dist(w[w.length - 1]) < score) { score = dist(w[w.length - 1]); best = i; flip = true; }
  });
  const next = pieces.splice(best, 1)[0];
  boundary.push(...(flip ? next.reverse() : next));
}
const inside = (x, z, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const edgeDist = (x, z, poly) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
  }
  return best;
};
const near = (x, z) => inside(x, z, boundary) || edgeDist(x, z, boundary) < MARGIN;
const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);

const closed = (w) => w.geometry && w.geometry.length > 3;
const WIDTH = { trunk: 15, trunk_link: 7, secondary: 13, secondary_link: 7, tertiary: 11, tertiary_link: 7, unclassified: 8, residential: 7, living_street: 6, service: 5, pedestrian: 5 };
const RANK = { trunk: 6, secondary: 5, tertiary: 4, unclassified: 3, residential: 2 };
const ways = elements.filter((e) => e.type === 'way' && e.tags);

const roads = [];
const parts = [];
for (const w of ways) {
  const cls = w.tags.highway;
  if (!WIDTH[cls] || w.tags.access === 'private') continue;
  const pts = w.geometry.map(project);
  const oneway = w.tags.oneway === 'yes' || w.tags.junction === 'roundabout';
  let width = w.tags.width ? +w.tags.width || WIDTH[cls] : WIDTH[cls];
  if (oneway && !/link/.test(cls) && w.tags.junction !== 'roundabout') width *= 0.62;
  const keep = pts.map(([x, z]) => near(x, z));
  if (!keep.some(Boolean)) continue;
  // On coupe ce qui sort de la zone, en gardant un point de chaque côté.
  let run = [], ids = [];
  const flush = () => {
    if (run.length > 1) {
      roads.push({ c: cls, w: +width.toFixed(1), o: oneway ? 1 : 0, n: w.tags.name ?? undefined, p: run });
      parts.push({ cls, oneway, width, ids, pts: run, name: w.tags.name });
    }
    run = []; ids = [];
  };
  pts.forEach((p, i) => {
    if (keep[i] || keep[i + 1] || keep[i - 1]) { run.push(p); ids.push(w.nodes[i]); } else flush();
  });
  flush();
}

/* Graphe de circulation : routes principales, découpées aux croisements */
const useCount = new Map();
const main = parts.filter((p) => RANK[p.cls.replace('_link', '')] >= 2 || (p.cls === 'service' && p.name));
for (const p of main) p.ids.forEach((id, i) => useCount.set(id, (useCount.get(id) ?? 0) + (i === 0 || i === p.ids.length - 1 ? 1 : 2)));
const nodeIndex = new Map(), nodes = [], edges = [];
const nodeOf = (id, pt) => { if (!nodeIndex.has(id)) { nodeIndex.set(id, nodes.length); nodes.push(pt); } return nodeIndex.get(id); };
for (const p of main) {
  let start = 0;
  for (let i = 1; i < p.ids.length; i++) {
    if (i < p.ids.length - 1 && useCount.get(p.ids[i]) < 3) continue;
    const pts = p.pts.slice(start, i + 1);
    const a = nodeOf(p.ids[start], p.pts[start]), b = nodeOf(p.ids[i], p.pts[i]);
    const length = pts.slice(1).reduce((s, q, k) => s + Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]), 0);
    const lane = p.oneway ? 0 : +(p.width / 4).toFixed(1);
    edges.push({ a, b, p: pts, l: lane, r: RANK[p.cls.replace('_link', '')] ?? 2, n: p.name, len: length });
    if (!p.oneway) edges.push({ a: b, b: a, p: [...pts].reverse(), l: lane, r: RANK[p.cls.replace('_link', '')] ?? 2, n: p.name, len: length });
    start = i;
  }
}

/* Feux : les nœuds OSM d'un même carrefour sont regroupés */
const lights = elements.filter((e) => e.type === 'node' && e.tags?.highway === 'traffic_signals').map(project).filter(([x, z]) => near(x, z));
const clusters = [];
for (const l of lights) {
  const c = clusters.find((k) => Math.hypot(k.pts[0][0] - l[0], k.pts[0][1] - l[1]) < 45);
  if (c) c.pts.push(l); else clusters.push({ pts: [l] });
}
const junctions = clusters.map((c) => {
  const [x, z] = centre(c.pts);
  // Le carrefour du graphe le plus proche porte le feu ; l'axe principal suit sa route la plus importante.
  let node = 0, best = Infinity;
  nodes.forEach((n, i) => { const d = Math.hypot(n[0] - x, n[1] - z); if (d < best && edges.some((e) => e.a === i) && edges.filter((e) => e.a === i || e.b === i).length >= 3) { best = d; node = i; } });
  const out = edges.filter((e) => e.a === node).sort((p, q) => q.r - p.r);
  const dirs = out.map((e) => { const q = e.p[Math.min(1, e.p.length - 1)]; return Math.atan2(q[0] - nodes[node][0], q[1] - nodes[node][1]); });
  return { x: nodes[node][0], z: nodes[node][1], node, axis: +(dirs[0] ?? 0).toFixed(3), dirs: dirs.map((d) => +d.toFixed(3)), r: 9 };
}).filter((j, i, all) => all.findIndex((k) => k.node === j.node) === i);

/* Établissements reconnus sur des captures de référence : emprise de la carte, hauteur estimée d'après l'image. */
const SIGNATURE = {
  257707585: { sig: 'sunu', h: 16, n: 'SUNU Assurances' },
  192107049: { sig: 'ahodikpe', h: 23, n: 'Hôtel AHODIKPE' },
  322697159: { sig: 'folyana', h: 4.2, n: 'Hôtel Folyana' },
  1225967005: { sig: 'champion', h: 8, n: 'Le Champion Okavango' },
  532653317: { sig: 'metro', h: 4.8, n: 'Bar Metro' },
  1333467895: { sig: 'fifty', h: 4.4, n: 'Restaurant - Bar Fifty' },
  763371821: { sig: 'cofina', h: 4.6, n: 'Agence Cofina' },
  763371812: { sig: 'gozem', h: 8, n: 'Gozem Togo' },
  112412974: { sig: 'utbTower', h: 36, n: 'UTB Circulaire' },
  257700648: { sig: 'utbBase', h: 6 },
  317992029: { sig: 'poste', h: 7.5, n: 'Bureau des Postes de Nyekonakpoe' },
  267638382: { sig: 'orabank', h: 27, n: 'Siège de Orabank' },
  166401499: { sig: 'postes', h: 30, n: 'Direction des Postes et de la Télécom' },
  256606237: { sig: 'pompiers', h: 7, n: 'Corps des Sapeurs-Pompiers de Lomé' },
};

/* Bâtiments */
const overrides = { 'Hôtel 2 Février': 11, Parlement: 20 }; // La tour de l'hôtel (102 m) est ajoutée au rendu sur ce socle.
const buildings = [];
for (const w of ways) {
  if (!w.tags.building || !w.geometry) continue;
  let pts = w.geometry.map(project);
  if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length < 3) continue;
  const [cx, cz] = centre(pts);
  if (!near(cx, cz)) continue;
  const levels = parseFloat(w.tags['building:levels']);
  const area = Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (area < 12) continue;
  const seed = Math.abs(Math.sin(w.id) * 1e4 % 1);
  const h = overrides[w.tags.name] ?? parseFloat(w.tags.height) ?? NaN;
  const height = Number.isFinite(h) ? h : Number.isFinite(levels) ? levels * 3.3 : area > 900 ? 9 + seed * 10 : area > 250 ? 6 + seed * 6 : 3.4 + seed * 2.6;
  const b = { id: w.id, p: pts, h: +height.toFixed(1), s: +seed.toFixed(2) };
  if (SIGNATURE[w.id]) Object.assign(b, SIGNATURE[w.id]);
  if (w.id === 257707586) { b.annex = 1; b.h = 10.5; } // Annexe vitrée bleue du CENETI, d'après photographie.
  if (w.id === 1498863945) b.dome = 1; // Le dôme blanc devant l'hôtel : la carte n'en donne que l'emprise.
  if (w.tags.name) b.n = w.tags.name;
  buildings.push(b);
}

/* Immeuble de l'IAI-Togo : absent d'OpenStreetMap, qui n'en donne que le point. Relevé sur vue aérienne, précision de l'ordre de 10 m. Hauteur estimée. */
const IAI_NAME = 'IAI-Togo (immeuble CENETI)';
const fromCrop = ([cx, cy]) => fromIai([+(0.1133 * cx - 103.3).toFixed(1), +(59.06 - 0.1133 * cy).toFixed(1)]); // Pixels du relevé aérien vers mètres.
buildings.push({
  p: [[-47.8, 22.8], [-14, 36], [-1, -3], [-35.3, -18]].map(fromIai),
  hole: [[625, 395], [720, 365], [770, 520], [680, 545]].map(fromCrop),
  tan: [[545, 350], [790, 265], [805, 320], [625, 395], [680, 545], [770, 520], [755, 460], [855, 435], [890, 535], [640, 620]].map(fromCrop),
  h: 15.4, s: 0.5, n: IAI_NAME,
});
// BSIC : absent de la carte. Placé sur le terrain libre entre la clôture du CENETI, SUNU et le boulevard du 13 Janvier, à l'endroit désigné par l'utilisateur sur une capture du jeu. Emprise et hauteur approximatives.
buildings.push({ p: [[669.8, -464.3], [683.2, -468.6], [676.4, -489.5], [663, -485.2]], h: 40, s: 0.5, n: 'BSIC-TOGO', sig: 'bsic' });

/* CASEF : la carte n'en a que la rotonde et un point. Emprises et clôture relevées sur vue aérienne (pixels vers mètres). */
const casefPx = ([x, y]) => { const e = 150 + (x - 747.13) * 0.29688, n = -185 - (y - 759.35) * 0.29688; return [+(-e).toFixed(1), +n.toFixed(1)]; };
buildings.push({ p: [[650, 690], [695, 668], [735, 700], [770, 655], [880, 760], [830, 870], [735, 800], [700, 870], [620, 820]].map(casefPx), h: 41, s: 0.5, n: 'CASEF', sig: 'casefMain' });
buildings.push({ p: [[700, 880], [760, 868], [830, 900], [830, 930], [770, 985], [700, 930]].map(casefPx), h: 26, s: 0.5, sig: 'casefLow' });
const rotunda = buildings.find((b) => b.id === 112413046);
if (rotunda) { rotunda.sig = 'casefRound'; rotunda.h = 20; }

/* Noms : uniquement ceux de la carte. Un établissement placé dans un bâtiment lui donne son nom ; les autres restent des points. */
const isPlace = (t) => t?.name && (t.amenity || t.office || t.shop || t.tourism || t.historic || t.craft || t.leisure || t.healthcare) && !/^passage/i.test(t.name) && t.name.length > 2;
const places = [];
for (const e of elements) {
  if (e.type !== 'node' || !isPlace(e.tags)) continue;
  const [x, z] = project(e);
  if (!near(x, z) || e.tags.name === "Institut Africain d'Informatique" || buildings.some((b) => b.n === e.tags.name) || e.tags.name === 'C.A.S.E.F') continue;
  const host = buildings.find((b) => inside(x, z, b.p));
  if (host && !host.n) host.n = e.tags.name;
  else if (!host || host.n !== e.tags.name) places.push({ n: e.tags.name, x, z });
}
for (const w of ways) {
  if (w.tags.building && w.tags['building:colour'] === 'white') {
    const c = centre(w.geometry.map(project));
    const b = buildings.find((k) => inside(c[0], c[1], k.p));
    if (b) b.wall = 0xf2f2ee;
  }
}

/* Murs d'enceinte : on retire les tronçons au droit d'une rue, faute de connaître l'emplacement des portails. */
const onAnyRoad = (x, z) => roads.some((r) => r.p.some((q, i) => {
  const a = r.p[i - 1];
  if (!a) return false;
  const dx = q[0] - a[0], dz = q[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < r.w / 2 + 1.5;
}));
const walls = [];
const iaiFence = [];
const inBsic = (p) => { const b = buildings.find((k) => k.sig === 'bsic'); return b && inside(p[0], p[1], b.p); };
for (const w of ways) {
  if (!['wall', 'fence'].includes(w.tags.barrier) || !w.geometry) continue;
  const pts = w.geometry.map(project);
  pts.slice(1).forEach((q, i) => {
    const a = pts[i];
    const mid = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2];
    if (near(mid[0], mid[1]) && Math.hypot(q[0] - a[0], q[1] - a[1]) > 0.5 && !onAnyRoad(a[0], a[1]) && !onAnyRoad(q[0], q[1]) && !onAnyRoad(mid[0], mid[1])) (w.id === 257707250 ? [] : walls).push(w.tags.barrier === 'fence' ? [a, q, 1] : [a, q]);
  });
}
// Clôture du CENETI : le tracé longe la rue Agoucon de trop près ; on la recule sur le trottoir et on laisse une entrée là où une voie la traverse.
for (const w of ways) {
  if (w.id !== 257707250) continue;
  const pts = w.geometry.map(project);
  const [cx, cz] = centre(pts);
  const agoucon = roads.filter((r) => r.n === 'Rue Agoucon');
  const distTo = (x, z, list) => Math.min(...list.flatMap((r) => r.p.slice(1).map((q, i) => {
    const a = r.p[i], dx = q[0] - a[0], dz = q[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  })));
  const others = roads.filter((r) => r.n !== 'Rue Agoucon' && r.c !== 'trunk');
  pts.slice(1).forEach((q, i) => {
    const a = pts[i], len = Math.hypot(q[0] - a[0], q[1] - a[1]);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < n; k++) {
      let p0 = [a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n], p1 = [a[0] + ((q[0] - a[0]) * (k + 1)) / n, a[1] + ((q[1] - a[1]) * (k + 1)) / n];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (inBsic(mid) || distTo(mid[0], mid[1], others) < 2.5) continue;
      const clear = 6 - distTo(mid[0], mid[1], agoucon);
      if (clear > 0) {
        const d = Math.hypot(cx - mid[0], cz - mid[1]) || 1;
        const ox = ((cx - mid[0]) / d) * clear, oz = ((cz - mid[1]) / d) * clear;
        p0 = [p0[0] + ox, p0[1] + oz]; p1 = [p1[0] + ox, p1[1] + oz];
      }
      iaiFence.push([p0.map((v) => +v.toFixed(1)), p1.map((v) => +v.toFixed(1))]);
    }
  });
}
const casefFence = [];
const casefArea = [[352, 682], [626, 512], [700, 568], [1005, 772], [662, 1150], [632, 1160], [392, 930], [352, 772]].map(casefPx);
{
  const trace = [...casefArea, casefArea[0]];
  trace.slice(1).forEach((q, i) => {
    const a = trace[i];
    const n = Math.max(1, Math.round(Math.hypot(q[0] - a[0], q[1] - a[1]) / 3));
    for (let k = 0; k < n; k++) {
      const p0 = [a[0] + ((q[0] - a[0]) * k) / n, a[1] + ((q[1] - a[1]) * k) / n], p1 = [a[0] + ((q[0] - a[0]) * (k + 1)) / n, a[1] + ((q[1] - a[1]) * (k + 1)) / n];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (!onAnyRoad(mid[0], mid[1])) casefFence.push([p0.map((v) => +v.toFixed(1)), p1.map((v) => +v.toFixed(1))]);
    }
  });
}
const parkings = ways.filter((w) => w.tags.amenity === 'parking' && closed(w)).map((w) => w.geometry.map(project)).filter((p) => { const [x, z] = centre(p); return near(x, z); });

/* Espaces verts, eau, plage */
const greens = ways.filter((w) => closed(w) && (['park', 'garden', 'pitch'].includes(w.tags.leisure) || ['grass', 'village_green'].includes(w.tags.landuse) || w.tags.natural === 'wood')).map((w) => w.geometry.map(project)).filter((p) => { const [x, z] = centre(p); return near(x, z); });
const water = ways.filter((w) => closed(w) && (w.tags.natural === 'water' || w.tags.leisure === 'swimming_pool')).map((w) => w.geometry.map(project)).filter((p) => { const [x, z] = centre(p); return near(x, z); });
const beach = ways.filter((w) => closed(w) && w.tags.natural === 'beach').map((w) => w.geometry.map(project));
const coast = ways.filter((w) => w.tags.natural === 'coastline').map((w) => w.geometry.map(project));
const named = elements.filter((e) => e.tags?.name && (e.tags.historic || e.tags.tourism === 'attraction' || e.tags.tourism === 'museum') && e.type === 'node').map((e) => ({ n: e.tags.name, ...{ x: project(e)[0], z: project(e)[1] } })).filter((e) => inside(e.x, e.z, boundary));

/* Parcours : plus court chemin par les vraies rues, dans le sens autorisé */
const nearestNode = (east, north) => {
  let node = -1, best = Infinity;
  nodes.forEach((n, i) => { const d = Math.hypot(n[0] + east, n[1] - north); if (d < best && edges.some((e) => e.a === i)) { best = d; node = i; } });
  return node;
};
function path(from, to) {
  const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
  while (open.size) {
    let u = -1, du = Infinity;
    for (const n of open) if (dist.get(n) < du) { du = dist.get(n); u = n; }
    open.delete(u);
    if (u === to) break;
    for (const e of edges) {
      if (e.a !== u) continue;
      const cost = e.len * (e.r >= 4 ? 1 : e.r === 3 ? 1.5 : 3);
      if (du + cost < (dist.get(e.b) ?? Infinity)) { dist.set(e.b, du + cost); prev.set(e.b, e); open.add(e.b); }
    }
  }
  const out = [];
  for (let n = to; n !== from;) { const e = prev.get(n); if (!e) throw new Error(`pas de chemin ${from} -> ${to}`); out.unshift(e); n = e.a; }
  return out;
}
const VIA = JSON.parse(process.argv[3] ?? '[]');
const route = [];
for (let i = 1; i < VIA.length; i++) route.push(...path(nearestNode(...VIA[i - 1]), nearestNode(...VIA[i])));
const line = [];
for (const e of route) for (const p of e.p) if (!line.length || line[line.length - 1][0] !== p[0] || line[line.length - 1][1] !== p[1]) line.push(p);
// L'arrivée s'arrête juste avant l'immeuble de l'IAI, au lieu de continuer jusqu'au prochain carrefour.
const ARRIVAL = fromIai([28, -30]);
if (Math.hypot(line[line.length - 1][0] - ARRIVAL[0], line[line.length - 1][1] - ARRIVAL[1]) < 300) {
  let cut = line.length - 1, best = Infinity, at = null;
  line.forEach((q, i) => {
    const a = line[i - 1];
    if (!a) return;
    const dx = q[0] - a[0], dz = q[1] - a[1];
    const t = Math.max(0, Math.min(1, ((ARRIVAL[0] - a[0]) * dx + (ARRIVAL[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const m = [a[0] + t * dx, a[1] + t * dz];
    const gap = Math.hypot(m[0] - ARRIVAL[0], m[1] - ARRIVAL[1]);
    if (gap < best) { best = gap; cut = i; at = m; }
  });
  line.length = cut;
  line.push([+at[0].toFixed(1), +at[1].toFixed(1)]);
}
const streets = [];
for (const e of route) { const last = streets[streets.length - 1]; if (last?.n === e.n) last.m += e.len; else streets.push({ n: e.n, m: e.len, at: e.p[0] }); }
const inRoute = new Set(route.flatMap((e) => [e.a, e.b]));
console.log('bords', boundary.length, 'routes', roads.length, 'noeuds', nodes.length, 'arêtes', edges.length, 'feux', junctions.length, 'bâtiments', buildings.length, 'verts', greens.length);
console.log('route', streets.map((s) => `${s.n ?? '?'} ${Math.round(s.m)}m @${Math.round(-s.at[0])},${Math.round(s.at[1])}`).join(' > '));
console.log('feux sur route', junctions.filter((j) => inRoute.has(j.node)).map((j) => [Math.round(-j.x), Math.round(j.z)]));
console.log('bâtiments nommés', buildings.filter((b) => b.n).length);

/* Étapes : une à chaque vrai virage du parcours, un arrêt au premier feu rencontré */
const along = [0];
for (let i = 1; i < line.length; i++) along.push(along[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
const pointAt = (d) => {
  const clamped = Math.max(0, Math.min(d, along[along.length - 1]));
  let i = 1;
  while (i < along.length - 1 && along[i] < clamped) i++;
  const t = (clamped - along[i - 1]) / (along[i] - along[i - 1] || 1);
  return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
};
const bearing = (d) => { const a = pointAt(d - 12), b = pointAt(d + 12); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const total = along[along.length - 1];
const nameAt = (d) => { let walked = 0; for (const e of route) { walked += e.len; if (walked >= d) return e.n; } return undefined; };
const round = (p) => p.map((v) => +v.toFixed(1));
const events = [];
let d = 40;
while (d < total - 40) {
  const turn = wrap(bearing(d + 18) - bearing(d - 18));
  if (Math.abs(turn) > 0.7) {
    const side = turn > 0 ? -1 : 1; // Un cap qui augmente tourne vers la gauche.
    const street = nameAt(d + 30);
    events.push({ d: d + 30, kind: 'gate', signal: side, text: `Clignotant ${side < 0 ? 'gauche' : 'droit'}, puis tournez à ${side < 0 ? 'gauche' : 'droite'}${street ? ` : ${street}` : ''}.` });
    d += 60;
  } else d += 6;
}
const firstLight = junctions.map((j) => { let best = -1, gap = 14; line.forEach((q, i) => { const g = Math.hypot(q[0] - j.x, q[1] - j.z); if (g < gap) { gap = g; best = along[i]; } }); return { j, at: best }; }).filter((h) => h.at > 150).sort((p, q) => p.at - q.at)[0];
if (firstLight) events.push({ d: firstLight.at - 16, kind: 'stop', junction: junctions.indexOf(firstLight.j), text: 'Feu rouge : arrêtez-vous avant le carrefour.' });
events.sort((p, q) => p.d - q.d);
// Un point de passage sur les longues lignes droites, pour que la flèche guide toujours.
const steps = [{ kind: 'ignite', text: 'Démarrez le moteur.', x: line[0][0], z: line[0][1] }];
let prev = 0;
const passing = [...events, { d: total, kind: 'park' }];
for (const ev of passing) {
  for (let m = prev + 300; m < ev.d - 120; m += 300) { const q = round(pointAt(m)); steps.push({ kind: 'gate', x: q[0], z: q[1], text: `Continuez${nameAt(m) ? ` : ${nameAt(m)}` : ''}.` }); }
  const q = round(pointAt(ev.d));
  if (ev.kind === 'park') steps.push({ kind: 'park', x: q[0], z: q[1], text: 'Arrivée à l’IAI-Togo : garez-vous sur la place éclairée.' });
  else steps.push({ kind: ev.kind, text: ev.text, signal: ev.signal, junction: ev.junction, heading: ev.kind === 'stop' ? +bearing(ev.d).toFixed(3) : undefined, x: q[0], z: q[1] });
  prev = ev.d;
}
const start = { x: line[0][0], z: line[0][1], heading: +bearing(14).toFixed(3) };
const end = round(pointAt(total));
const park = { x: end[0], z: end[1], heading: +bearing(total - 14).toFixed(3), halfW: 2.6, halfL: 4 };
console.log(steps.map((s) => `${s.kind} ${Math.round(-s.x)},${Math.round(s.z)} ${s.text}`).join('\n'));
console.log('longueur', Math.round(total));

for (const b of buildings) delete b.id;
const out = { boundary, roads, nodes, edges: edges.map(({ a, b, p, l, r, n }) => ({ a, b, p, l, r, n })), junctions, buildings, greens, water, beach, coast, named, places, walls, iaiFence, casefFence, casefArea, parkings, iai: IAI_NAME, iaiPoint: IAI_POINT, route: line, steps, start, park };
const file = join(__dirname, '../jeu/client/public/game/lome.json');
if (process.env.WRITE !== '0') writeFileSync(file, JSON.stringify(out));
console.log('taille', Math.round(JSON.stringify(out).length / 1024), 'Ko');
