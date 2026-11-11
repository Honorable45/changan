import * as THREE from 'three';
import type { Human } from './humans';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Personnages stylisés, construits en code : Honorable et les passants. Aucun n'est le portrait d'une personne réelle. */
export type Look = { skin: number; top: number; bottom: number; hair: number; shoes: number; dress: boolean; cap: number | null; tie?: number; face?: boolean; skinShade?: [number, number, number] };
export type Pose = { phase: number; speed: number; run: boolean; air: boolean; wave: number; seated: boolean; dance?: number };
/** Un personnage simple, en pavés, que remplace de près un personnage détaillé quand il est chargé. */
export type Person = { group: THREE.Group; look: Look; pose: (p: Pose, time: number) => void; attach: (h: Human) => void; detail: (on: boolean) => void; hasDetail: () => boolean; dispose: () => void };

const SKINS = [0x5a3a26, 0x6b4630, 0x7a5236, 0x4a2f1f, 0x8a5f3f, 0x3f281b];
const TOPS = [0xd9482b, 0x2a6fb0, 0xf2c14e, 0x2f8f5b, 0xf4f2ec, 0x8e44ad, 0xe67e22, 0x1a9c8a, 0x9b2335, 0x3d4a5c];
const BOTTOMS = [0x22262c, 0x3b3f46, 0x2c3e66, 0x6b5a45, 0xd8d2c4, 0x4a5a3a];

/** Honorable, d'après sa vidéo : son visage, cheveux ras, chemise bleu clair à col, cravate bleu nuit presque noire, pantalon noir. */
export const HERO_LOOK: Look = { skin: 0x4a3226, top: 0x93bde6, bottom: 0x17181b, hair: 0x0e0d0c, shoes: 0x111112, dress: false, cap: null, tie: 0x1c2738, face: true, skinShade: [0.3, 0.245, 0.235] };

/** Tenue des étudiants de l'IAI, la même que celle d'Honorable : jupe noire pour certaines étudiantes. */
export function studentLook(i: number): Look {
  const r = (k: number) => Math.abs(Math.sin(i * 7.31 + k * 41.7) * 24634.6345) % 1;
  const skirt = r(1) < 0.4;
  return { skin: SKINS[Math.floor(r(2) * SKINS.length)]!, top: 0x9cc8ec, bottom: 0x17181b, hair: 0x120f0d, shoes: 0x111112, dress: skirt, cap: null, tie: 0x0c0c0e };
}

export function lookFor(i: number): Look {
  const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const dress = r(1) < 0.35;
  return {
    skin: SKINS[Math.floor(r(2) * SKINS.length)]!, top: TOPS[Math.floor(r(3) * TOPS.length)]!, bottom: dress ? TOPS[Math.floor(r(4) * TOPS.length)]! : BOTTOMS[Math.floor(r(4) * BOTTOMS.length)]!,
    hair: 0x120f0d, shoes: r(5) < 0.5 ? 0x1b1b1d : 0x7a5a3c, dress, cap: !dress && r(6) < 0.25 ? TOPS[Math.floor(r(7) * TOPS.length)]! : null,
  };
}

