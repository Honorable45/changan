import type { Pt, World } from './sim';

/** Itinéraire par le réseau réel : plus court chemin dans le sens de circulation, puis annonce des virages. */
export type Maneuver = { at: number; side: -1 | 1; street?: string };
export type Nav = { name: string; x: number; z: number; line: Pt[]; along: number[]; length: number; maneuvers: Maneuver[]; streets: { at: number; street?: string }[] };
export type NavStatus = { remaining: number; off: number; next: Maneuver | null; toNext: number; street?: string; look: Pt };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function project(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  const q: Pt = [a[0] + t * dx, a[1] + t * dz];
  return { q, t, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

const edgeLength = (pts: Pt[]) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i]![0], q[1] - pts[i]![1]), 0);

/** Point le plus proche sur chaque arête dirigée, à quelques mètres près : les deux sens d'une rue sont candidats. */
function closest(world: World, p: Pt) {
  let best = Infinity;
  const hits: { edge: number; seg: number; q: Pt; d: number }[] = [];
  world.edges.forEach((e, edge) => {
    for (let seg = 1; seg < e.p.length; seg++) {
      const { q, d } = project(p, e.p[seg - 1]!, e.p[seg]!);
      if (d < best + 6) hits.push({ edge, seg, q, d });
      best = Math.min(best, d);
    }
  });
  return hits.filter((h) => h.d < best + 6);
}

function shortest(world: World, from: ReturnType<typeof closest>, to: ReturnType<typeof closest>, heading: number, ignoreOneWay: boolean) {
  const { edges } = world;
  const out = new Map<number, { edge: number; reverse: boolean }[]>();
  edges.forEach((e, edge) => {
    const list = out.get(e.a) ?? [];
    list.push({ edge, reverse: false });
    out.set(e.a, list);
    if (ignoreOneWay) { const back = out.get(e.b) ?? []; back.push({ edge, reverse: true }); out.set(e.b, back); }
  });
  type Label = { cost: number; prev: number | null; via: { edge: number; reverse: boolean } | null };
  const dist = new Map<number, Label>();
  const open = new Set<number>();
  for (const h of from) {
    const e = edges[h.edge]!;
    const a = e.p[h.seg - 1]!, b = e.p[h.seg]!;
    // Repartir à contresens du véhicule impose un demi-tour : on le compte comme un détour.
    const turn = Math.abs(wrap(Math.atan2(b[0] - a[0], b[1] - a[1]) - heading));
    const cost = h.d + (turn > 1.8 ? 60 : 0) + edgeLength([h.q, ...e.p.slice(h.seg)]);
    const known = dist.get(e.b);
    if (!known || cost < known.cost) { dist.set(e.b, { cost, prev: null, via: { edge: h.edge, reverse: false } }); open.add(e.b); }
  }
  const startEdges = new Map(from.map((h) => [h.edge, h]));
  while (open.size) {
    let u = -1, cu = Infinity;
    for (const n of open) { const c = dist.get(n)!.cost; if (c < cu) { cu = c; u = n; } }
    open.delete(u);
    for (const step of out.get(u) ?? []) {
      const e = edges[step.edge]!;
      const v = step.reverse ? e.a : e.b;
      const cost = cu + edgeLength(e.p);
      if (cost < (dist.get(v)?.cost ?? Infinity)) { dist.set(v, { cost, prev: u, via: step }); open.add(v); }
    }
  }
  let best: { node: number; hit: (typeof to)[number]; cost: number } | null = null;
  for (const hit of to) {
    const e = edges[hit.edge]!;
    const label = dist.get(e.a);
    if (!label) continue;
    const cost = label.cost + edgeLength([...e.p.slice(0, hit.seg), hit.q]);
    if (!best || cost < best.cost) best = { node: e.a, hit, cost };
  }
  if (!best) return null;
  const chain: { edge: number; reverse: boolean }[] = [];
  for (let n: number | null = best.node; n !== null;) {
    const label: Label = dist.get(n)!;
    if (label.via) chain.unshift(label.via);
    n = label.prev;
  }
  return { chain, hit: best.hit, startEdges };
}

