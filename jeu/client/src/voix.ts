import { VOIX_ECHANTILLONS_TRAME, VOIX_FREQUENCE, depuisMuLaw, versMuLaw } from '../../partage/protocole.ts';

/**
 * Voix en direct, de proximité : on tient « Parler », le micro part par trames de 100 ms (μ-law 8 kHz),
 * et les joueurs à moins de 5 m l'entendent aussitôt, plus fort de près, du côté où l'on se trouve.
 * Le navigateur n'autorise le micro que sur une page sécurisée (https, ou localhost).
 */

export const voixPossible = () =>
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';

type Contexte = AudioContext;
let contexte: Contexte | null = null;
/** Un seul contexte audio pour la voix, débloqué au premier geste du joueur (règle des navigateurs). */
export const contexteVoix = () => {
  contexte ??= new AudioContext();
  if (contexte.state === 'suspended') void contexte.resume().catch(() => {});
  return contexte;
};

/**
 * Micro : renvoie de quoi envoyer ou non (`emettre`) et fermer. Le micro reste ouvert tant que la partie en a besoin :
 * rouvrir à chaque appui couperait les premiers mots. Le serveur ne reçoit rien tant que `emettre` est faux.
 */
export async function ouvrirMicro(surTrame: (audio: Uint8Array) => void) {
  const ctx = contexteVoix();
  const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const source = ctx.createMediaStreamSource(flux);
  // ScriptProcessor : ancien mais disponible partout (Safari compris), sans fichier de script séparé.
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const muet = ctx.createGain();
  muet.gain.value = 0;
  source.connect(proc); proc.connect(muet); muet.connect(ctx.destination);

  const pas = ctx.sampleRate / VOIX_FREQUENCE;
  const trame = new Uint8Array(VOIX_ECHANTILLONS_TRAME);
  let n = 0, position = 0, filtre = 0, emettre = false;
  // Passe-bas simple avant de passer à 8 kHz, pour que la voix ne grésille pas.
  const k = Math.min(1, (2 * Math.PI * 3400) / ctx.sampleRate);
  proc.onaudioprocess = (ev) => {
    const entree = ev.inputBuffer.getChannelData(0);
    for (let i = 0; i < entree.length; i++) {
      filtre += (entree[i]! - filtre) * k;
      position += 1;
      if (position < pas) continue;
      position -= pas;
      if (!emettre) { n = 0; continue; }
      trame[n++] = versMuLaw(filtre);
      if (n === trame.length) { surTrame(trame.slice()); n = 0; }
    }
  };
  return {
    set emettre(v: boolean) { emettre = v; if (!v) n = 0; },
    get emettre() { return emettre; },
    fermer() { proc.onaudioprocess = null; source.disconnect(); proc.disconnect(); muet.disconnect(); flux.getTracks().forEach((t) => t.stop()); },
  };
}
export type Micro = Awaited<ReturnType<typeof ouvrirMicro>>;

/**
 * Haut-parleurs : une file par joueur qui parle. Chaque trame est jouée à la suite de la précédente, avec 150 ms d'avance
 * pour absorber les à-coups du réseau ; si le retard dépasse 600 ms, on rattrape (la voix reste « en direct »).
 */
export function creerHautParleurs() {
  const voies = new Map<number, { gain: GainNode; pan: StereoPannerNode; suite: number; derniere: number }>();
  let muet = false;
  const voie = (id: number) => {
    let v = voies.get(id);
    if (!v) {
      const ctx = contexteVoix();
      const gain = ctx.createGain(), pan = ctx.createStereoPanner();
      gain.connect(pan); pan.connect(ctx.destination);
      v = { gain, pan, suite: 0, derniere: 0 };
      voies.set(id, v);
    }
    return v;
  };
  return {
    /** Joue une trame reçue. `volume` de 0 à 1 (selon la distance), `cote` de −1 (gauche) à 1 (droite). */
    jouer(id: number, audio: Uint8Array, volume: number, cote: number) {
      if (muet) return;
      const ctx = contexteVoix();
      const v = voie(id);
      const buf = ctx.createBuffer(1, audio.length, VOIX_FREQUENCE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < audio.length; i++) data[i] = depuisMuLaw(audio[i]!);
      const t = ctx.currentTime;
      if (v.suite < t + 0.05 || v.suite > t + 0.6) v.suite = t + 0.15;
      v.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), t, 0.05);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, cote)), t, 0.05);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(v.gain);
      src.start(v.suite);
      v.suite += buf.duration;
      v.derniere = performance.now();
    },
    /** Joueurs entendus dans les 400 dernières millisecondes. */
    parlent(): number[] { const t = performance.now(); return [...voies].filter(([, v]) => t - v.derniere < 400).map(([id]) => id); },
    get muet() { return muet; },
    setMuet(m: boolean) { muet = m; if (m) for (const v of voies.values()) v.suite = 0; },
    fermer() { for (const v of voies.values()) { v.gain.disconnect(); v.pan.disconnect(); } voies.clear(); },
  };
}
