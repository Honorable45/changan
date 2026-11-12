import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hud } from './moteur/engine';
import { couleurJoueur, type MessageJeu, type Reseau } from './reseau';
import { contexteVoix, creerHautParleurs, ouvrirMicro, voixPossible, type Micro } from './voix';
import { CHAT_MAX, VOIX_RAYON } from '../../partage/protocole.ts';

/**
 * Communication entre joueurs, en ligne : où sont les autres (liste, distance, direction, itinéraire jusqu'à eux),
 * discussion écrite à toute la ville, et voix en direct de proximité : on tient « Parler », les joueurs à moins de 5 m
 * entendent aussitôt, plus fort de près et du bon côté.
 * Chaque joueur peut ignorer ou signaler quelqu'un : ses messages et sa voix ne lui parviennent plus.
 */
type Joueurs = NonNullable<Hud['online']>['joueurs'];
type Props = {
  reseau: Reseau;
  joueurs: Joueurs;
  enLigne: boolean;
  onNotice: (text: string) => void;
  onNavigate: (nom: string, x: number, z: number) => void;
  /** Relâche les touches de conduite quand on se met à écrire. */
  onTyping: () => void;
};

const PICTOS = {
  joueurs: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.3c2.4.2 4 1.9 4.5 4.7" /></>,
  bulle: <path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z" />,
  micro: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  hautParleur: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9a4 4 0 0 1 0 6" /></>,
  muet: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m17 9 5 6M22 9l-5 6" /></>,
  envoyer: <path d="M4 12 20 4l-6 16-3-7z" />,
} as const;
const Picto = ({ n, className = 'h-5 w-5' }: { n: keyof typeof PICTOS; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PICTOS[n]}</svg>
);
const cleJoueur = (id: number, nom: string) => `${id}:${nom}`;
const distanceTexte = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`);
const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/** Le micro reste ouvert 30 s après le dernier « Parler » : rouvert à chaque appui, il couperait les premiers mots. */
const GARDE_MICRO_MS = 30_000;

export function Communication({ reseau, joueurs, enLigne, onNotice, onNavigate, onTyping }: Props) {
  const [panneau, setPanneau] = useState<'discussion' | 'joueurs' | null>(null);
  const [messages, setMessages] = useState<MessageJeu[]>(() => [...reseau.messages]);
  const [nonLus, setNonLus] = useState(0);
  const [texte, setTexte] = useState('');
  // Ignorés par numéro ET pseudo : un numéro libéré puis repris par un autre joueur n'hérite pas de la mise à l'écart.
  const [ignores, setIgnores] = useState<Set<string>>(() => new Set());
  const [signales, setSignales] = useState<Set<string>>(() => new Set());
  const [voixMuette, setVoixMuette] = useState(false);
  const [parleMoi, setParleMoi] = useState(false);
  const [recents, setRecents] = useState<MessageJeu[]>([]);
  const hautParleurs = useRef<ReturnType<typeof creerHautParleurs> | null>(null);
  const ignoresRef = useRef(ignores);
  ignoresRef.current = ignores;
  const joueursRef = useRef(joueurs);
  joueursRef.current = joueurs;
  const panneauRef = useRef(panneau);
  panneauRef.current = panneau;
  const saisie = useRef<HTMLInputElement>(null);
  const fin = useRef<HTMLLIElement>(null);
  const micro = useRef<Micro | null>(null);
  const ouverture = useRef<Promise<Micro | null> | null>(null);
  const tenu = useRef(false);
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stop = reseau.ecouter((m) => {
      if (ignoresRef.current.has(cleJoueur(m.id, m.nom)) && !m.moi) return;
      setMessages([...reseau.messages]);
      if (panneauRef.current !== 'discussion' && !m.moi) setNonLus((n) => n + 1);
      if (!m.moi) {
        // Les derniers messages s'affichent quelques secondes à l'écran, même discussion fermée.
        setRecents((r) => [...r.slice(-2), m]);
        setTimeout(() => setRecents((r) => r.filter((x) => x.cle !== m.cle)), 8000);
      }
    });
    // Voix en direct : plus forte de près, venant du côté du joueur qui parle.
    const hp = creerHautParleurs();
    hautParleurs.current = hp;
    const stopVoix = reseau.ecouterVoix((id, audio) => {
      const j = joueursRef.current.find((x) => x.id === id);
      if (j && ignoresRef.current.has(cleJoueur(j.id, j.nom))) return;
      const d = j ? j.distance : 0;
      hp.jouer(id, audio, 1 - 0.65 * Math.min(1, d / VOIX_RAYON), j && d > 0.5 ? -Math.sin(j.cap) * 0.8 : 0);
    });
    // Les navigateurs ne laissent sortir le son qu'après un geste du joueur.
    const debloquer = () => { if (voixPossible()) contexteVoix(); };
    window.addEventListener('pointerdown', debloquer);
    window.addEventListener('keydown', debloquer);
    return () => {
      stop(); stopVoix(); hp.fermer();
      window.removeEventListener('pointerdown', debloquer); window.removeEventListener('keydown', debloquer);
      if (garde.current) clearTimeout(garde.current);
      micro.current?.fermer(); micro.current = null;
    };
  }, [reseau]);

  useEffect(() => { if (panneau === 'discussion') { setNonLus(0); fin.current?.scrollIntoView({ block: 'end' }); } }, [panneau, messages.length]);

  const ouvrirDiscussion = useCallback(() => { setPanneau('discussion'); requestAnimationFrame(() => saisie.current?.focus()); }, []);

  /* « Parler » : tant que le bouton (ou V) est tenu, le micro part en direct vers les joueurs à moins de 5 m. */
  const commencer = useCallback(async () => {
    if (tenu.current) return;
    if (!enLigne) { onNotice('Parler : attendez d’être connecté au jeu en ligne.'); return; }
    if (!voixPossible()) { onNotice('Micro indisponible ici : il faut une page sécurisée (https) et un navigateur récent.'); return; }
    tenu.current = true;
    setParleMoi(true);
    if (garde.current) { clearTimeout(garde.current); garde.current = null; }
    try {
      ouverture.current ??= ouvrirMicro((audio) => { reseau.parler(audio); });
      const m = await ouverture.current;
      micro.current = m;
      if (m) m.emettre = tenu.current;
    } catch (err) {
      ouverture.current = null;
      tenu.current = false;
      setParleMoi(false);
      const nom = (err as Error).name;
      onNotice(nom === 'NotAllowedError' ? 'Micro refusé : autorisez-le dans les réglages du navigateur pour parler aux autres.' : nom === 'NotFoundError' ? 'Aucun micro trouvé sur cet appareil.' : 'Le micro n’a pas pu s’ouvrir.');
    }
  }, [enLigne, onNotice, reseau]);
  const finir = useCallback(() => {
    if (!tenu.current) return;
    tenu.current = false;
    setParleMoi(false);
    if (micro.current) micro.current.emettre = false;
    garde.current = setTimeout(() => { micro.current?.fermer(); micro.current = null; ouverture.current = null; }, GARDE_MICRO_MS);
  }, []);

  // Clavier : Y ouvre la discussion, V maintenu pour parler.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'y') { e.preventDefault(); ouvrirDiscussion(); }
      else if (k === 'v') void commencer();
    };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !(e.target instanceof HTMLInputElement)) finir(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', finir);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', finir); };
  }, [commencer, finir, ouvrirDiscussion]);

  // Qui m'entend (joueurs à moins de 5 m) et qui parle en ce moment, rafraîchis avec le jeu.
  const proches = joueurs.filter((j) => !j.dedans && j.distance <= VOIX_RAYON).length;
  const parlent = (hautParleurs.current?.parlent() ?? []).map((id) => joueurs.find((j) => j.id === id)?.nom).filter((n): n is string => !!n);

  const envoyerTexte = () => {
    if (!texte.trim()) return;
    if (!reseau.ecrire(texte)) { onNotice('Message non envoyé : connexion au jeu en ligne perdue.'); return; }
    setTexte('');
  };
  const basculerIgnore = (id: number, nom: string) => {
    const k = cleJoueur(id, nom);
    setIgnores((s) => {
      const n = new Set(s);
      if (n.has(k)) { n.delete(k); onNotice(`Vous recevez de nouveau les messages de ${nom}.`); } else { n.add(k); onNotice(`${nom} est ignoré : ses messages ne vous parviennent plus.`); }
      return n;
    });
  };
  /** Signaler : prévient le serveur (sourdine collective au-delà d'un seuil) et ignore aussitôt ce joueur pour soi. */
  const signaler = (id: number, nom: string) => {
    const k = cleJoueur(id, nom);
    reseau.signaler(id);
    setSignales((s) => new Set(s).add(k));
    setIgnores((s) => new Set(s).add(k));
    onNotice(`${nom} est signalé et ignoré. S’il est signalé par d’autres joueurs, il sera mis en sourdine pour tous.`);
  };
  const visibles = messages.filter((m) => m.moi || !ignores.has(cleJoueur(m.id, m.nom)));
  const muet = reseau.muet;
  const bouton = 'glass relative flex h-11 w-11 items-center justify-center rounded-full';

  return (
    <div className="pointer-events-none absolute right-3 top-1/2 z-[5] flex -translate-y-1/2 items-center gap-2 md:right-5 [@media(max-height:480px)]:top-[10.25rem] [@media(max-height:480px)]:translate-y-0 [@media(max-height:480px)]:items-start">
      {/* Messages récents, discussion fermée */}
      {!panneau && recents.length > 0 && (
        <ul aria-hidden="true" className="flex max-w-[min(18rem,55vw)] flex-col items-end gap-1.5" data-testid="messages-recents">
          {recents.filter((m) => !ignores.has(cleJoueur(m.id, m.nom))).map((m) => (
            <li key={m.cle} className="glass rounded-2xl px-3 py-1.5 text-xs leading-snug">
              <span className="font-semibold" style={{ color: couleurJoueur(m.id) }}>{m.nom}</span>{' '}
              {m.txt}
            </li>
          ))}
        </ul>
      )}

      {panneau && (
        <section aria-label={panneau === 'discussion' ? 'Discussion' : 'Joueurs en ligne'} data-testid={panneau === 'discussion' ? 'discussion' : 'liste-joueurs'}
          className="glass pointer-events-auto flex max-h-[min(26rem,62svh)] [@media(max-height:480px)]:max-h-[calc(100svh-11.5rem)] w-[min(21rem,68vw)] flex-col rounded-[20px] p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{panneau === 'discussion' ? 'Discussion · toute la ville' : `Joueurs en ligne · ${joueurs.length}`}</p>
            <button type="button" onClick={() => setPanneau(null)} className="min-h-9 px-1 text-xs underline underline-offset-2">Fermer</button>
          </div>

          {panneau === 'joueurs' ? (
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {joueurs.length === 0 && <li className="py-3 text-xs text-white/70">Personne d’autre dans votre ville pour l’instant. Partagez le lien du jeu pour inviter quelqu’un.</li>}
              {joueurs.map((j) => (
                <li key={j.id} className="flex items-center gap-2 border-b border-white/10 py-2" data-testid="joueur">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: couleurJoueur(j.id) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{j.nom}{ignores.has(cleJoueur(j.id, j.nom)) && <span className="text-white/50"> · {signales.has(cleJoueur(j.id, j.nom)) ? 'signalé' : 'ignoré'}</span>}</span>
                    <span className="num flex items-center gap-1 text-xs text-white/65">
                      {!j.dedans && <span aria-hidden="true" className="inline-block" style={{ transform: `rotate(${-j.cap}rad)` }}>↑</span>}
                      {distanceTexte(j.distance)}{j.dedans && ' · dans un bâtiment'}
                    </span>
                  </span>
                  <button type="button" onClick={() => { if (j.distance < 20 && !j.dedans) onNotice(`${j.nom} est juste à côté de vous (${j.distance} m).`); else onNavigate(j.nom, j.x, j.z); setPanneau(null); }} className="min-h-9 shrink-0 rounded-full bg-white px-3 text-xs font-medium text-[#0b0c0e]">Y aller</button>
                  <span className="flex shrink-0 flex-col items-end">
                    <button type="button" onClick={() => basculerIgnore(j.id, j.nom)} aria-pressed={ignores.has(cleJoueur(j.id, j.nom))} className="min-h-7 px-1 text-xs underline underline-offset-2">{ignores.has(cleJoueur(j.id, j.nom)) ? 'Écouter' : 'Ignorer'}</button>
                    {!signales.has(cleJoueur(j.id, j.nom)) && <button type="button" onClick={() => signaler(j.id, j.nom)} className="min-h-7 px-1 text-xs text-[#ff9a8f] underline underline-offset-2" data-testid="signaler">Signaler</button>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto" aria-live="polite">
                {visibles.length === 0 && <li className="py-2 text-xs text-white/70">Aucun message. Écrivez à tous les joueurs de la ville, ou tenez « Parler » pour parler à ceux qui sont à moins de 5 m.</li>}
                {visibles.map((m) => (
                  <li key={m.cle} className="text-xs leading-snug" data-testid="message">
                    <span className="font-semibold" style={{ color: m.moi ? '#fff' : couleurJoueur(m.id) }}>{m.moi ? 'Vous' : m.nom}</span>
                    <span className="num ml-1.5 text-white/40">{heure(m.at)}</span>
                    <span className="block break-words text-white/90">{m.txt}</span>
                  </li>
                ))}
                <li ref={fin} aria-hidden="true" />
              </ul>
              <form className="mt-2 flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); envoyerTexte(); }}>
                <input ref={saisie} value={texte} maxLength={CHAT_MAX} onChange={(e) => setTexte(e.target.value)} onFocus={onTyping} enterKeyHint="send"
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.blur(); setPanneau(null); } }}
                  placeholder={enLigne ? 'Votre message…' : 'Connexion…'} aria-label="Message à tous les joueurs" disabled={!enLigne}
                  className="min-h-10 w-full min-w-0 rounded-full border border-white/30 bg-black/30 px-3.5 text-base text-white placeholder:text-white/50 md:text-sm" />
                <button type="submit" aria-label="Envoyer" disabled={!texte.trim() || !enLigne} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b0c0e] disabled:opacity-40"><Picto n="envoyer" /></button>
              </form>
              {reseau.tropVite && !muet && <p role="status" className="mt-1 text-[.7rem] text-[#f2c14e]">Doucement : un message à la fois.</p>}
              {muet > 0 && <p role="status" className="mt-1 text-[.7rem] text-[#ff9a8f]" data-testid="sourdine">Vous avez été signalé par plusieurs joueurs : vos messages ne sont plus transmis pendant {Math.ceil(muet / 60)} min.</p>}
            </>
          )}
        </section>
      )}

      <div className="pointer-events-auto flex flex-col items-center gap-2 [@media(max-height:480px)]:flex-row">
        <button type="button" className={`${bouton} ${panneau === 'joueurs' ? '!bg-white text-[#0b0c0e]' : ''}`} aria-label={`Joueurs en ligne : ${joueurs.length}`} aria-pressed={panneau === 'joueurs'} title="Où sont les autres joueurs"
          data-testid="bouton-joueurs" onClick={() => setPanneau((p) => (p === 'joueurs' ? null : 'joueurs'))}>
          <Picto n="joueurs" />
          {joueurs.length > 0 && <span className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#35e07a] px-1 text-[.65rem] font-bold text-[#06210f]">{joueurs.length}</span>}
        </button>
        <button type="button" className={`${bouton} ${panneau === 'discussion' ? '!bg-white text-[#0b0c0e]' : ''}`} aria-label={nonLus ? `Discussion, ${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}` : 'Discussion'} aria-pressed={panneau === 'discussion'}
          title="Discussion (Y)" data-testid="bouton-discussion" onClick={() => (panneau === 'discussion' ? setPanneau(null) : ouvrirDiscussion())}>
          <Picto n="bulle" />
          {nonLus > 0 && <span className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5a4d] px-1 text-[.65rem] font-bold">{nonLus > 9 ? '9+' : nonLus}</span>}
        </button>
        <button type="button" aria-label={parleMoi ? 'Vous parlez : relâchez pour vous taire' : 'Parler (maintenir) : les joueurs à moins de 5 m vous entendent'} aria-pressed={parleMoi} title="Parler : maintenir (V)" data-testid="bouton-parler"
          className={`relative flex h-14 w-14 flex-col items-center justify-center rounded-full text-[.55rem] font-semibold [@media(max-height:480px)]:h-11 [@media(max-height:480px)]:w-11 select-none touch-none ${parleMoi ? 'bg-[#35e07a] text-[#06210f] shadow-[0_0_0_6px_rgb(53_224_122/.3)]' : 'glass'}`}
          onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void commencer(); }}
          onPointerUp={finir} onPointerCancel={finir} onContextMenu={(e) => e.preventDefault()}>
          <Picto n="micro" className="h-5 w-5" /><span className="[@media(max-height:480px)]:hidden">Parler</span>
        </button>
        <button type="button" className={bouton} aria-pressed={voixMuette} aria-label={voixMuette ? 'Réentendre les autres joueurs' : 'Ne plus entendre les autres joueurs'} title="Voix des autres joueurs"
          onClick={() => { const m = !voixMuette; setVoixMuette(m); hautParleurs.current?.setMuet(m); }}>
          <Picto n={voixMuette ? 'muet' : 'hautParleur'} />
        </button>
      </div>

      {/* Qui m'entend quand je parle, et qui parle près de moi */}
      {(parleMoi || parlent.length > 0) && (
        <p role="status" className="glass pointer-events-none absolute -top-12 right-0 [@media(max-height:480px)]:-bottom-10 [@media(max-height:480px)]:top-auto flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs" data-testid="voix-etat">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-[#35e07a]" />
          {parleMoi
            ? (proches ? `Vous parlez · ${proches} joueur${proches > 1 ? 's' : ''} à moins de 5 m vous entend${proches > 1 ? 'ent' : ''}` : 'Vous parlez · personne à moins de 5 m : approchez-vous')
            : `${parlent.join(', ')} ${parlent.length > 1 ? 'parlent' : 'parle'}`}
        </p>
      )}
    </div>
  );
}