export function planNav(world: World, from: { x: number; z: number; heading: number }, target: { name: string; x: number; z: number }): Nav | null {
  const start: Pt = [from.x, from.z], goal: Pt = [target.x, target.z];
  const fromHits = closest(world, start), toHits = closest(world, goal);
  if (!fromHits.length || !toHits.length) return null;
  // Un carrefour de bord de carte peut être sans issue dans le bon sens : on accepte alors le contresens plutôt que de ne rien proposer.
  const found = shortest(world, fromHits, toHits, from.heading, false) ?? shortest(world, fromHits, toHits, from.heading, true);
  if (!found) return null;
  const line: Pt[] = [start];
  const names: { at: number; street?: string }[] = [];
  const push = (pts: Pt[], street?: string) => {
    names.push({ at: line.length - 1, street });
    for (const q of pts) { const l = line[line.length - 1]!; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.5) line.push(q); }
  };
  found.chain.forEach((s, i) => {
    const e = world.edges[s.edge]!;
    let pts = s.reverse ? [...e.p].reverse() : e.p;
    if (i === 0) {
      const h = found.startEdges.get(s.edge);
      if (h) pts = [h.q, ...e.p.slice(h.seg)];
    }
    push(pts, e.n);
  });
  const end = world.edges[found.hit.edge]!;
  push([...end.p.slice(0, found.hit.seg), found.hit.q], end.n);
  const along = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
  const length = along[along.length - 1]!;
  const pointAt = (d: number): Pt => {
    const m = Math.max(0, Math.min(d, length));
    let i = 1;
    while (i < along.length - 1 && along[i]! < m) i++;
    const t = (m - along[i - 1]!) / ((along[i]! - along[i - 1]!) || 1);
    return [line[i - 1]![0] + t * (line[i]![0] - line[i - 1]![0]), line[i - 1]![1] + t * (line[i]![1] - line[i - 1]![1])];
  };
  const bearing = (a: number, b: number) => { const p = pointAt(a), q = pointAt(b); return Math.atan2(q[0] - p[0], q[1] - p[1]); };
  const streets = names.map((n) => ({ at: along[n.at] ?? 0, street: n.street }));
  const streetAt = (d: number) => { let s: string | undefined; for (const n of streets) if (n.at <= d) s = n.street; return s; };
  const maneuvers: Maneuver[] = [];
  for (let d = 15; d < length - 15;) {
    const turn = wrap(bearing(d + 2, d + 14) - bearing(d - 14, d - 2));
    if (Math.abs(turn) > 0.6) {
      // Un cap qui augmente tourne vers la gauche.
      maneuvers.push({ at: d, side: turn > 0 ? -1 : 1, street: streetAt(d + 20) });
      d += 30;
    } else d += 4;
  }
  return { name: target.name, x: target.x, z: target.z, line, along, length, maneuvers, streets };
}

export function navStatus(nav: Nav, x: number, z: number): NavStatus {
  let bestD = Infinity, bestAt = 0;
  for (let i = 1; i < nav.line.length; i++) {
    const { d, t } = project([x, z], nav.line[i - 1]!, nav.line[i]!);
    if (d < bestD) { bestD = d; bestAt = nav.along[i - 1]! + t * (nav.along[i]! - nav.along[i - 1]!); }
  }
  const next = nav.maneuvers.find((m) => m.at > bestAt - 4) ?? null;
  let street: string | undefined;
  for (const s of nav.streets) if (s.at <= bestAt) street = s.street;
  const lookAt = Math.min(nav.length, bestAt + 35);
  let i = 1;
  while (i < nav.along.length - 1 && nav.along[i]! < lookAt) i++;
  return { remaining: Math.max(0, nav.length - bestAt), off: bestD, next, toNext: next ? Math.max(0, next.at - bestAt) : 0, street, look: nav.line[i]! };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'-]/g, ' ').toLowerCase();

export type Place = { name: string; kind: 'lieu' | 'rue'; x: number; z: number; rank: number };

/** Recherche sans accents ni casse : chaque mot tapé doit se retrouver dans le nom. Les noms sont ceux de la carte. */
export function searchPlaces(places: Place[], query: string, limit = 30) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return places.filter((p) => p.rank > 0).sort((a, b) => b.rank - a.rank).slice(0, limit);
  return places
    .map((p) => ({ p, f: fold(p.name) }))
    .filter(({ f }) => words.every((w) => f.includes(w)))
    .sort((a, b) => b.p.rank - a.p.rank || Number(b.f.startsWith(words[0]!)) - Number(a.f.startsWith(words[0]!)) || a.f.length - b.f.length)
    .slice(0, limit)
    .map(({ p }) => p);
}