export function createPeople() {
  // Un seul matériau à couleurs par sommet : chaque personnage tient en cinq maillages.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const geo = {
    leg: new THREE.BoxGeometry(0.15, 0.86, 0.17).translate(0, -0.43, 0),
    shoe: new THREE.BoxGeometry(0.15, 0.08, 0.26).translate(0, -0.87, 0.04),
    torso: new THREE.BoxGeometry(0.42, 0.58, 0.23).translate(0, 1.22, 0),
    arm: new THREE.BoxGeometry(0.1, 0.6, 0.11).translate(0, -0.3, 0),
    hand: new THREE.BoxGeometry(0.09, 0.1, 0.1).translate(0, -0.64, 0),
    neck: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8).translate(0, 1.55, 0),
    head: new THREE.SphereGeometry(0.125, 12, 9).scale(1, 1.12, 1.04).translate(0, 1.68, 0),
    hair: new THREE.SphereGeometry(0.13, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1, 1.1, 1.06).translate(0, 1.71, -0.005),
    cap: new THREE.CylinderGeometry(0.135, 0.135, 0.08, 12).translate(0, 1.78, 0),
    brim: new THREE.BoxGeometry(0.2, 0.02, 0.14).translate(0, 1.75, 0.12),
    tie: new THREE.BoxGeometry(0.07, 0.4, 0.02).translate(0, 1.27, 0.122),
    knot: new THREE.BoxGeometry(0.08, 0.06, 0.03).translate(0, 1.47, 0.122),
    collar: new THREE.BoxGeometry(0.2, 0.05, 0.03).translate(0, 1.5, 0.11),
    skirt: new THREE.CylinderGeometry(0.2, 0.27, 0.72, 12).translate(0, 0.74, 0),
  };
  const textures: THREE.Texture[] = [];
  const built: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  /** Fusionne des pièces, chacune peinte de sa couleur. */
  const paint = (parts: [THREE.BufferGeometry, number][]) => {
    const merged = mergeGeometries(parts.map(([g, c]) => {
      const copy = g.clone();
      tint.setHex(c).convertSRGBToLinear();
      const n = copy.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
      copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return copy;
    }))!;
    built.push(merged);
    return merged;
  };

  function build(look: Look, opts: { label?: string; shadow?: boolean } = {}): Person {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    const mesh = (g: THREE.BufferGeometry, parent: THREE.Object3D) => { const m = new THREE.Mesh(g, material); m.castShadow = opts.shadow ?? true; parent.add(m); return m; };
    const limb = (x: number, y: number, g: THREE.BufferGeometry) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot); mesh(g, pivot); return pivot; };
    const ownTextures: THREE.Texture[] = [];
    const leg = paint([[geo.leg, look.dress ? look.skin : look.bottom], [geo.shoe, look.shoes]]);
    const legL = limb(0.105, 0.92, leg), legR = limb(-0.105, 0.92, leg);
    const arm = paint([[geo.arm, look.top], [geo.hand, look.skin]]);
    const armL = limb(0.27, 1.48, arm), armR = limb(-0.27, 1.48, arm);
    const trunk: [THREE.BufferGeometry, number][] = [[geo.torso, look.top], [geo.neck, look.skin], [geo.head, look.skin], [geo.hair, look.hair]];
    if (look.dress) trunk.push([geo.skirt, look.bottom]);
    if (look.cap !== null) trunk.push([geo.cap, look.cap], [geo.brim, look.cap]);
    if (look.tie !== undefined) trunk.push([geo.collar, look.top], [geo.tie, look.tie], [geo.knot, look.tie]);
    const trunkGeo = paint(trunk);
    mesh(trunkGeo, body);
    const label = opts.label;
    if (label) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(11,12,14,.72)';
      g.beginPath(); g.roundRect(4, 6, 248, 52, 26); g.fill();
      g.fillStyle = '#fff'; g.font = '600 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, 128, 33);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      textures.push(t);
      ownTextures.push(t);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
      tag.scale.set(1.1, 0.275, 1);
      tag.position.y = 2.15;
      tag.renderOrder = 10;
      group.add(tag);
    }

    let human: Human | null = null, detailed = false;
    const pose = (p: Pose, time: number) => {
      if (human && detailed) { human.update(p, time); return; }
      const swing = Math.sin(p.phase);
      const amp = p.seated ? 0 : Math.min(1, Math.abs(p.speed) / 2) * (p.run ? 1.05 : 0.55);
      body.position.y = p.seated ? -0.45 : p.run ? Math.abs(Math.cos(p.phase)) * 0.07 : 0;
      body.rotation.x = p.run ? 0.16 : 0;
      body.rotation.y = 0;
      if (p.seated) {
        legL.rotation.set(-1.35, 0, 0.12); legR.rotation.set(-1.35, 0, -0.12);
        armL.rotation.set(-1.15, 0, 0); armR.rotation.set(-1.15, 0, 0);
        return;
      }
      if (p.air) { legL.rotation.set(-0.7, 0, 0); legR.rotation.set(-0.2, 0, 0); armL.rotation.set(-0.4, 0, 0.5); armR.rotation.set(-0.4, 0, -0.5); return; }
      legL.rotation.set(swing * amp, 0, 0);
      legR.rotation.set(-swing * amp, 0, 0);
      armL.rotation.set(-swing * amp * 0.9, 0, 0.06);
      armR.rotation.set(swing * amp * 0.9, 0, -0.06);
      if (p.wave > 0) armR.rotation.set(0, 0, -2.7 + Math.sin(time * 12) * 0.35);
      else if (p.dance && !amp) {
        // Danse simplifiée des silhouettes lointaines : rebond sur le temps, bras levés ou balancés.
        const b = Math.abs(Math.sin(time * Math.PI * 2)), s = Math.sin(time * Math.PI * 2);
        body.position.y = -b * 0.06;
        body.rotation.y = s * 0.25;
        if (p.dance === 2) { armL.rotation.set(0, 0, 2.5 + s * 0.3); armR.rotation.set(0, 0, -2.5 + s * 0.3); }
        else { armL.rotation.set(-0.9 - s * 0.4, 0, 0.2); armR.rotation.set(-0.9 + s * 0.4, 0, -0.2); }
      }
    };
    pose({ phase: 0, speed: 0, run: false, air: false, wave: 0, seated: false }, 0);
    return {
      group, look, pose,
      attach(h) { human = h; h.root.visible = false; group.add(h.root); },
      detail(on) { if (!human || on === detailed) return; detailed = on; human.root.visible = on; body.visible = !on; },
      hasDetail: () => detailed,
      /** Libère ce personnage : ses maillages fusionnés, son étiquette et son modèle détaillé. */
      dispose() {
        for (const g of [leg, arm, trunkGeo]) { built.splice(built.indexOf(g), 1); g.dispose(); }
        ownTextures.forEach((t) => { t.dispose(); textures.splice(textures.indexOf(t), 1); });
        group.traverse((o) => { if (o instanceof THREE.Sprite) o.material.dispose(); });
        human?.dispose();
        group.removeFromParent();
      },
    };
  }

  return {
    build,
    dispose() {
      Object.values(geo).forEach((g) => g.dispose());
      built.forEach((g) => g.dispose());
      material.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
