import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameAudio } from './audio';
import { BAY, GRID, PITCH, ROAD, WALK, gridWorld } from './grid';
import { box, flat, flatGeometry, glowTexture, ribbon, windowsTexture, type Decor } from './kit';
import { buildVehicle, setFleet, sharedCar, type CarParts } from './vehicles';
import type { Fleet } from './fleet';
import { buildChampion, fcfa, productById } from './champion';
import { DANSE_DECALAGE, DRAPEAU } from '../../../partage/protocole.ts';
import { couleurJoueur, genreIndex, genreNom, type Reseau } from '../reseau';
import { SmartAIController } from './smart-ai/controller.ts';
import type { Telemetry } from './smart-ai/types.ts';
import { DrivingRecorder, KnowledgeBase } from './smart-ai/learning.ts';
import { FleetSafety } from './smart-ai/fleet.ts';
import { CLASS_LABEL } from './smart-ai/types.ts';
import { buildQ05Cabin } from './changan';
import { createPeople, HERO_LOOK, lookFor, studentLook, type Pose, type Person } from './people';
import { loadHumans, type HumanKit } from './humans';
import { buildInterior, type InteriorKind } from './interior';
import { buildIaiInterior, iaiGroundRoutes } from './iai-interior';
import { buildLomeScene, lomeWorld, type LomeData } from './lome';
import { navStatus, planNav, type Maneuver, type Nav } from './nav';
import { GameSim, HERO, LIMIT, TWO_WHEELS, VEHICLES, floorName, type GameEvent, type Input, type Mode, type Result, type World } from './sim';

export type View = 'chase' | 'driver' | 'aerial';
export type Hud = {
  speed: number; gear: string; engineOn: boolean; indicator: -1 | 0 | 1; blink: boolean; night: boolean; view: View; muted: boolean;
  text: string; stepNo: number; stepTotal: number; score: number; free: boolean; bearing: number | null; distance: number; park: number; overLimit: boolean;
  result: Result | null; street: string; canSearch: boolean; nav: { name: string; remaining: number; next: Maneuver | null; toNext: number } | null; x: number; z: number; heading: number; step: number; hits: number; reds: number; signals: number; fps: number;
  mode: Mode; action: string | null; vehicle: string; inside: string | null; running: boolean;
  /** Argent d'Honorable en francs CFA, panier en cours au Champion, articles achetés, pas de danse. */
  money: number; basket: { id: string; name: string; price: number }[]; bag: number; dance: number; shop: boolean; pad: boolean;
  /** Altitude de l'hélicoptère en mètres, null hors de l'hélicoptère. */
  altitude: number | null;
  /** Jeu en ligne : état de la connexion, joueurs dans la salle et sur le serveur. */
  online: {
    statut: string; salle: number; total: number; voisins: number;
    /** Les autres joueurs de la salle, du plus proche au plus loin ; cap relatif à celui du joueur, en radians. */
    joueurs: { id: number; nom: string; distance: number; cap: number; dedans: boolean; x: number; z: number }[];
  } | null;
  /** SMART AI : proposée dans un véhicule routier ; son tableau de bord quand elle conduit. */
  smartAvailable: boolean; smart: Telemetry | null;
};
export type GameOptions = {
  color: number; night: boolean; free: boolean; foot?: boolean; lome: LomeData | null; onHud: (h: Hud) => void; onEvent: (e: GameEvent) => void; map: () => HTMLCanvasElement | null;
  fleet?: Fleet | null; money?: number; onNotice?: (text: string) => void; onPause?: () => void;
  /** Jeu en ligne : sans lui, la partie se joue seule. */
  reseau?: Reseau | null;
  /** Savoir partagé de SMART AI : adresse du serveur (null : savoir gardé dans ce navigateur seulement). */
  savoirUrl?: string | null;
};

const Y = { base: 0.02, walk: 0.05, road: 0.08, mark: 0.11 };


