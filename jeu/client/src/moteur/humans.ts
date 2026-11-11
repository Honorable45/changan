import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Look, Pose } from './people';

/**
 * Personnages détaillés : corps, coiffures et animations de Quaternius (CC0), habillés dans le jeu.
 * Les vêtements sont peints sur le corps d'après les os qui le portent (chemise, pantalon ou jupe, chaussures),
 * la cravate et la ceinture d'après la position au repos : aucun modèle de vêtement n'est chargé.
 */
export type Human = { root: THREE.Object3D; update: (p: Pose, time: number) => void; dispose: () => void };
type Motion = 'idle' | 'walk' | 'jog' | 'sprint' | 'drive' | 'jump' | 'talk' | 'dance1' | 'dance2';
const CLIPS: Record<Motion, string> = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', drive: 'Driving_Loop', jump: 'Jump_Loop', talk: 'Idle_Talking_Loop', dance1: 'Danse_Groove', dance2: 'Danse_Bras' };
/** Vitesse de marche de chaque animation, en m/s, pour caler le pas sur le déplacement. */
const PACE: Partial<Record<Motion, number>> = { walk: 1.35, jog: 3.4, sprint: 6 };
const HAIR = { ras: 'cheveux-ras', raie: 'cheveux-raie', chignon: 'cheveux-chignon', longs: 'cheveux-longs' } as const;
type HairName = keyof typeof HAIR;

const REGION = { skin: 0, shirt: 1, legs: 2, shoes: 3 };
function regionOf(name: string) {
  if (/^(foot|ball)/.test(name)) return REGION.shoes;
  if (/^(pelvis|thigh|calf)/.test(name)) return REGION.legs;
  if (/^(spine|clavicle|upperarm|lowerarm)/.test(name)) return REGION.shirt;
  return REGION.skin;
}

/** Repos des os, dans l'espace du maillage : leur position au moment de la liaison. */
function restPositions(mesh: THREE.SkinnedMesh) {
  const out = new Map<string, THREE.Vector3>();
  mesh.skeleton.bones.forEach((b, i) => out.set(b.name, new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i]!.clone().invert())));
  return out;
}

/**
 * Corps plus ordinaires que les proportions « super-héros » du pack : bras, cuisses et torse resserrés vers leurs os, au repos.
 * Écrit aussi la région de vêtement de chaque sommet.
 */
function prepareBody(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const idx = g.getAttribute('skinIndex') as THREE.BufferAttribute, wgt = g.getAttribute('skinWeight') as THREE.BufferAttribute;
  const rest = restPositions(mesh);
  const names = mesh.skeleton.bones.map((b) => b.name);
  const child: Record<string, string> = { upperarm_l: 'lowerarm_l', upperarm_r: 'lowerarm_r', lowerarm_l: 'hand_l', lowerarm_r: 'hand_r', thigh_l: 'calf_l', thigh_r: 'calf_r', calf_l: 'foot_l', calf_r: 'foot_r' };
  const pull: Record<string, number> = { upperarm: 0.76, lowerarm: 0.84, thigh: 0.88, calf: 0.9 };
  const region = new Float32Array(pos.count);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  const spine = rest.get('spine_03') ?? new THREE.Vector3(0, 1.4, 0);
  for (let i = 0; i < pos.count; i++) {
    const score = [0, 0, 0, 0];
    let top = '', best = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (!w) continue;
      const n = names[idx.getComponent(i, k)] ?? '';
      score[regionOf(n)] += w;
      if (w > best) { best = w; top = n; }
    }
    region[i] = score.indexOf(Math.max(...score));
    v.fromBufferAttribute(pos, i);
    const kind = top.replace(/_[lr]$/, '');
    if (pull[kind] && child[top] && rest.get(top) && rest.get(child[top]!)) {
      a.copy(rest.get(top)!); b.copy(rest.get(child[top]!)!);
      const t = THREE.MathUtils.clamp(q.copy(v).sub(a).dot(b.clone().sub(a)) / b.distanceToSquared(a), 0, 1);
      q.copy(a).lerp(b, t);
      v.sub(q).multiplyScalar(pull[kind]!).add(q);
    } else if (/^(spine_02|spine_03|clavicle)/.test(top)) {
      v.x *= 0.84;
      v.z = spine.z + (v.z - spine.z) * 0.88;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
  // Repères du visage au repos : le bout du nez (point le plus en avant de la tête) et la demi-largeur de la tête à sa hauteur, oreilles comprises.
  const headY = rest.get('Head')?.y ?? 0.75;
  const nose = new THREE.Vector3(0, 0, -Infinity);
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (v.y > headY && v.z > nose.z) nose.copy(v); }
  let halfW = 0;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (Math.abs(v.y - nose.y) < 0.03 && v.y > headY - 0.02) halfW = Math.max(halfW, Math.abs(v.x)); }
  rest.set('__nose', nose.clone().setX(halfW));
  return rest;
}

