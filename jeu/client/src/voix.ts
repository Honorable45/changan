import { FORMATS_VOIX, VOIX_DUREE_MAX, VOIX_MAX_OCTETS } from '../../partage/protocole.ts';

/**
 * Messages vocaux, façon talkie-walkie : on maintient le bouton pour parler, le message part au relâchement
 * et les autres joueurs l'entendent aussitôt. Le micro n'est ouvert que pendant l'appui.
 * Le navigateur n'autorise le micro que sur une page sécurisée (https, ou localhost).
 */

export const voixPossible = () =>
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/** Premier format que ce navigateur sait enregistrer, parmi ceux du protocole. */
const formatEnregistrable = () => FORMATS_VOIX.findIndex((f) => MediaRecorder.isTypeSupported(f));

export type Enregistrement = { format: number; audio: Uint8Array; duree: number; url: string };

/**
 * Commence un enregistrement. `arreter()` le termine et renvoie le message (null s'il est trop court, undefined s'il était déjà arrêté) ;
 * au bout de VOIX_DUREE_MAX secondes, il s'arrête tout seul et `surFin` reçoit le résultat.
 * Rejette si le micro est refusé ou absent.
 */
export async function enregistrer(surFin: (e: Enregistrement | null | undefined) => void) {
  const format = formatEnregistrable();
  if (format < 0) throw new Error('format');
  const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  // 16 kbit/s en Opus : une voix claire, 30 Ko pour 15 s.
  const rec = new MediaRecorder(flux, { mimeType: FORMATS_VOIX[format], audioBitsPerSecond: 16000 });
  const morceaux: Blob[] = [];
  const debut = performance.now();
  let fini = false;
  const termine = new Promise<Enregistrement | null>((ok) => {
    rec.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
    rec.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      const duree = (performance.now() - debut) / 1000;
      const blob = new Blob(morceaux, { type: FORMATS_VOIX[format] });
      // Moins de 0,4 s : un appui par erreur. Trop lourd : refusé par le serveur, inutile de l'envoyer.
      if (duree < 0.4 || !blob.size || blob.size > VOIX_MAX_OCTETS) { ok(null); return; }
      ok({ format, audio: new Uint8Array(await blob.arrayBuffer()), duree, url: URL.createObjectURL(blob) });
    };
  });
  rec.start();
  // Seul le premier arrêt (relâchement ou fin des 15 s) livre le message ; un second reçoit undefined.
  const arreter = (): Promise<Enregistrement | null | undefined> => {
    if (fini) return Promise.resolve(undefined);
    fini = true; clearTimeout(limite);
    if (rec.state !== 'inactive') rec.stop();
    return termine;
  };
  const limite = setTimeout(() => { void arreter().then(surFin); }, VOIX_DUREE_MAX * 1000);
  return { arreter, debut };
}

/** Lecture des messages vocaux reçus, l'un après l'autre. */
export function creerLecteur(surChange: (qui: string | null) => void) {
  const file: { url: string; nom: string }[] = [];
  let actuel: HTMLAudioElement | null = null, muet = false;
  const suivant = () => {
    actuel = null;
    const m = file.shift();
    if (!m || muet) { surChange(null); return; }
    const a = new Audio(m.url);
    actuel = a;
    surChange(m.nom);
    a.onended = a.onerror = () => { if (actuel === a) suivant(); };
    a.play().catch(() => { if (actuel === a) suivant(); });
  };
  return {
    /** Ajoute un message à la file ; il est joué dès que le précédent est fini. */
    jouer(url: string, nom: string) { if (muet) return; file.push({ url, nom }); if (file.length > 6) file.shift(); if (!actuel) suivant(); },
    /** Rejoue tout de suite un message de la discussion. */
    rejouer(url: string, nom: string) { actuel?.pause(); file.length = 0; file.push({ url, nom }); suivant(); },
    get muet() { return muet; },
    setMuet(m: boolean) { muet = m; if (m) { file.length = 0; actuel?.pause(); actuel = null; surChange(null); } },
    fermer() { file.length = 0; actuel?.pause(); actuel = null; },
  };
}