function skyTexture(night: boolean) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 512;
  if (night) c.width = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  if (night) { grad.addColorStop(0, '#03050b'); grad.addColorStop(0.5, '#0b1322'); grad.addColorStop(0.56, '#1d2533'); }
  else { grad.addColorStop(0, '#2f76c6'); grad.addColorStop(0.46, '#a8d3ef'); grad.addColorStop(0.53, '#f4e8d4'); }
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, 512);
  if (night) { g.fillStyle = '#fff'; for (let i = 0; i < 260; i++) g.fillRect((i * 197) % 512, (i * i * 13) % 240, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGame(host: HTMLElement, options: GameOptions) {
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 767px)').matches;
  const low = coarse || (navigator.hardwareConcurrency ?? 8) <= 4;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lome = options.lome ? lomeWorld(options.lome, low) : null;
  const grid = lome ? null : gridWorld();
  const world: World = (lome ?? grid)!;
  setFleet(options.fleet ?? null);
  const sim = new GameSim(world, options.free, low ? 8 : 16, { color: options.color, walkers: low ? 10 : 22, parked: options.free, foot: options.free && options.foot });
  const audio = new GameAudio();

  const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
  let ratio = Math.min(devicePixelRatio, low ? 1.25 : 2);
  renderer.setPixelRatio(ratio);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Vue de la ville pendant la conduite');
  renderer.domElement.style.display = 'block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.25, 4000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x665a4a, 1);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, sun.target);

  const skies = { day: skyTexture(false), night: skyTexture(true) };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3600, 24, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(dome);
  scene.fog = new THREE.Fog(0xdfe4e2, 320, 1900);

  const buildGridScene = (): Decor => {
    const city = grid!.city;
    const addStatic = (geo: THREE.BufferGeometry, mat: THREE.Material, receive = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = receive && !low; scene.add(m); return m; };
  /* Sol, chaussées, marquages */
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.92, envMapIntensity: 0.25 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8e8b85, roughness: 0.95, envMapIntensity: 0.25 });
  const ground = new THREE.MeshStandardMaterial({ color: 0x78726a, roughness: 1, envMapIntensity: 0.2 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x4c7a3a, roughness: 1, envMapIntensity: 0.2 });
  const paintWhite = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.8, envMapIntensity: 0.25 });
  const span = 2 * (GRID * PITCH) + 2 * (ROAD + WALK);
  const roadParts: THREE.BufferGeometry[] = [], walkParts: THREE.BufferGeometry[] = [], marks: THREE.BufferGeometry[] = [];
  for (let i = -GRID; i <= GRID; i++) {
    const at = i * PITCH;
    roadParts.push(flat(2 * ROAD, span, at, Y.road, 0), flat(span, 2 * ROAD, 0, Y.road + 0.002, at));
    walkParts.push(flat(2 * (ROAD + WALK), span, at, Y.walk, 0), flat(span, 2 * (ROAD + WALK), 0, Y.walk + 0.002, at));
    for (let j = -GRID; j < GRID; j++) {
      const from = j * PITCH;
      for (let d = ROAD + WALK + 2; d < PITCH - ROAD - WALK - 2; d += 7) {
        marks.push(flat(0.16, 3, at, Y.mark, from + d + 1.5), flat(3, 0.16, from + d + 1.5, Y.mark, at));
      }
      for (const [sign, base] of [[1, from], [-1, from + PITCH]] as const) {
        // Ligne d'arrêt sur la voie qui arrive, passage piéton sur toute la largeur.
        marks.push(flat(ROAD - 0.3, 0.45, at - sign * ROAD / 2, Y.mark, base + sign * (ROAD + 2)));
        marks.push(flat(0.45, ROAD - 0.3, base + sign * (ROAD + 2), Y.mark, at + sign * ROAD / 2));
        for (let k = -5; k <= 5; k += 2) {
          marks.push(flat(0.9, 2, at + k, Y.mark, base + sign * (ROAD + 4.2)));
          marks.push(flat(2, 0.9, base + sign * (ROAD + 4.2), Y.mark, at + k));
        }
      }
    }
  }
  const toFlat = (list: THREE.BufferGeometry[]) => mergeGeometries(list);
  addStatic(flat(2400, 2400, 0, Y.base, 0), ground);
  addStatic(toFlat(walkParts), concrete);
  addStatic(toFlat(roadParts), asphalt);
  addStatic(toFlat(marks), paintWhite, false);
  for (const p of city.parks) addStatic(flat(PITCH - 18, PITCH - 18, p.x0 + PITCH / 2, Y.walk, p.z0 + PITCH / 2), grass);

  /* Immeubles fusionnés : une seule géométrie, des fenêtres à l'échelle de chaque façade. */
  const facades = windowsTexture(false), lit = windowsTexture(true);
  const buildingParts: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  for (const s of city.solids) {
    if (s.kind !== 'building') continue;
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const g = new THREE.BoxGeometry(w, s.h, d).translate((s.x0 + s.x1) / 2, s.h / 2, (s.z0 + s.z1) / 2);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
    const colors = new Float32Array(uv.count * 3);
    tint.setHex(s.tint);
    for (let i = 0; i < uv.count; i++) {
      const flatTop = Math.abs(normal.getY(i)) > 0.5;
      const across = Math.abs(normal.getX(i)) > 0.5 ? d : w;
      uv.setXY(i, flatTop ? 0.005 : uv.getX(i) * Math.max(1, Math.round(across / 3.2)) / 8, flatTop ? 0.005 : uv.getY(i) * Math.max(1, Math.round(s.h / 3.2)) / 8);
      const shade = flatTop ? 0.55 : 1;
      colors.set([tint.r * shade, tint.g * shade, tint.b * shade], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    buildingParts.push(g);
  }
  const buildingMat = new THREE.MeshStandardMaterial({ map: facades, vertexColors: true, roughness: 0.82, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 0, envMapIntensity: 0.25 });
  const buildings = new THREE.Mesh(mergeGeometries(buildingParts), buildingMat);
  buildings.castShadow = buildings.receiveShadow = !low;
  scene.add(buildings);

  /* Concession : vitrine sombre, places peintes, voitures exposées */
  const showroom = city.solids.find((s) => s.kind === 'showroom')!;
  const glassFront = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.1, metalness: 0.85, emissive: 0xbfd4ff, emissiveIntensity: 0.04 });
  const showroomMesh = new THREE.Mesh(box(showroom.x1 - showroom.x0, showroom.h, showroom.z1 - showroom.z0, (showroom.x0 + showroom.x1) / 2, showroom.h / 2, (showroom.z0 + showroom.z1) / 2), glassFront);
  showroomMesh.castShadow = !low;
  scene.add(showroomMesh);
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024; signCanvas.height = 128;
  const sg = signCanvas.getContext('2d')!;
  sg.fillStyle = '#0b0c0e'; sg.fillRect(0, 0, 1024, 128);
  sg.fillStyle = '#fff'; sg.textAlign = 'center'; sg.font = '600 64px sans-serif'; sg.fillText('CONCESSION', 512, 86);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(40, 7, 47.9);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  addStatic(flat(62, 39, 40, Y.walk + 0.01, 28.5), new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.9, envMapIntensity: 0.25 }));
  const lines: THREE.BufferGeometry[] = [];
  for (const x of [20, 28, 36, 44, 52, 60]) lines.push(flat(0.14, 7.4, x, Y.mark, BAY.z));
  addStatic(mergeGeometries(lines), paintWhite, false);

  /* Mobilier urbain */
  const lamps = city.lamps;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.55, metalness: 0.5 });
  const poleGeo = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.11, 7, 6).translate(0, 3.5, 0).toNonIndexed(), box(0.1, 0.08, 1.8, 0, 7, 0.9).toNonIndexed()]);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffdca0, emissiveIntensity: 0 });
  const bulbs = new THREE.InstancedMesh(box(0.28, 0.05, 0.6, 0, 6.94, 1.5), bulbMat, lamps.length);
  const pools = new THREE.InstancedMesh(flat(15, 15, 0, 0.16, 0), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), lamps.length);
  const m4 = new THREE.Object3D();
  lamps.forEach((l, i) => {
    m4.position.set(l.x, 0, l.z);
    m4.rotation.set(0, l.rot, 0);
    m4.updateMatrix();
    poles.setMatrixAt(i, m4.matrix);
    bulbs.setMatrixAt(i, m4.matrix);
    m4.translateZ(1.6);
    m4.updateMatrix();
    pools.setMatrixAt(i, m4.matrix);
  });
  scene.add(poles, bulbs, pools);

  const trees = city.solids.filter((s) => s.kind === 'tree');
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5c4531, roughness: 1, envMapIntensity: 0.2 }), trees.length);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1, flatShading: true, envMapIntensity: 0.2 }), trees.length);
  crown.castShadow = !low;
  trees.forEach((t, i) => {
    const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2;
    m4.rotation.set(0, i, 0);
    m4.position.set(x, 0, z);
    m4.scale.set(1, t.h * 0.7, 1);
    m4.updateMatrix();
    trunk.setMatrixAt(i, m4.matrix);
    m4.position.set(x, t.h * 0.8, z);
    m4.scale.setScalar(1.6 + (i % 5) * 0.28);
    m4.updateMatrix();
    crown.setMatrixAt(i, m4.matrix);
  });
  m4.scale.set(1, 1, 1);
  scene.add(trunk, crown);

    const glow = (pools.material as THREE.MeshBasicMaterial).map;
    return {
      night(on) {
        buildingMat.emissiveIntensity = on ? 0.85 : 0;
        bulbMat.emissiveIntensity = on ? 3 : 0;
        pools.visible = on;
      },
      dispose() { [facades, lit, signTex, glow].forEach((t) => t?.dispose()); },
    };
  };
  const decor = lome ? buildLomeScene(scene, lome, low) : buildGridScene();
  const m4 = new THREE.Object3D();

  /* Feux tricolores : un par voie entrante */
  type Head = { junction: number; heading: number };
  const heads: Head[] = [];
  const headMatrices: THREE.Matrix4[] = [];
  world.junctions.forEach((j, junction) => {
    for (const out of j.dirs) {
      // Le feu fait face à la voiture qui arrive, sur sa droite, avant le carrefour.
      const heading = out + Math.PI;
      const dx = Math.sin(heading), dz = Math.cos(heading);
      m4.position.set(j.x - dx * (j.r + 2.5) - dz * (j.r + 0.8), 0, j.z - dz * (j.r + 2.5) + dx * (j.r + 0.8));
      m4.rotation.set(0, Math.atan2(-dx, -dz), 0);
      m4.scale.set(1, 1, 1);
      m4.updateMatrix();
      heads.push({ junction, heading });
      headMatrices.push(m4.matrix.clone());
    }
  });
  const signalPost = new THREE.InstancedMesh(mergeGeometries([new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6).translate(0, 1.8, 0).toNonIndexed(), box(0.34, 1, 0.2, 0, 4, 0).toNonIndexed()]), new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.55, metalness: 0.5 }), heads.length);
  const bulbGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const signalBulbs = (['red', 'amber', 'green'] as const).map((color, k) => {
    const mesh = new THREE.InstancedMesh(bulbGeo.clone().translate(0, 4.32 - k * 0.32, 0.11), new THREE.MeshBasicMaterial({ color: 0xffffff }), heads.length);
    return { color, mesh };
  });
  headMatrices.forEach((m, i) => { signalPost.setMatrixAt(i, m); for (const b of signalBulbs) b.mesh.setMatrixAt(i, m); });
  scene.add(signalPost, ...signalBulbs.map((b) => b.mesh));
  const COLORS = { red: new THREE.Color(0xff2a20), amber: new THREE.Color(0xffb020), green: new THREE.Color(0x25e06a), off: new THREE.Color(0x1a1a1c) };
  const paintSignals = () => {
    heads.forEach((h, i) => {
      const state = sim.lightAt(h.junction, h.heading);
      for (const b of signalBulbs) b.mesh.setColorAt(i, b.color === state ? COLORS[b.color] : COLORS.off);
    });
    for (const b of signalBulbs) if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
  };
  paintSignals();

  /* Véhicules : celui du joueur se reconstruit quand Honorable change de véhicule */
  const shared = sharedCar();
  const paint = new THREE.MeshPhysicalMaterial({ color: sim.car.color, roughness: 0.38, metalness: 0.3, clearcoat: low ? 0 : 1, clearcoatRoughness: 0.12 });
  // Habitacle de la Nevo Q05, la voiture du joueur.
  const { cabin, wheel: steeringWheel, canvas: clusterCanvas, clusterTex, screenTex } = buildQ05Cabin(paint);
  const head = new THREE.SpotLight(0xf4f7ff, 0, 70, 0.48, 0.6, 1.1);
  head.position.set(0, 0.9, 2);
  head.target.position.set(0, 0, 14);
  let player: CarParts = buildVehicle(sim.car.kind, paint, shared);
  let playerKey = '';
  const mountPlayer = () => {
    const key = `${sim.car.kind}:${sim.car.color}`;
    if (key === playerKey) return;
    playerKey = key;
    scene.remove(player.group);
    paint.color.setHex(sim.car.color);
    player = buildVehicle(sim.car.kind, paint, shared);
    player.group.rotation.order = 'YXZ';
    if (sim.car.kind === 'berline') player.group.add(cabin);
    player.group.add(head, head.target);
    scene.add(player.group);
    applyLamps();
    setShell();
  };

  const carMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const paintFor = (c: number) => { let m = carMaterials.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.45 }); carMaterials.set(c, m); } return m; };
  const people = createPeople();
  // Les motos de la circulation ont leur pilote.
  const SEATED: Pose = { phase: 0, speed: 0, run: false, air: false, wave: 0, seated: true };
  const riders: Person[] = [];
  const others = sim.traffic.map((t, i) => {
    const car = buildVehicle(t.kind, paintFor(t.color), shared);
    if (car.seat) { const rider = people.build(lookFor(i + 100), { shadow: !low }); rider.pose(SEATED, 0); rider.group.position.copy(car.seat); car.group.add(rider.group); riders.push(rider); }
    scene.add(car.group);
    return car;
  });
  for (const s of grid?.city.solids ?? []) {
    if (s.kind !== 'parked') continue;
    const parked = buildVehicle('berline', paintFor(s.tint), shared);
    parked.group.position.set((s.x0 + s.x1) / 2, Y.road, (s.z0 + s.z1) / 2);
    scene.add(parked.group);
  }
  let parkedMeshes: CarParts[] = [], parkedVersion = -1;
  const syncParked = () => {
    if (parkedVersion === sim.parkedVersion) return;
    parkedVersion = sim.parkedVersion;
    for (const p of parkedMeshes) scene.remove(p.group);
    parkedMeshes = sim.parked.map((p) => {
      const car = buildVehicle(p.kind, paintFor(p.color), shared);
      car.group.position.set(p.x, Y.road, p.z);
      car.group.rotation.y = p.heading;
      scene.add(car.group);
      return car;
    });
  };

  /* Honorable et les passants */
  const hero: Person = people.build(HERO_LOOK, { label: HERO });
  const heroTag = hero.group.children.find((o) => o instanceof THREE.Sprite)!;
  scene.add(hero.group);
  // Un passant sur trois porte la tenue des étudiants de l'IAI.
  const walkers = sim.walkers.map((w) => { const p = people.build(w.look % 3 === 0 ? studentLook(w.look) : lookFor(w.look), { shadow: false }); scene.add(p.group); return p; });
  /** Étudiants de l'IAI : ils parcourent couloirs, galeries, cour et hall, à leur pas. */
  type Student = { person: Person; route: { y: number; p: [number, number][]; len: number[]; total: number }; s: number; speed: number; phase: number; x: number; z: number; outdoor: boolean };
  const students: Student[] = [];
  const spawnStudents = (routes: { y: number; p: [number, number][] }[], count: number, outdoor: boolean) => {
    const prepared = routes.map((r) => {
      const len = r.p.slice(1).map((q, i) => Math.hypot(q[0] - r.p[i]![0], q[1] - r.p[i]![1]));
      return { ...r, len, total: len.reduce((a, b) => a + b, 0) };
    });
    for (let i = 0; i < count; i++) {
      const n = students.length;
      const person = people.build(studentLook(n + 40), { shadow: !low && !outdoor });
      scene.add(person.group);
      const route = prepared[i % prepared.length]!;
      enroll(person);
      students.push({ person, route, s: ((n * 0.37 + i * 0.13) % 1) * route.total, speed: 1.05 + ((n * 13) % 7) * 0.07, phase: n, x: 0, z: 0, outdoor });
    }
  };
  // Dans l'enceinte de l'IAI, des étudiants vont et viennent dès le départ.
  const iaiOutside = options.lome?.buildings.find((b) => b.n === options.lome!.iai);
  /*
   * Personnages détaillés, chargés après la ville. Honorable l'est toujours ; parmi les autres, seuls les plus proches
   * de la caméra le sont, les plus lointains gardent leur silhouette simple : le téléphone n'anime que ce qui se voit.
   */
  let kit: HumanKit | null = null, seeds = 0, lodClock = 0, disposed = false;
  const registry: Person[] = [hero, ...walkers, ...riders];
  function enroll(p: Person) { registry.push(p); if (kit) p.attach(kit.make(p.look, ++seeds)); }
  loadHumans().then((k) => {
    if (disposed) return;
    kit = k;
    for (const p of registry) p.attach(k.make(p.look, ++seeds));
    hero.detail(true);
  }).catch(() => { /* les silhouettes simples restent */ });
  if (iaiOutside) spawnStudents(iaiGroundRoutes(iaiOutside.p), low ? 6 : 15, true);
  const where = new THREE.Vector3();
  const pickDetail = (dt: number) => {
    lodClock -= dt;
    if (!kit || lodClock > 0) return;
    lodClock = 0.25;
    const ranked = registry.filter((p) => p !== hero).map((p) => {
      let shown = p.group.visible;
      for (let o = p.group.parent; o && shown; o = o.parent) shown = o.visible;
      p.group.getWorldPosition(where);
      return { p, d: shown ? where.distanceTo(camera.position) : Infinity };
    }).sort((a, b) => a.d - b.d);
    const budget = low ? 5 : 14;
    ranked.forEach((r, i) => r.p.detail(i < budget && r.d < 45));
  };
  const moveStudents = (dt: number, now: number) => {
    const inside = !!sim.room?.ground;
    for (const st of students) {
      const show = st.outdoor ? !sim.room && Math.hypot(st.x - camera.position.x, st.z - camera.position.z) < 160 : inside;
      st.person.group.visible = show;
      if (!show && !st.outdoor) continue;
      // Un étudiant s'arrête quand Honorable lui barre le passage.
      const blocked = Math.hypot(st.x - sim.hero.x, st.z - sim.hero.z) < 1.1 && Math.abs(st.route.y - sim.hero.base) < 1;
      const v = blocked ? 0 : st.speed;
      st.s = (st.s + v * dt) % st.route.total;
      let left = st.s, k = 0;
      while (k < st.route.len.length - 1 && left > st.route.len[k]!) { left -= st.route.len[k]!; k++; }
      const a = st.route.p[k]!, b = st.route.p[k + 1]!, t = Math.min(1, left / (st.route.len[k] || 1));
      st.x = a[0] + (b[0] - a[0]) * t; st.z = a[1] + (b[1] - a[1]) * t;
      st.phase += v * dt * 3.4;
      st.person.group.position.set(st.x, st.route.y, st.z);
      st.person.group.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      st.person.pose({ phase: st.phase, speed: v, run: false, air: false, wave: 0, seated: false }, now);
    }
    sim.roomBodies = students.filter((st) => st.outdoor !== inside).map((st) => ({ x: st.x, z: st.z, y: st.route.y }));
  };
  const interiors = new Map<InteriorKind, ReturnType<typeof buildInterior>>();
  let iai: ReturnType<typeof buildIaiInterior> | null = null;
  /* Courses au Champion : panier, caisse, argent d'Honorable */
  let shop: ReturnType<typeof buildChampion> | null = null;
  const cashiers: Person[] = [];
  let money = Math.max(0, Math.round(options.money ?? 20000));
  let basket: { id: string; name: string; price: number }[] = [];
  let bag = 0;
  const notice = (text: string) => options.onNotice?.(text);
  /* SMART AI : conduite autonome du véhicule du joueur, avec les vraies données de la simulation. */
  const smart = new SmartAIController(sim);
  /* SMART AI pour tous les véhicules : anti-collision de la circulation, et freinage d'urgence quand le joueur conduit. */
  const fleet = new FleetSafety();
  sim.safety = fleet;
  let emergencyNotice = 0;
  smart.onAlert = (level) => { if (level >= 4) audio.warning(); else audio.tick(); };
  /*
   * Apprentissage par la conduite des joueurs : là où SMART AI bloque, un joueur qui s'en sort montre le passage.
   * Le savoir est gardé dans ce navigateur et partagé par le serveur du jeu entre tous les joueurs.
   */
  const SAVOIR_KEY = 'changan-jeu-savoir';
  const knowledge = new KnowledgeBase();
  const recorder = new DrivingRecorder();
  try { knowledge.load(JSON.parse(localStorage.getItem(SAVOIR_KEY) ?? 'null')); } catch { /* savoir local illisible : on repart de zéro */ }
  const keepLocal = () => { try { localStorage.setItem(SAVOIR_KEY, JSON.stringify(knowledge.toJSON())); } catch { /* stockage plein ou interdit */ } };
  const share = (body: object) => { if (options.savoirUrl) void fetch(options.savoirUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); };
  knowledge.onDemo = (d) => { keepLocal(); share({ type: 'demo', id: d.id, pts: d.pts }); };
  knowledge.onCritical = (c) => { keepLocal(); share({ type: 'critique', critique: c }); };
  knowledge.onResult = (id, ok) => { keepLocal(); share({ type: 'resultat', id, ok }); };
  if (options.savoirUrl) void fetch(options.savoirUrl).then((r) => (r.ok ? r.json() : null)).then((k) => { knowledge.load(k); keepLocal(); }).catch(() => {});
  smart.knowledge = knowledge;
  /** Le joueur conduit lui-même : sa conduite est observée ; un passage franchi là où SMART AI bloquait devient une démonstration. */
  const learnFromPlayer = (dt: number) => {
    if (sim.mode !== 'car' || smart.active || sim.car.kind === 'helico' || sim.room) return;
    const demo = recorder.sample(sim, dt, knowledge);
    if (demo && knowledge.addDemo(demo)) notice('SMART AI a appris un passage grâce à votre conduite : elle saura s’en sortir ici.');
  };
  /* Ce que SMART AI envisage : la trajectoire visée, et un disque coloré sous chaque danger. */
  // Ruban de 60 cm posé sur la chaussée : deux sommets par point de la trajectoire, des triangles entre eux.
  const aiLineGeo = new THREE.BufferGeometry();
  aiLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 2 * 3), 3));
  aiLineGeo.setIndex(Array.from({ length: 63 }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
  const aiLineMat = new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
  const aiLine = new THREE.Mesh(aiLineGeo, aiLineMat);
  aiLine.renderOrder = 5;
  aiLine.frustumCulled = false;
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
  const aiRings = new THREE.InstancedMesh(ringGeo, ringMat, 16);
  aiRings.renderOrder = 5;
  aiRings.frustumCulled = false;
  scene.add(aiLine, aiRings);
  const ringColor = new THREE.Color();
  /*
   * Cadres de détection, comme ceux d'une caméra de vision : la boîte 3D de chaque objet perçu, projetée à l'écran,
   * avec sa classe et sa distance. Couleur selon le danger : vert, jaune, orange, rouge. Un objet caché par un bâtiment n'est pas encadré.
   */
  const boxCanvas = document.createElement('canvas');
  boxCanvas.setAttribute('aria-hidden', 'true');
  boxCanvas.dataset.testid = 'cadres-ia';
  boxCanvas.dataset.cadres = '0';
  Object.assign(boxCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  host.appendChild(boxCanvas);
  const boxCtx = boxCanvas.getContext('2d')!;
  const corner = new THREE.Vector3();
  const BOX_COLORS = ['#35e07a', '#35e07a', '#f5d024', '#ff8a3d', '#ff4d3d'];
  const hiddenByBuilding = (x: number, z: number) => {
    const fx = sim.car.x, fz = sim.car.z, d = Math.hypot(x - fx, z - fz);
    for (let t = 3; t < d - 2; t += 2) if (sim.occludes(fx + ((x - fx) * t) / d, fz + ((z - fz) * t) / d)) return true;
    return false;
  };
  let boxesShown = true;
  const drawBoxes = () => {
    // SMART AI coupée et calque déjà vide : rien à faire à cette image.
    if (!boxesShown && !smart.active) return;
    const w = host.clientWidth, h = host.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (boxCanvas.width !== Math.round(w * dpr) || boxCanvas.height !== Math.round(h * dpr)) { boxCanvas.width = Math.round(w * dpr); boxCanvas.height = Math.round(h * dpr); }
    const g = boxCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const on = smart.active && sim.mode === 'car' && view !== 'aerial';
    if (!on) { boxCanvas.dataset.cadres = '0'; boxesShown = false; return; }
    boxesShown = true;
    let drawn = 0;
    g.font = '600 11px Archivo, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const b of smart.visual.boxes) {
      if (hiddenByBuilding(b.x, b.z)) continue;
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
      for (const along of [-b.length, b.length]) for (const side of [-b.radius, b.radius]) for (const y of [0, b.height]) {
        corner.set(b.x + fx * along - fz * side, Y.road + y, b.z + fz * along + fx * side).project(camera);
        if (corner.z > 1 || corner.z < -1) { behind = true; break; }
        const sx = (corner.x + 1) * 0.5 * w, sy = (1 - corner.y) * 0.5 * h;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      if (behind || x1 < 0 || y1 < 0 || x0 > w || y0 > h || x1 - x0 < 4) continue;
      const color = BOX_COLORS[b.level] ?? '#35e07a';
      // Cadre fin et coins appuyés.
      g.strokeStyle = color; g.lineWidth = 1.2; g.globalAlpha = 0.85;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const k = Math.min(10, (x1 - x0) / 3, (y1 - y0) / 3);
      g.lineWidth = 2.6; g.globalAlpha = 1;
      g.beginPath();
      for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) { g.moveTo(cx + dx * k, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * k); }
      g.stroke();
      drawn++;
      // Étiquette : classe et distance, seulement si le cadre est assez grand pour qu'elle reste lisible (ou s'il y a danger).
      if (x1 - x0 < 16 && b.level < 2) continue;
      const text = `${b.label} · ${b.distance} m`;
      const tw = g.measureText(text).width + 10, ty = y0 - 17 < 0 ? y1 + 1 : y0 - 17;
      g.fillStyle = color; g.fillRect(x0, ty, tw, 16);
      g.fillStyle = b.level >= 3 ? '#ffffff' : '#0b0c0e';
      g.fillText(text, x0 + 5, ty + 8.5);
    }
    g.globalAlpha = 1;
    boxCanvas.dataset.cadres = String(drawn);
  };
  const drawSmart = () => {
    const on = smart.active && sim.mode === 'car';
    aiLine.visible = aiRings.visible = on;
    if (!on) return;
    const v = smart.visual, pos = aiLineGeo.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(64, v.line.length);
    for (let i = 0; i < n; i++) {
      const a = v.line[Math.max(0, i - 1)]!, b = v.line[Math.min(n - 1, i + 1)]!;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 0.3, nz = (dx / l) * 0.3, [x, z] = v.line[i]!;
      pos.setXYZ(2 * i, x + nx, Y.road + 0.06, z + nz);
      pos.setXYZ(2 * i + 1, x - nx, Y.road + 0.06, z - nz);
    }
    pos.needsUpdate = true;
    aiLineGeo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    aiLineMat.color.setHex(smart.status.couleur === 'rouge' ? 0xff4d3d : smart.status.couleur === 'orange' ? 0xf5a524 : 0x35e07a);
    const k = Math.min(16, v.dangers.length);
    for (let i = 0; i < k; i++) {
      const d = v.dangers[i]!;
      m4.position.set(d.x, Y.road + 0.07, d.z); m4.rotation.set(0, 0, 0); m4.scale.set(d.r, 1, d.r); m4.updateMatrix();
      aiRings.setMatrixAt(i, m4.matrix);
      aiRings.setColorAt(i, ringColor.setHex(d.level >= 4 ? 0xff4d3d : d.level >= 3 ? 0xff8a3d : 0xf5a524));
    }
    m4.scale.set(1, 1, 1);
    aiRings.count = k;
    aiRings.instanceMatrix.needsUpdate = true;
    if (aiRings.instanceColor) aiRings.instanceColor.needsUpdate = true;
  };
  const basketTotal = () => basket.reduce((a, b) => a + b.price, 0);
  function refreshTill() {
    for (const sp of shop?.room.spots ?? []) if (sp.id === 'caisse') sp.label = basket.length ? `Payer ${basket.length} article${basket.length > 1 ? 's' : ''} · ${fcfa(basketTotal())}` : '';
  }
  const useSpot = (id: string | null) => {
    if (!id) return;
    if (id.startsWith('p:')) {
      const p = productById(id.slice(2));
      if (!p) return;
      if (basketTotal() + p.price > money) { notice(`Pas assez d’argent : il vous reste ${fcfa(money - basketTotal())} hors panier.`); audio.warning(); return; }
      basket.push({ id: p.id, name: p.name, price: p.price });
      notice(`${p.name} dans le panier · total ${fcfa(basketTotal())}`);
      audio.tick();
    } else if (id === 'caisse' && basket.length) {
      const total = basketTotal();
      money -= total;
      bag += basket.length;
      notice(`Payé ${fcfa(total)} pour ${basket.length} article${basket.length > 1 ? 's' : ''}. Merci, à bientôt au Champion !`);
      basket = [];
      audio.success();
    }
    refreshTill();
  };

  /* Billets à ramasser dans les rues : 1 000 F chacun */
  type Bill = { x: number; z: number; mesh: THREE.Mesh };
  const bills: Bill[] = [];
  const billTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2f8f5b'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#d9f2c4'; g.lineWidth = 6; g.strokeRect(8, 8, 240, 112);
    g.fillStyle = '#fff'; g.font = '800 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1 000 F', 128, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  {
    const billGeo = new THREE.PlaneGeometry(0.7, 0.35);
    const billMat = new THREE.MeshBasicMaterial({ map: billTex, side: THREE.DoubleSide, fog: false });
    const edges = world.edges.filter((e) => Math.hypot(e.p[e.p.length - 1]![0] - e.p[0]![0], e.p[e.p.length - 1]![1] - e.p[0]![1]) > 25);
    for (let i = 0; i < edges.length && bills.length < 30; i += Math.max(1, Math.floor(edges.length / 30))) {
      const e = edges[i]!;
      const [ax, az] = e.p[0]!, [bx, bz] = e.p[1]!;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / len, dz = (bz - az) / len, off = e.r + 1.2, t = Math.min(len * 0.5, 12);
      const x = ax + dx * t - dz * off, z = az + dz * t + dx * off;
      if (sim.solidAt(x, z) || Math.hypot(x - sim.focus.x, z - sim.focus.z) < 6) continue;
      const mesh = new THREE.Mesh(billGeo, billMat);
      mesh.position.set(x, 1, z);
      scene.add(mesh);
      bills.push({ x, z, mesh });
    }
  }
  const updateBills = (now: number) => {
    if (sim.room) return;
    const f = sim.focus, reach = sim.mode === 'car' ? 2.6 : 1.3;
    for (let i = bills.length - 1; i >= 0; i--) {
      const b = bills[i]!;
      b.mesh.rotation.y = now * 2.4 + i;
      b.mesh.position.y = 1 + Math.sin(now * 3 + i) * 0.12;
      if (Math.hypot(b.x - f.x, b.z - f.z) < reach) {
        scene.remove(b.mesh);
        bills.splice(i, 1);
        money += 1000;
        notice(`Billet ramassé : +1 000 F · ${fcfa(money)}`);
        audio.success();
      }
    }
  };
  const openRoom = () => {
    const target = sim.pendingRoom;
    if (!target) return;
    // L'IAI-Togo a son propre intérieur, d'après la vidéo de visite ; les autres bâtiments, un intérieur générique.
    const iaiBuilding = options.lome && target.n === options.lome.iai ? options.lome.buildings.find((b) => b.n === options.lome!.iai) : null;
    if (iaiBuilding) {
      if (!iai) { iai = buildIaiInterior(scene, iaiBuilding.p, iaiBuilding.hole ?? null, low); spawnStudents(iai.routes, low ? 14 : 36, false); }
      sim.enterRoom({ ...iai.room, name: 'IAI-Togo' });
      return;
    }
    if (target.n && /champion/i.test(target.n)) {
      if (!shop) {
        shop = buildChampion(scene, low);
        // Une caissière ou un caissier à chaque caisse.
        shop.staff.forEach((st, i) => {
          const p = people.build(lookFor(i * 5 + 3), { shadow: !low });
          p.group.position.set(st.x, 0, st.z);
          p.group.rotation.y = st.heading;
          scene.add(p.group);
          enroll(p);
          cashiers.push(p);
        });
      }
      sim.enterRoom({ ...shop.room, name: target.n });
      refreshTill();
      return;
    }
    const kind: InteriorKind = target.n ? 'bureau' : 'maison';
    let room = interiors.get(kind);
    if (!room) { room = buildInterior(scene, kind, low); interiors.set(kind, room); }
    sim.enterRoom({ ...room, name: target.n });
  };

  /*
   * Autres joueurs en ligne : un personnage avec son pseudo, et le véhicule qu'il conduit.
   * Ce sont des fantômes : on ne les percute pas, chacun calcule sa propre partie.
   */
  const reseau = options.reseau ?? null;
  type Remote = { person: Person; car: CarParts | null; genre: number; phase: number; spin: number };
  const remotes = new Map<number, Remote>();
  // Position interpolée des voisins proches : plus fraîche que la carte de la salle, envoyée toutes les 2 s.
  const livePos = new Map<number, { x: number; z: number }>();
  const onlinePlayers = () => {
    if (!reseau) return [];
    return reseau.joueurs().map((p) => { const l = livePos.get(p.id); return l && !p.dedans ? { ...p, x: l.x, z: l.z } : p; });
  };
  const remoteColors = [0xecedee, 0x26282c, 0x8d1f1f, 0x70747a, 0xe2b13c, 0x1c346e, 0xd9d6cf, 0x2f8f5b];
  // Les véhicules des autres sont recyclés d'un joueur à l'autre : aucun n'est reconstruit à chaque arrivée.
  const carPool = new Map<number, CarParts[]>();
  const takeCar = (genre: number, color: number) => {
    const car = carPool.get(genre)?.pop() ?? buildVehicle(genreNom(genre) as keyof typeof VEHICLES, paintFor(color), shared);
    car.group.rotation.order = 'YXZ';
    car.group.visible = true;
    if (!car.group.parent) scene.add(car.group);
    return car;
  };
  const releaseCar = (genre: number, car: CarParts) => {
    car.group.visible = false;
    const l = carPool.get(genre);
    if (l) l.push(car); else carPool.set(genre, [car]);
  };
  const sendState = (now: number) => {
    if (!reseau) return;
    const h = sim.hero, c = sim.car, foot = sim.mode === 'foot';
    const flags = foot
      ? (h.run ? DRAPEAU.course : 0) | (h.y > 0.05 ? DRAPEAU.air : 0) | (h.wave > 0 ? DRAPEAU.salut : 0) | ((h.dance & 3) << DANSE_DECALAGE)
      : TWO_WHEELS.has(c.kind) ? DRAPEAU.assis : 0;
    reseau.envoyer({
      x: foot ? h.x : c.x, z: foot ? h.z : c.z, y: foot ? h.base + h.y : c.y, cap: foot ? h.heading : c.heading, vitesse: foot ? h.speed : c.speed,
      mode: foot ? 0 : 1, genre: genreIndex(c.kind), drapeaux: flags | (sim.room ? DRAPEAU.dedans : 0),
    }, now);
  };
  const syncRemotes = (dt: number, now: number) => {
    if (!reseau) return;
    const list = sim.room ? [] : reseau.autres();
    const seen = new Set<number>();
    livePos.clear();
    for (const o of list) {
      seen.add(o.id);
      livePos.set(o.id, { x: o.etat.x, z: o.etat.z });
      let r = remotes.get(o.id);
      if (!r) {
        const person = people.build(o.apparence, { label: o.nom, shadow: false });
        scene.add(person.group);
        enroll(person);
        r = { person, car: null, genre: -1, phase: 0, spin: 0 };
        remotes.set(o.id, r);
      }
      const e = o.etat;
      if (e.mode === 1 && r.genre !== e.genre) {
        if (r.car) releaseCar(r.genre, r.car);
        r.car = takeCar(e.genre, remoteColors[o.id % remoteColors.length]!);
        r.genre = e.genre;
      } else if (e.mode === 0 && r.car) { releaseCar(r.genre, r.car); r.car = null; r.genre = -1; }
      const p = r.person;
      if (r.car) {
        r.car.group.position.set(e.x, Y.road + e.y, e.z);
        r.car.group.rotation.set(0, e.cap, 0);
        for (const w of r.car.wheels) w.rotation.x += (e.vitesse / 0.36) * dt;
        if (r.car.rotors) { r.spin += ((e.y > 0.5 || Math.abs(e.vitesse) > 0.1 ? 26 : 8) - r.spin) * Math.min(1, dt); r.car.rotors.main.rotation.y += r.spin * dt; r.car.rotors.tail.rotation.x += r.spin * 1.6 * dt; }
        // Le pilote d'un deux-roues est visible sur sa selle ; dans une voiture ou l'hélicoptère, il est caché.
        if (r.car.seat) {
          p.group.visible = true;
          const seat = r.car.seat.clone().applyEuler(r.car.group.rotation);
          p.group.position.set(e.x + seat.x, Y.road + e.y + seat.y, e.z + seat.z);
          p.group.rotation.set(0, e.cap, 0);
          p.pose({ phase: 0, speed: 0, run: false, air: false, wave: 0, seated: true }, now);
        } else p.group.visible = false;
      } else {
        p.group.visible = true;
        p.group.position.set(e.x, Y.walk + e.y, e.z);
        p.group.rotation.set(0, e.cap, 0);
        r.phase += e.vitesse * dt * (e.drapeaux & DRAPEAU.course ? 2.3 : 3.4);
        p.pose({ phase: r.phase, speed: e.vitesse, run: !!(e.drapeaux & DRAPEAU.course), air: !!(e.drapeaux & DRAPEAU.air), wave: e.drapeaux & DRAPEAU.salut ? 1 : 0, seated: false, dance: (e.drapeaux >> DANSE_DECALAGE) & 3 }, now);
      }
    }
    for (const [id, r] of remotes) {
      if (seen.has(id)) continue;
      if (r.car) releaseCar(r.genre, r.car);
      registry.splice(registry.indexOf(r.person), 1);
      r.person.dispose();
      remotes.delete(id);
    }
  };

  /* Nids-de-poule : creux sombres aux bords irréguliers, sur la chaussée */
  if (sim.potholes.length) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(14,14,15,1)'); grad.addColorStop(0.6, 'rgba(32,31,30,.95)'); grad.addColorStop(0.85, 'rgba(70,66,60,.6)'); grad.addColorStop(1, 'rgba(70,66,60,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2, r = 50 + Math.sin(k * 2.7) * 9 + Math.cos(k * 1.3) * 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, sim.potholes.length);
    sim.potholes.forEach((p, i) => { m4.position.set(p.x, Y.road + 0.012, p.z); m4.rotation.set(0, i * 1.7, 0); m4.scale.set(p.r * 2.6, 1, p.r * 2.2); m4.updateMatrix(); holes.setMatrixAt(i, m4.matrix); });
    m4.scale.set(1, 1, 1);
    holes.receiveShadow = !low;
    scene.add(holes);
  }

  /* Aire d'atterrissage de l'hélicoptère : cercle et grand H peints au sol */
  if (sim.helipad) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3a3d42'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f4d23c'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; g.font = '800 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true }));
    pad.position.set(sim.helipad.x, Y.road + 0.02, sim.helipad.z);
    pad.receiveShadow = !low;
    scene.add(pad);
  }

  /* Portique de l'étape en cours */
  const { park } = world;
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 7, 36, 1, true), new THREE.MeshBasicMaterial({ color: 0x4f86ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  scene.add(gate);

  const bayGlow = new THREE.Mesh(flat(park.halfW * 2, park.halfL * 2, 0, 0, 0), new THREE.MeshBasicMaterial({ color: 0x6f9bff, transparent: true, opacity: 0.32, depthWrite: false }));
  bayGlow.position.set(park.x, Y.mark + 0.04, park.z);
  bayGlow.rotation.y = park.heading;
  scene.add(bayGlow);

  /* Itinéraire : un ruban sur la chaussée et une colonne de lumière à l'arrivée */
  const navMat = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  let navMesh: THREE.Mesh | null = null;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 90, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x4f86ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  beacon.visible = false;
  scene.add(beacon);
  let nav: Nav | null = null;
  let navStat: ReturnType<typeof navStatus> | null = null;
  let navClock = 0, rerouteWait = 0;
  const showNav = () => {
    if (navMesh) { scene.remove(navMesh); navMesh.geometry.dispose(); navMesh = null; }
    beacon.visible = !!nav;
    if (!nav) return;
    const positions: number[] = [];
    ribbon(nav.line, 2.2, Y.mark + 0.03, positions);
    navMesh = new THREE.Mesh(flatGeometry(positions), navMat);
    scene.add(navMesh);
    beacon.position.set(nav.x, 45, nav.z);
  };
  const startNav = (name: string, x: number, z: number) => {
    const plan = planNav(world, { x: sim.focus.x, z: sim.focus.z, heading: sim.focus.heading }, { name, x, z });
    if (!plan) return false;
    if (!sim.free) sim.continueFree();
    nav = plan;
    navStat = navStatus(nav, sim.focus.x, sim.focus.z);
    showNav();
    // L'itinéraire demandé devient la destination de SMART AI : elle le suivra, demi-tour compris.
    smart.setDestination([x, z]);
    return true;
  };
  const updateNav = (dt: number) => {
    if (!nav) return;
    navClock += dt;
    rerouteWait -= dt;
    if (navClock < 0.25) return;
    navClock = 0;
    navStat = navStatus(nav, sim.focus.x, sim.focus.z);
    if (Math.hypot(nav.x - sim.focus.x, nav.z - sim.focus.z) < (sim.mode === 'foot' ? 12 : 28) || navStat.remaining < 8) {
      nav = null; navStat = null;
      showNav();
      sim.emitEvent('arrived');
    } else if (navStat.off > 30 && rerouteWait <= 0) {
      // Écart de route : l'itinéraire repart de la position actuelle.
      rerouteWait = 4;
      if (startNav(nav.name, nav.x, nav.z)) sim.emitEvent('reroute');
    }
  };

  let night = options.night;
  const applyTime = () => {
    (dome.material as THREE.MeshBasicMaterial).map = night ? skies.night : skies.day;
    (dome.material as THREE.MeshBasicMaterial).needsUpdate = true;
    (scene.fog as THREE.Fog).color.setHex(night ? 0x141a26 : 0xdfe4e2);
    scene.environmentIntensity = night ? 0.1 : 0.55;
    hemi.intensity = night ? 0.28 : 1;
    sun.intensity = night ? 0.12 : 2.6;
    sun.color.setHex(night ? 0x9db4d8 : 0xfff1dc);
    decor.night(night);
    applyLamps();
  };
  function applyLamps() {
    head.intensity = night && sim.mode === 'car' ? 90 : 0;
    const lampOn = night ? 2.4 : 0.05;
    player.head.emissiveIntensity = lampOn;
    player.tail.emissiveIntensity = night ? 1.2 : 0.1;
    for (const o of others) { o.head.emissiveIntensity = lampOn; o.tail.emissiveIntensity = night ? 1 : 0.1; }
  }

  let view: View = 'chase';
  function setShell() {
    const inside = view === 'driver' && sim.mode === 'car';
    cabin.visible = inside && sim.car.kind === 'berline';
    player.shell.forEach((o) => { o.visible = !inside; });
  }
  mountPlayer();
  applyTime();

  /* Entrées */
  const keys = new Set<string>();
  const touch = { throttle: 0, brake: 0, steer: 0, active: false, run: false, jump: false, lift: 0 };
  let keySteer = 0;
  /* Manette : sticks, gâchettes et boutons d'une manette standard (Xbox, PlayStation) */
  let padOn = false;
  const padPrev: boolean[] = [];
  const pad = { steer: 0, throttle: 0, brake: 0, run: false, jump: false, lift: 0 };
  const readPad = () => {
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g && g.connected && g.mapping === 'standard');
    Object.assign(pad, { steer: 0, throttle: 0, brake: 0, run: false, jump: false, lift: 0 });
    if (!gp) { padOn = false; return; }
    padOn = true;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const held = (i: number) => !!gp.buttons[i]?.pressed;
    const tap = (i: number) => { const on = held(i), was = padPrev[i] ?? false; padPrev[i] = on; return on && !was; };
    const foot = sim.mode === 'foot';
    pad.steer = dz(gp.axes[0] ?? 0);
    if (foot) {
      const y = dz(gp.axes[1] ?? 0);
      pad.throttle = Math.max(0, -y); pad.brake = Math.max(0, y - 0.2);
      pad.run = held(1) || held(10);
      pad.jump = tap(2);
      if (tap(3)) sim.dance();
      if (tap(4)) sim.wave();
    } else {
      pad.throttle = gp.buttons[7]?.value ?? 0;
      pad.brake = gp.buttons[6]?.value ?? 0;
      // Hélicoptère : stick droit vers le haut pour monter.
      pad.lift = -dz(gp.axes[3] ?? 0) || (held(5) ? 1 : 0);
      audio.horn(held(1));
      if (tap(4)) sim.setIndicator(-1);
      if (tap(5)) sim.setIndicator(1);
      tap(2); tap(3);
    }
    if (tap(0)) { audio.start(); if (sim.mode === 'car' && !sim.engineOn) sim.startEngine(); else sim.act(); }
    if (tap(8)) { view = view === 'chase' ? 'driver' : view === 'driver' ? 'aerial' : 'chase'; setShell(); }
    if (tap(9)) options.onPause?.();
  };
  const readInput = (dt: number): Input => {
    readPad();
    const left = keys.has('ArrowLeft') || keys.has('KeyA'), right = keys.has('ArrowRight') || keys.has('KeyD');
    const aim = right && !left ? 1 : left && !right ? -1 : 0;
    const foot = sim.mode === 'foot';
    // À pied, la rotation au clavier est immédiate ; en voiture, le volant se tourne progressivement.
    keySteer = foot ? aim : keySteer + Math.max(-dt * 3.2, Math.min(dt * 3.2, aim - keySteer));
    const jump = foot && (keys.has('Space') || touch.jump);
    const heli = !foot && sim.car.kind === 'helico';
    // Hélicoptère : Espace monte, Maj descend.
    const lift = heli ? (keys.has('Space') ? 1 : keys.has('ShiftLeft') || keys.has('ShiftRight') ? -1 : touch.lift || pad.lift) : 0;
    touch.jump = false;
    return {
      throttle: keys.has('ArrowUp') || keys.has('KeyW') ? 1 : Math.max(touch.throttle, pad.throttle),
      brake: keys.has('ArrowDown') || keys.has('KeyS') || (!foot && !heli && keys.has('Space')) ? 1 : Math.max(touch.brake, pad.brake),
      steer: Math.max(-1, Math.min(1, keySteer + touch.steer + pad.steer)),
      run: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run || pad.run,
      jump: jump || pad.jump,
      lift,
    };
  };

  /* Caméra */
  const camPos = new THREE.Vector3(sim.focus.x - Math.sin(sim.focus.heading) * 9, 4, sim.focus.z - Math.cos(sim.focus.heading) * 9);
  const camLook = new THREE.Vector3();
  const updateCamera = (dt: number) => {
    const c = sim.focus;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const shake = calm ? 0 : sim.shake;
    const room = sim.room;
    if (sim.mode === 'foot') {
      const h = sim.hero;
      if (view === 'driver') {
        camera.position.set(h.x + fx * 0.12, 1.62 + h.base + h.y, h.z + fz * 0.12);
        camera.lookAt(camera.position.x + fx * 10, 1.5 + h.base + h.y, camera.position.z + fz * 10);
        camPos.copy(camera.position);
      } else if (view === 'aerial' && !room) {
        camPos.lerp(new THREE.Vector3(h.x, 40, h.z - 18), Math.min(1, dt * 3));
        camera.position.copy(camPos);
        camera.lookAt(camPos.x, 0, camPos.z + 18);
      } else {
        // Derrière l'épaule ; à l'intérieur, la caméra reste entre les murs.
        let back = room ? 3.2 : 4.4;
        for (let d = 0.6; d <= back; d += 0.3) if (sim.solidAt(h.x - fx * d, h.z - fz * d)) { back = Math.max(0.9, d - 0.4); break; }
        const want = new THREE.Vector3(h.x - fx * back, h.base + (room ? 2.3 : 2.4), h.z - fz * back);
        if (room) { want.x = Math.max(room.x0 + 0.3, Math.min(room.x1 - 0.3, want.x)); want.z = Math.max(room.z0 + 0.3, Math.min(room.z1 - 0.3, want.z)); }
        camPos.lerp(want, Math.min(1, dt * (room || back < 4.4 ? 12 : 6)));
        camera.position.copy(camPos);
        camLook.set(h.x + fx * 1.5, h.base + 1.35 + h.y * 0.5, h.z + fz * 1.5);
        camera.lookAt(camLook);
      }
      camera.fov += ((view === 'driver' ? 70 : 62) - camera.fov) * Math.min(1, dt * 3);
    } else if (view === 'chase') {
      const speedFov = calm ? 0 : Math.min(Math.abs(c.speed) / 25, 1) * 10 + Math.min(Math.max(Math.abs(c.speed) - 25, 0) / 55, 1) * 12;
      // Plus on va vite, plus la caméra suit de près : elle ne décroche pas à 300 km/h.
      const v = Math.abs(c.speed), back = 8.2 + Math.min(v, 80) * 0.04;
      const heli = sim.car.kind === 'helico', alt = heli ? sim.car.y : 0;
      const want = new THREE.Vector3(c.x - fx * (heli ? back + 6 : back), alt + (heli ? 6 : 3.3 + Math.min(v, 80) * 0.006), c.z - fz * (heli ? back + 6 : back));
      camPos.lerp(want, Math.min(1, dt * (5 + v * 0.25)));
      camLook.set(c.x + fx * 3, alt + (heli ? 1.8 : 1.15), c.z + fz * 3);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      camera.fov += (60 + speedFov - camera.fov) * Math.min(1, dt * 3);
    } else if (view === 'aerial') {
      // Vue aérienne : le nord reste en haut, pour lire la forme des bâtiments et leur entourage.
      camPos.lerp(new THREE.Vector3(c.x, Math.max(95, sim.car.y + 70), c.z - 42), Math.min(1, dt * 3));
      camera.position.copy(camPos);
      camera.lookAt(camPos.x, 0, camPos.z + 42);
      camera.fov += (55 - camera.fov) * Math.min(1, dt * 3);
    } else {
      const moto = TWO_WHEELS.has(sim.car.kind);
      const rx = moto ? 0 : 0.38 * fz, rz = moto ? 0 : -0.38 * fx;
      const eye = player.eye;
      const alt = sim.car.kind === 'helico' ? sim.car.y : 0;
      camera.position.set(c.x + rx - fx * (moto ? 0.3 : 0.2), Y.road + alt + eye, c.z + rz - fz * (moto ? 0.3 : 0.2));
      camera.lookAt(camera.position.x + fx * 10, Y.road + alt + eye - (alt > 3 ? 1.6 : 0.13), camera.position.z + fz * 10);
      camPos.copy(camera.position);
      camera.fov += (66 - camera.fov) * Math.min(1, dt * 3);
    }
    if (shake) { camera.position.x += Math.sin(sim.time * 61) * shake * 0.14; camera.position.y += Math.sin(sim.time * 47) * shake * 0.1; }
    camera.updateProjectionMatrix();
    dome.position.copy(camera.position);
  };

  /* Combiné numérique du poste de conduite */
  const clusterCtx = clusterCanvas.getContext('2d')!;
  const drawCluster = (blink: boolean) => {
    const g = clusterCtx;
    g.fillStyle = '#05070b'; g.fillRect(0, 0, 512, 192);
    const kmh = Math.round(Math.abs(sim.car.speed) * 3.6);
    g.textAlign = 'center'; g.fillStyle = !sim.free && sim.car.speed > LIMIT + 5 / 3.6 ? '#ff6a5a' : '#f3f5f8'; g.font = '300 96px sans-serif';
    g.fillText(String(kmh), 256, 112);
    g.fillStyle = '#9aa2ad'; g.font = '22px sans-serif'; g.fillText('km/h', 256, 146);
    g.textAlign = 'left'; g.fillStyle = '#6f9bff'; g.font = '500 30px sans-serif'; g.fillText(sim.car.speed < -0.2 ? 'R' : sim.engineOn ? 'D' : 'P', 48, 112);
    if (sim.indicator && blink) { g.fillStyle = '#35e07a'; g.font = '46px sans-serif'; g.textAlign = sim.indicator < 0 ? 'left' : 'right'; g.fillText(sim.indicator < 0 ? '◀' : '▶', sim.indicator < 0 ? 40 : 472, 58); }
    clusterTex.needsUpdate = true;
  };

  /* Mini-carte */
  const xs = world.mapLines.flat().map((p) => p[0]), zs = world.mapLines.flat().map((p) => p[1]);
  const mapX0 = Math.min(...xs) - 30, mapX1 = Math.max(...xs) + 30, mapZ0 = Math.min(...zs) - 30, mapZ1 = Math.max(...zs) + 30;
  const mapScale = Math.min(1200 / (mapX1 - mapX0), 1200 / (mapZ1 - mapZ0));
  const map = document.createElement('canvas');
  map.width = Math.ceil((mapX1 - mapX0) * mapScale);
  map.height = Math.ceil((mapZ1 - mapZ0) * mapScale);
  const mg = map.getContext('2d')!;
  // Le nord en haut, et l'ouest à gauche : x augmente vers la gauche de l'écran.
  const mx = (v: number) => (mapX1 - v) * mapScale, mz = (v: number) => (mapZ1 - v) * mapScale;
  mg.strokeStyle = 'rgba(255,255,255,.4)'; mg.lineWidth = Math.max(5, 7 * mapScale); mg.lineJoin = 'round';
  for (const line of world.mapLines) {
    mg.beginPath();
    line.forEach((p, i) => { if (i) mg.lineTo(mx(p[0]), mz(p[1])); else mg.moveTo(mx(p[0]), mz(p[1])); });
    mg.stroke();
  }
  const drawMap = () => {
    const out = options.map();
    const g = out?.getContext('2d');
    if (!out || !g) return;
    g.clearRect(0, 0, out.width, out.height);
    const half = world.mapWindow ? world.mapWindow * mapScale : Math.max(map.width, map.height) / 2;
    const me = sim.room ? null : sim.focus;
    if (!me) return;
    const cx = world.mapWindow ? mx(me.x) : map.width / 2, cz = world.mapWindow ? mz(me.z) : map.height / 2;
    const k = out.width / (half * 2);
    g.drawImage(map, cx - half, cz - half, half * 2, half * 2, 0, 0, out.width, out.height);
    const sx = (v: number) => (mx(v) - cx + half) * k, sz = (v: number) => (mz(v) - cz + half) * k;
    if (!sim.free && !sim.result) {
      g.strokeStyle = '#6f9bff'; g.lineWidth = out.width / 50; g.lineJoin = 'round'; g.beginPath();
      g.moveTo(sx(me.x), sz(me.z));
      for (const s of world.steps.slice(Math.max(sim.step, 1))) g.lineTo(sx(s.x), sz(s.z));
      g.stroke();
    }
    if (nav) {
      g.strokeStyle = '#6f9bff'; g.lineWidth = out.width / 40; g.lineJoin = 'round'; g.beginPath();
      nav.line.forEach((p, i) => { if (i) g.lineTo(sx(p[0]), sz(p[1])); else g.moveTo(sx(p[0]), sz(p[1])); });
      g.stroke();
      g.fillStyle = '#ff5a4d'; g.beginPath(); g.arc(sx(nav.x), sz(nav.z), out.width / 28, 0, Math.PI * 2); g.fill();
    }
    // Les autres joueurs : un point de leur couleur et leur pseudo ; hors du cadre, une flèche au bord dans leur direction.
    if (reseau && !sim.room) {
      const r = out.width / 34, edge = out.width / 2 - r * 1.6;
      g.font = `600 ${Math.round(out.width / 14)}px sans-serif`; g.textAlign = 'center';
      for (const p of onlinePlayers()) {
        let px = sx(p.x) - out.width / 2, pz = sz(p.z) - out.height / 2;
        const outside = Math.max(Math.abs(px), Math.abs(pz)) > edge;
        if (outside) { const f = edge / Math.max(Math.abs(px), Math.abs(pz)); px *= f; pz *= f; }
        g.fillStyle = couleurJoueur(p.id); g.strokeStyle = '#0b0c0e'; g.lineWidth = out.width / 90;
        g.beginPath(); g.arc(px + out.width / 2, pz + out.height / 2, outside ? r * 0.75 : r, 0, Math.PI * 2); g.fill(); g.stroke();
        if (!outside) { g.lineWidth = out.width / 60; g.strokeText(p.nom.slice(0, 10), px + out.width / 2, pz + out.height / 2 - r * 1.5); g.fillText(p.nom.slice(0, 10), px + out.width / 2, pz + out.height / 2 - r * 1.5); }
      }
    }
    g.save();
    if (sim.mode === 'foot') {
      g.fillStyle = '#9fbfff';
      for (const p of [sim.car, ...sim.parked]) { g.beginPath(); g.arc(sx(p.x), sz(p.z), out.width / 60, 0, Math.PI * 2); g.fill(); }
    }
    g.translate(sx(me.x), sz(me.z));
    g.rotate(-me.heading + Math.PI);
    g.fillStyle = '#fff';
    const a = out.width / 28;
    g.beginPath(); g.moveTo(0, a * 1.4); g.lineTo(a, -a); g.lineTo(-a, -a); g.closePath(); g.fill();
    g.restore();
  };
  let street = '';
  const updateStreet = () => {
    if (!world.streets) return;
    let best = 18, found = '';
    for (const road of world.streets) {
      for (let i = 1; i < road.p.length; i++) {
        const a = road.p[i - 1]!, b = road.p[i]!;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((sim.focus.x - a[0]) * dx + (sim.focus.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(sim.focus.x - a[0] - t * dx, sim.focus.z - a[1] - t * dz);
        if (d < best) { best = d; found = road.n; }
      }
    }
    street = found;
  };

  /* Boucle */
  let raf = 0, last = performance.now(), hudClock = 0, signalClock = 0, tickClock = 0, paused = false, fpsAvg = 60, slowFor = 0, blinkOn = false;
  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(host);

  const syncCar = (dt: number) => {
    mountPlayer();
    syncParked();
    const c = sim.car;
    const moto = TWO_WHEELS.has(c.kind);
    // Une moto se penche selon l'accélération latérale du virage.
    const lean = moto ? Math.max(-0.6, Math.min(0.6, -Math.atan((c.speed * c.speed * Math.tan(c.steer)) / (VEHICLES[c.kind].wheelbase * 9.8)) * 0.8)) : Math.max(-0.05, Math.min(0.05, -c.steer * c.speed * 0.006));
    player.group.position.set(c.x, Y.road + c.y, c.z);
    player.group.rotation.set(calm ? 0 : Math.max(-0.035, Math.min(0.035, -c.accel * 0.006)), c.heading, calm && !moto ? 0 : lean);
    if (player.rotors) {
      // L'hélicoptère pique du nez en avançant et s'incline dans les virages ; les rotors prennent leur régime.
      const flying = c.y > 0.5;
      player.group.rotation.set(calm ? 0 : Math.max(-0.12, Math.min(0.25, (c.speed / VEHICLES.helico.max) * 0.2 + c.accel * 0.012)), c.heading, flying && !calm ? -c.aim * 0.3 : 0);
      rotorSpin += ((sim.engineOn ? 26 : 0) - rotorSpin) * Math.min(1, dt * 0.8);
      player.rotors.main.rotation.y += rotorSpin * dt;
      player.rotors.tail.rotation.x += rotorSpin * 1.6 * dt;
    }
    for (const w of player.wheels) w.rotation.x += (c.speed / 0.36) * dt;
    for (const p of player.pivots) p.rotation.y = -c.steer;
    steeringWheel.rotation.z = c.aim * 2.3;
    sim.traffic.forEach((t, i) => {
      const o = others[i]!;
      o.group.position.set(t.x, Y.road, t.z);
      o.group.rotation.y = t.heading;
      for (const w of o.wheels) w.rotation.x += (t.speed / 0.36) * dt;
    });
    // Honorable : à pied, ou en selle sur la moto ; caché dans une voiture.
    const h = sim.hero;
    const now = performance.now() / 1000;
    if (sim.mode === 'foot') {
      hero.group.visible = view !== 'driver';
      // L'étiquette se masque à l'intérieur, et quand la caméra est trop près pour la lire.
      heroTag.visible = !sim.room && camera.position.distanceTo(hero.group.position) > 3.6;
      hero.group.position.set(h.x, (sim.room ? 0 : Y.walk) + h.base + h.y, h.z);
      if (iai && sim.room?.ground) iai.follow(h.x, h.base, h.z);
      hero.group.rotation.set(0, h.heading, 0);
      heroPhase += h.speed * dt * (h.run ? 2.3 : 3.4);
      hero.pose({ phase: heroPhase, speed: h.speed, run: h.run, air: h.y > 0.05, wave: h.wave, seated: false, dance: h.dance }, now);
    } else if (moto && player.seat && view !== 'driver') {
      hero.group.visible = true;
      const seat = player.seat.clone().applyEuler(player.group.rotation);
      hero.group.position.set(c.x + seat.x, Y.road + seat.y, c.z + seat.z);
      hero.group.rotation.copy(player.group.rotation);
      hero.pose({ phase: 0, speed: 0, run: false, air: false, wave: 0, seated: true }, now);
    } else hero.group.visible = false;
    moveStudents(dt, now);
    pickDetail(dt);
    for (const r of riders) if (r.hasDetail()) r.pose(SEATED, now);
    if (sim.room?.spots) for (const c of cashiers) c.pose({ phase: 0, speed: 0, run: false, air: false, wave: 0, seated: false }, now);
    sim.walkers.forEach((w, i) => {
      const p = walkers[i]!;
      // Les passants lointains ne sont ni dessinés ni animés.
      p.group.visible = !sim.room && Math.hypot(w.x - camera.position.x, w.z - camera.position.z) < 140;
      if (!p.group.visible) return;
      p.group.position.set(w.x, Y.walk, w.z);
      p.group.rotation.y = w.heading;
      p.pose({ phase: w.phase, speed: w.speed, run: false, air: false, wave: 0, seated: false }, now);
    });
  };
  let heroPhase = 0, rotorSpin = 0;

  const syncMarkers = () => {
    const s = sim.stepInfo;
    gate.visible = !!s && s.kind === 'gate';
    bayGlow.visible = s?.kind === 'park' || sim.free;
    if (s?.kind === 'gate') gate.position.set(s.x, 3.5, s.z);
    (bayGlow.material as THREE.MeshBasicMaterial).opacity = s?.kind === 'park' ? 0.3 + Math.sin(performance.now() / 300) * 0.12 : 0.12;
  };

  const emit = () => {
    const c = sim.focus, s = sim.stepInfo;
    const parts = world.steps.length - 1;
    const aim = navStat?.look ?? (s && s.kind !== 'ignite' ? [s.x, s.z] : null);
    const bearing = aim ? Math.atan2(aim[0]! - c.x, aim[1]! - c.z) - c.heading : null;
    options.onHud({
      speed: Math.round(Math.abs(c.speed) * 3.6), gear: sim.mode === 'foot' ? (sim.hero.run ? 'course' : 'marche') : sim.car.kind === 'helico' ? (sim.car.y > 0.5 ? 'en vol' : sim.engineOn ? 'rotor' : 'au sol') : c.speed < -0.2 ? 'R' : sim.engineOn ? 'D' : 'P', engineOn: sim.engineOn, indicator: sim.indicator, blink: blinkOn, night, view, muted: audio.muted,
      text: s?.text ?? (sim.mode === 'foot' ? (sim.room ? 'Faites le tour, puis ressortez par la porte.' : 'Balade avec Honorable : marchez, prenez un véhicule ou entrez dans un bâtiment.') : sim.free ? 'Conduite libre : roulez où vous voulez.' : ''), stepNo: Math.max(sim.step, 1), stepTotal: parts, score: sim.liveScore, free: sim.free,
      bearing, distance: navStat ? Math.round(navStat.remaining) : s ? Math.round(Math.hypot(s.x - c.x, s.z - c.z)) : 0, park: sim.parkProgress, overLimit: !sim.free && sim.mode === 'car' && c.speed > LIMIT + 5 / 3.6,
      result: sim.result, street: navStat?.street ?? street, canSearch: !!world.places, nav: nav && navStat ? { name: nav.name, remaining: Math.round(navStat.remaining), next: navStat.next, toNext: Math.round(navStat.toNext) } : null, x: c.x, z: c.z, heading: c.heading, step: sim.step, hits: sim.hits, reds: sim.reds, signals: sim.signals, fps: Math.round(fpsAvg),
      mode: sim.mode, action: sim.action?.label ?? null, vehicle: VEHICLES[sim.car.kind].label, inside: sim.room ? (sim.room.ground && iai ? `${sim.room.name} · ${floorName(iai.level(sim.hero.base))}` : sim.room.name ?? 'Maison') : null, running: sim.hero.run,
      money, basket: [...basket], bag, dance: sim.hero.dance, altitude: sim.mode === 'car' && sim.car.kind === 'helico' ? Math.round(sim.car.y) : null,
      smartAvailable: smart.available(sim) && sim.free, smart: smart.active ? smart.status : null,
      online: reseau ? {
        statut: reseau.statut, salle: reseau.population.salle, total: reseau.population.total, voisins: remotes.size,
        joueurs: sim.room ? [] : onlinePlayers().map((p) => ({ id: p.id, nom: p.nom, dedans: p.dedans, x: p.x, z: p.z, distance: Math.round(Math.hypot(p.x - c.x, p.z - c.z)), cap: Math.atan2(p.x - c.x, p.z - c.z) - c.heading })).sort((a, b) => a.distance - b.distance),
      } : null, shop: !!sim.room && sim.room.spots !== undefined, pad: padOn,
    });
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (paused) return;
    // Quand SMART AI conduit, ses commandes remplacent celles du joueur (clavier, écran tactile, manette).
    let input = readInput(dt);
    if (smart.active) input = smart.update(sim, dt) ?? input;
    else if (sim.mode === 'car') {
      // Freinage d'urgence : collision imminente devant la voiture du joueur, SMART AI freine à sa place.
      const seen = fleet.emergency(sim);
      emergencyNotice -= dt;
      if (seen) {
        input = { ...input, throttle: 0, brake: 1 };
        if (emergencyNotice <= 0) { notice(`Freinage d’urgence SMART AI : ${CLASS_LABEL[seen as keyof typeof CLASS_LABEL]?.toLowerCase() ?? 'obstacle'} devant.`); audio.warning(); emergencyNotice = 3; }
      }
    }
    sim.update(dt, input);
    for (const e of sim.drain()) {
      options.onEvent(e);
      if (e === 'gate') continue;
      if (e === 'arrived') { audio.success(); continue; }
      if (e === 'reroute') continue;
      if (e === 'room') { openRoom(); continue; }
      if (e === 'exit' || e === 'board' || e === 'outside') { setShell(); applyLamps(); if (e === 'outside' && basket.length) { basket = []; refreshTill(); notice('Articles non payés reposés en rayon.'); } if (e === 'board' && ['sportive', 'coupe', 'luxe', 'taxi', 'fourgon'].includes(sim.car.kind)) notice(`${VEHICLES[sim.car.kind].label} : modèle stylisé du Car Kit de Kenney (CC0).`); continue; }
      if (e === 'lift') { audio.tick(); continue; }
      if (e === 'use') { useSpot(sim.used); continue; }
      if (e === 'nid') { audio.hit(); continue; }
      if (e === 'hit') { audio.hit(); recorder.noteHit(); }
      else if (e === 'red' || e === 'speed') audio.warning();
      else audio.success();
    }
    updateNav(dt);
    audio.engine(sim.engineOn && sim.mode === 'car', sim.car.speed, sim.mode === 'car' ? input.throttle : 0);
    tickClock += dt;
    if (tickClock > 0.38) { tickClock = 0; blinkOn = !blinkOn; if (sim.indicator) audio.tick(); }
    const on = (side: number) => (sim.indicator === side && blinkOn ? 3 : 0.05);
    player.left.emissiveIntensity = on(-1);
    player.right.emissiveIntensity = on(1);
    player.tail.emissiveIntensity = sim.mode === 'car' && input.brake > 0 && sim.car.speed > 0 ? 3 : night ? 1.2 : 0.1;
    if (player.rotors) { player.left.emissiveIntensity = player.right.emissiveIntensity = sim.engineOn ? 2.5 : 0.05; player.tail.emissiveIntensity = sim.engineOn && blinkOn ? 3 : 0.1; }

    syncCar(dt);
    learnFromPlayer(dt);
    drawSmart();
    sendState(now);
    syncRemotes(dt, now / 1000);
    updateBills(now / 1000);
    syncMarkers();
    updateCamera(dt);
    if (!low) {
      sun.position.set(sim.focus.x + 60, 130, sim.focus.z - 45);
      sun.target.position.set(sim.focus.x, 0, sim.focus.z);
    }
    signalClock += dt;
    if (signalClock > 0.25) { signalClock = 0; paintSignals(); }

    renderer.render(scene, camera);
    drawBoxes();

    fpsAvg += (1 / Math.max(dt, 1 / 240) - fpsAvg) * 0.04;
    if (fpsAvg < 26) slowFor += dt; else slowFor = 0;
    if (slowFor > 3) {
      slowFor = 0;
      // Un téléphone trop juste perd les ombres d'abord, puis de la définition.
      if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; sun.castShadow = false; } else if (ratio > 0.7) { ratio = Math.max(0.7, ratio - 0.25); renderer.setPixelRatio(ratio); renderer.setSize(host.clientWidth, host.clientHeight); }
    }
    hudClock += dt;
    if (hudClock > 0.1) {
      hudClock = 0;
      updateStreet();
      if (!sim.room) decor.near?.(sim.focus.x, sim.focus.z);
      emit();
      drawMap();
      if (view === 'driver' && sim.mode === 'car') drawCluster(blinkOn);
    }
  };
  raf = requestAnimationFrame(frame);
  emit();






  return {
    touch,
    press(code: string) { keys.add(code); },
    release(code: string) { keys.delete(code); },
    releaseAll() { keys.clear(); touch.throttle = touch.brake = touch.steer = touch.lift = 0; audio.horn(false); },
    start() { audio.start(); },
    ignite() { audio.start(); sim.startEngine(); emit(); },
    horn(on: boolean) { audio.horn(on); },
    indicator(side: -1 | 1) { sim.setIndicator(side); emit(); },
    toggleView() { view = view === 'chase' ? 'driver' : view === 'driver' ? 'aerial' : 'chase'; setShell(); emit(); },
    act() { audio.start(); sim.act(); emit(); },
    wave() { sim.wave(); },
    dance() { sim.dance(); emit(); },
    emptyBasket() { if (!basket.length) return; basket = []; refreshTill(); notice('Panier vidé : les articles retournent en rayon.'); emit(); },
    toggleNight() { night = !night; applyTime(); emit(); },
    /** Active ou coupe SMART AI ; renvoie son nouvel état. */
    toggleSmartAI() {
      if (!smart.active && !sim.free) return false;
      const on = smart.setActive(!smart.active, sim);
      recorder.reset();
      notice(on ? 'SMART AI activée : l’IA conduit, vos commandes sont en pause.' : 'SMART AI désactivée : vous reprenez le volant.');
      keySteer = 0;
      emit();
      return on;
    },
    toggleMute() { audio.setMuted(!audio.muted); emit(); },
    setPaused(p: boolean) { paused = p; last = performance.now(); if (p) { keys.clear(); audio.pause(); } else audio.resume(); },
    continueFree() { sim.continueFree(); emit(); },
    places() { return world.places ?? []; },
    /** Connexion au jeu en ligne (discussion, voix, joueurs), ou null en partie seule. */
    get reseau() { return reseau; },
    navigate(name: string, x: number, z: number) { const ok = startNav(name, x, z); emit(); return ok; },
    clearNav() { nav = null; navStat = null; showNav(); smart.setDestination(null); emit(); },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      audio.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((mat) => mat.dispose());
      });
      decor.dispose();
      people.dispose();
      disposed = true;
      iai?.dispose();
      shop?.dispose();
      reseau?.fermer();
      billTex.dispose();
      [skies.day, skies.night, clusterTex, screenTex].forEach((t) => t.dispose());
      scene.environment?.dispose();
      pmrem.dispose();
      envScene.clear();
      renderer.dispose();
      renderer.domElement.remove();
      boxCanvas.remove();
    },
  };
}
export type Game = ReturnType<typeof createGame>;