/** Matériau de peau du pack, auquel s'ajoutent les vêtements peints. */
function dressMaterial(base: THREE.MeshStandardMaterial, rest: Map<string, THREE.Vector3>) {
  const m = base.clone();
  const u = {
    uShirt: { value: new THREE.Color() }, uLegs: { value: new THREE.Color() }, uShoes: { value: new THREE.Color() }, uTie: { value: new THREE.Color() },
    uTieOn: { value: 0 }, uSkirt: { value: 0 }, uSkin: { value: new THREE.Color(1, 1, 1) },
    uNeck: { value: (rest.get('neck_01')?.y ?? 1.5) - 0.02 },
    uFace: { value: null as THREE.Texture | null }, uFaceOn: { value: 0 },
    // Axe du visage (x), demi-largeur de la tête, hauteur et avancée du bout du nez, dans l'espace du corps au repos.
    uFaceBox: { value: new THREE.Vector4() }, uWaist: { value: (rest.get('spine_01')?.y ?? 1.05) - 0.04 }, uKnee: { value: (rest.get('calf_l')?.y ?? 0.5) + 0.04 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vRegion;\nvarying vec3 vBind;\nvarying vec3 vBindN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvBind = position;\nvBindN = normal;\n// Le tissu flotte un peu au-dessus de la peau.\ntransformed += normal * (aRegion > 0.5 && aRegion < 1.5 ? 0.018 : (aRegion > 1.5 ? 0.012 : 0.0));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRegion;\nvarying vec3 vBind;\nvarying vec3 vBindN;\nuniform vec3 uShirt; uniform vec3 uLegs; uniform vec3 uShoes; uniform vec3 uTie; uniform vec3 uSkin;\nuniform float uTieOn; uniform float uSkirt; uniform float uNeck; uniform float uWaist; uniform float uKnee;\nuniform sampler2D uFace; uniform float uFaceOn; uniform vec4 uFaceBox;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n// Le tissu ne colle pas aux muscles : le relief de la peau y est presque effacé.\nif (vRegion > 0.5 || (vBind.y > uWaist && vBind.y < uNeck - 0.06 && abs(vBind.x) < 0.72)) normal = normalize(mix(normal, nonPerturbedNormal, 0.85));')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float region = floor(vRegion + 0.5);
        // Le col s'arrête sous le cou ; la jupe au-dessus du genou.
        // Chemise : du bassin à la base du cou, épaules comprises, jusqu'aux poignets (bras tendus au repos).
        bool shirtZone = vBind.y > uWaist && abs(vBind.x) < 0.72 && (abs(vBind.x) > 0.08 ? vBind.y < uNeck + 0.07 : vBind.y < uNeck - 0.005);
        if (region <= 1.0 && shirtZone) region = 1.0; else if (region == 1.0) region = 0.0;
        // Col de chemise : une bande autour de la base du cou.
        bool collar = region == 0.0 && abs(vBind.x) < 0.1 && vBind.y > uNeck - 0.01 && vBind.y < uNeck + 0.035 && vBind.y < uNeck + 0.035 - abs(vBind.x) * 0.15;
        if (collar) region = 1.0;
        if (region == 2.0 && uSkirt > 0.5 && vBind.y < uKnee) region = 0.0;
        float weave = 0.93 + 0.07 * sin(vBind.y * 900.0) * sin(vBind.x * 900.0);
        if (region == 0.0) {
          diffuseColor.rgb *= uSkin;
          // Visage photographié, projeté de face sur la tête : ses yeux sur les yeux du modèle, son menton sur le menton.
          // Sur la photo (256 × 312) : bout du nez à (0,491 ; 0,585), 147 px d'une oreille à l'autre sur 168 px de large.
          float span = 2.0 * uFaceBox.y;
          if (uFaceOn > 0.5 && vBind.y > uFaceBox.z - 0.7 * span && vBindN.z > 0.0) {
            vec2 fuv = vec2(0.491 + (vBind.x - uFaceBox.x) / span * 0.875,
                            1.0 - (0.585 + (uFaceBox.z - vBind.y) / span * (147.0 / 205.0)));
            vec4 photo = texture2D(uFace, clamp(fuv, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, photo.rgb, photo.a * smoothstep(0.05, 0.45, vBindN.z));
          }
          // Coupe très courte, comme sur la vidéo : cheveux peints sur le crâne, ligne nette au front, plus basse derrière.
          if (uFaceOn > 0.5) {
            float hairY = uFaceBox.z + span * mix(0.12, 0.6, smoothstep(-0.35, 0.65, vBindN.z));
            float grain = 0.75 + 0.25 * fract(sin(dot(floor(vBind.xz * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.010, 0.009) * grain, smoothstep(hairY - 0.004, hairY + 0.006, vBind.y));
          }
        }
        else if (region == 1.0) {
          vec3 cloth = uShirt;
          // Cravate : sur le devant, du col à la ceinture, plus large vers le bas.
          float span = uNeck - uWaist;
          float t = (uNeck - vBind.y) / span;
          float tieW = mix(0.018, 0.034, smoothstep(0.08, 0.55, t));
          if (uTieOn > 0.5 && vBindN.z > 0.25 && t > 0.0 && t < 0.62 && abs(vBind.x) < tieW) cloth = uTie;
          // Col un peu plus clair, en haut de la chemise.
          if (t < 0.035) cloth *= 1.12;
          diffuseColor.rgb = cloth * weave;
        } else if (region == 2.0) {
          vec3 cloth = uLegs;
          if (uSkirt < 0.5 && abs(vBind.y - uWaist) < 0.022) cloth = vec3(0.05);
          diffuseColor.rgb = cloth * weave;
        } else diffuseColor.rgb = uShoes * (0.9 + 0.1 * weave);`);
  };
  m.customProgramCacheKey = () => 'habit';
  return { material: m, uniforms: u };
}

/**
 * Deux danses composées dans le jeu, à partir de la pose de repos de l'animation « Idle » :
 * chaque os reçoit une rotation exprimée dans le repère du personnage (x à sa gauche, y en haut, z devant),
 * convertie dans le repère de l'os. Le tempo est de 120 battements par minute.
 */
function danceClips(scene: THREE.Object3D, idle: THREE.AnimationClip) {
  const rig = cloneSkinned(scene);
  const bones = new Map<string, THREE.Object3D>();
  rig.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o); });
  const base = new Map<string, THREE.Quaternion>();
  let pelvisY: number[] | null = null;
  for (const t of idle.tracks) {
    const [name, prop] = t.name.split('.');
    const bone = bones.get(name!);
    if (!bone) continue;
    if (prop === 'quaternion') { const q = new THREE.Quaternion().fromArray(t.values as unknown as number[], 0); bone.quaternion.copy(q); base.set(name!, q); }
    else if (prop === 'position') { bone.position.fromArray(t.values as unknown as number[], 0); pelvisY = [bone.position.x, bone.position.y, bone.position.z]; }
  }
  rig.updateMatrixWorld(true);
  const world = new Map<string, THREE.Quaternion>();
  for (const [name, bone] of bones) world.set(name, bone.getWorldQuaternion(new THREE.Quaternion()));
  const BEAT = 0.5, BEATS = 8, STEPS = 64, duration = BEAT * BEATS;
  const e = new THREE.Euler(), r = new THREE.Quaternion(), w = new THREE.Quaternion(), out = new THREE.Quaternion();
  type Move = (t: number) => [number, number, number];
  const build = (name: string, moves: Record<string, Move>, bob: (t: number) => number) => {
    const times = Array.from({ length: STEPS + 1 }, (_, i) => (i / STEPS) * duration);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [bone, move] of Object.entries(moves)) {
      const q0 = base.get(bone), W = world.get(bone);
      if (!q0 || !W) continue;
      const values: number[] = [];
      for (const t of times) {
        const [x, y, z] = move(t);
        r.setFromEuler(e.set(x, y, z, 'YXZ'));
        // Rotation r appliquée dans le repère du personnage : q' = q0 · W⁻¹ · r · W.
        w.copy(W).invert().multiply(r).multiply(W);
        out.copy(q0).multiply(w);
        values.push(out.x, out.y, out.z, out.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    }
    // Les os sans mouvement propre gardent la pose de repos.
    for (const t of idle.tracks) {
      const [bone, prop] = t.name.split('.');
      if (prop === 'quaternion' && !moves[bone!]) tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0], Array.from(base.get(bone!)!.toArray())));
    }
    if (pelvisY) {
      const values: number[] = [];
      for (const t of times) values.push(pelvisY[0]!, pelvisY[1]! - bob(t), pelvisY[2]!);
      tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, values));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };
  const TAU = Math.PI * 2;
  const beat = (t: number) => Math.abs(Math.sin((Math.PI * t) / BEAT));
  const sway = (t: number) => Math.sin((TAU * t) / (2 * BEAT));
  const groove = build('Danse_Groove', {
    pelvis: (t) => [0, 0.28 * sway(t), 0.06 * sway(t)],
    spine_02: (t) => [0.06 * beat(t), -0.1 * sway(t), -0.12 * sway(t)],
    neck_01: (t) => [0.16 * beat(t), 0.1 * sway(t), 0],
    upperarm_l: (t) => [-0.75 - 0.35 * sway(t), 0, 0.25],
    upperarm_r: (t) => [-0.75 + 0.35 * sway(t), 0, -0.25],
    lowerarm_l: (t) => [-1.25 + 0.25 * beat(t), 0, 0],
    lowerarm_r: (t) => [-1.25 + 0.25 * beat(t), 0, 0],
    thigh_l: (t) => [-0.28 * beat(t) * (1 + 0.5 * sway(t)), 0, 0],
    thigh_r: (t) => [-0.28 * beat(t) * (1 - 0.5 * sway(t)), 0, 0],
    calf_l: (t) => [0.55 * beat(t) * (1 + 0.5 * sway(t)), 0, 0],
    calf_r: (t) => [0.55 * beat(t) * (1 - 0.5 * sway(t)), 0, 0],
  }, (t) => 0.07 * beat(t));
  const hands = build('Danse_Bras', {
    pelvis: (t) => [0, 0.15 * sway(t), 0.14 * sway(t)],
    spine_02: (t) => [-0.05, 0, -0.16 * sway(t)],
    neck_01: (t) => [0.1 * beat(t), 0, 0.14 * sway(t)],
    upperarm_l: (t) => [0, 0, 2.45 + 0.35 * sway(t)],
    upperarm_r: (t) => [0, 0, -2.45 + 0.35 * sway(t)],
    lowerarm_l: (t) => [0, 0, 0.35 + 0.3 * beat(t)],
    lowerarm_r: (t) => [0, 0, -0.35 - 0.3 * beat(t)],
    thigh_l: (t) => [-0.45 * Math.max(0, sway(t)), 0, 0.08],
    thigh_r: (t) => [-0.45 * Math.max(0, -sway(t)), 0, -0.08],
    calf_l: (t) => [0.8 * Math.max(0, sway(t)), 0, 0],
    calf_r: (t) => [0.8 * Math.max(0, -sway(t)), 0, 0],
  }, (t) => 0.05 * beat(t));
  return [groove, hands];
}

/** Coiffure liée au squelette du personnage : mêmes noms d'os, même pose de repos. */
function attachHair(target: THREE.Object3D, bones: Map<string, THREE.Bone>, gltf: GLTF, tint: number) {
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const hair = new THREE.SkinnedMesh(mesh.geometry, (mesh.material as THREE.MeshStandardMaterial).clone());
    (hair.material as THREE.MeshStandardMaterial).color.setHex(tint);
    const skeleton = new THREE.Skeleton(mesh.skeleton.bones.map((b) => bones.get(b.name)!), mesh.skeleton.boneInverses);
    hair.bind(skeleton, mesh.bindMatrix);
    hair.frustumCulled = false;
    target.add(hair);
  });
}

export async function loadHumans(base = '/game/humains/') {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = (name: string) => loader.loadAsync(`${base}${name}.glb`);
  const [homme, femme, anims, ...hairs] = await Promise.all([load('homme'), load('femme'), load('animations'), ...Object.values(HAIR).map(load)]);
  // Visage d'Honorable, tiré de la vidéo fournie par l'utilisateur ; sans ce fichier, le visage du modèle reste.
  const face = await new THREE.TextureLoader().loadAsync(`${base}visage-honorable.png`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; }).catch(() => null);
  const hairOf = new Map(Object.keys(HAIR).map((k, i) => [k as HairName, hairs[i]!]));
  const bodies = { homme, femme };
  const rests = new Map<GLTF, Map<string, THREE.Vector3>>();
  for (const g of [homme, femme]) {
    let body: THREE.SkinnedMesh | null = null;
    g.scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && /hero/i.test(m.name)) body = m; });
    if (!body) continue;
    const rest = prepareBody(body);
    rests.set(g, rest);
  }

  // Les animations ne gardent que les rotations, plus le mouvement du bassin recalé sur nos corps.
  const animPelvis = new THREE.Vector3();
  anims.scene.traverse((o) => { if (o.name === 'pelvis') animPelvis.copy(o.position); });
  const clipFor = (g: GLTF) => {
    let bodyPelvis = new THREE.Vector3();
    g.scene.traverse((o) => { if (o.name === 'pelvis') bodyPelvis = o.position.clone(); });
    const out = new Map<string, THREE.AnimationClip>();
    for (const clip of anims.animations) {
      const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position').map((t) => {
        if (t.name !== 'pelvis.position') return t;
        const copy = t.clone();
        for (let i = 0; i < copy.values.length; i += 3) {
          copy.values[i] = copy.values[i]! - animPelvis.x + bodyPelvis.x;
          copy.values[i + 1] = copy.values[i + 1]! - animPelvis.y + bodyPelvis.y;
          copy.values[i + 2] = copy.values[i + 2]! - animPelvis.z + bodyPelvis.z;
        }
        return copy;
      });
      out.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks));
    }
    for (const c of danceClips(g.scene, out.get('Idle_Loop')!)) out.set(c.name, c);
    return out;
  };
  const clips = new Map<GLTF, Map<string, THREE.AnimationClip>>([[homme, clipFor(homme)], [femme, clipFor(femme)]]);

  /** Un personnage habillé selon son apparence ; les cheveux suivent le genre et un tirage fixe. */
  function make(look: Look, seed: number): Human {
    const female = look.dress;
    const g = female ? bodies.femme : bodies.homme;
    const root = cloneSkinned(g.scene);
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); });
    const materials: THREE.Material[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      // Le visage photographié a ses propres sourcils.
      if (look.face && face && /eyebrow/i.test(mesh.name)) { mesh.visible = false; return; }
      if (/eyebrow|face$/i.test(mesh.name) && !/eyes/i.test(mesh.name)) { const brow = (mesh.material as THREE.MeshStandardMaterial).clone(); brow.color.setHex(0x1a1410); mesh.material = brow; materials.push(brow); }
      if (!/hero/i.test(mesh.name)) return;
      const { material, uniforms } = dressMaterial(mesh.material as THREE.MeshStandardMaterial, rests.get(g)!);
      uniforms.uShirt.value.setHex(look.top).convertSRGBToLinear();
      uniforms.uLegs.value.setHex(look.bottom).convertSRGBToLinear();
      uniforms.uShoes.value.setHex(look.shoes).convertSRGBToLinear();
      uniforms.uTie.value.setHex(look.tie ?? 0).convertSRGBToLinear();
      uniforms.uTieOn.value = look.tie !== undefined ? 1 : 0;
      uniforms.uSkirt.value = female && look.bottom === 0x17181b ? 1 : 0;
      // Teinte de peau : la texture du pack, éclaircie ou foncée selon le personnage.
      const shade = 0.5 + ((seed * 37) % 11) * 0.028;
      uniforms.uSkin.value.setRGB(shade, shade * 0.9, shade * 0.85);
      const nose = rests.get(g)!.get('__nose');
      if (look.face && face && nose) {
        uniforms.uFaceBox.value.set(0, nose.x, nose.y, nose.z);
        uniforms.uFace.value = face;
        uniforms.uFaceOn.value = 1;
        if (look.skinShade) uniforms.uSkin.value.setRGB(...look.skinShade);
      }
      mesh.material = material;
      materials.push(material);
    });
    const r = Math.abs(Math.sin(seed * 91.7)) % 1;
    const hair: HairName = look.face ? 'ras' : female ? (r < 0.5 ? 'chignon' : 'longs') : r < 0.5 ? 'ras' : 'raie';
    if (!(look.face && face)) attachHair(root, bones, hairOf.get(hair)!, 0x241a14);

    const mixer = new THREE.AnimationMixer(root);
    const set = clips.get(g)!;
    const actions = new Map<Motion, THREE.AnimationAction>();
    for (const [m, name] of Object.entries(CLIPS) as [Motion, string][]) { const c = set.get(name); if (c) actions.set(m, mixer.clipAction(c)); }
    let current: Motion | null = null, last = -1;
    const play = (m: Motion) => {
      if (m === current) return;
      const next = actions.get(m);
      if (!next) return;
      next.reset().play();
      if (current) actions.get(current)?.crossFadeTo(next, 0.25, false);
      current = m;
    };
    play('idle');
    return {
      root,
      update(p, time) {
        const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, time - last));
        last = time;
        const v = Math.abs(p.speed);
        const m: Motion = p.seated ? 'drive' : p.air ? 'jump' : p.wave > 0 ? 'talk' : p.dance && v < 0.15 ? (p.dance === 1 ? 'dance1' : 'dance2') : v < 0.15 ? 'idle' : p.run ? (v > 5 ? 'sprint' : 'jog') : v > 2.6 ? 'jog' : 'walk';
        play(m);
        const pace = PACE[m];
        const a = actions.get(m);
        if (a) a.timeScale = pace ? THREE.MathUtils.clamp(v / pace, 0.5, 1.6) * Math.sign(p.speed || 1) : 1;
        mixer.update(dt);
      },
      dispose() { mixer.stopAllAction(); materials.forEach((m) => m.dispose()); },
    };
  }
  return { make };
}
export type HumanKit = Awaited<ReturnType<typeof loadHumans>>;
