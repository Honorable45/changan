import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVOIR_URL, SERVEUR_URL, SITE_URL } from './config';
import { SmartAIButton, SmartAIDashboard, SmartAIFrame } from './SmartAIDashboard';
import type { Game, Hud } from './moteur/engine';
import { searchPlaces, type Place } from './moteur/nav';
import type { GameEvent } from './moteur/sim';

type Phase = 'setup' | 'loading' | 'playing' | 'error' | 'unsupported';

/** Teintes proposées pour la voiture du joueur, celles du nuancier du site. */
const COLORS = [
  { id: 'profil', label: 'Bleu clair', swatch: '#a9bfd8' },
  { id: 'blanc', label: 'Blanc', swatch: '#ecedee' },
  { id: 'noir', label: 'Noir', swatch: '#26282c' },
  { id: 'gris', label: 'Gris', swatch: '#70747a' },
  { id: 'bleu', label: 'Bleu', swatch: '#1c346e' },
];
const PSEUDO_KEY = 'changan-jeu-pseudo';
const LIGNE_KEY = 'changan-jeu-en-ligne';
const readPseudo = () => { try { return localStorage.getItem(PSEUDO_KEY) ?? ''; } catch { return ''; } };
const MESSAGES: Partial<Record<GameEvent, string>> = {
  hit: 'Choc : −50 points',
  red: 'Feu rouge grillé : −100 points',
  speed: 'Vous dépassez 50 km/h : points perdus',
  signal: 'Clignotant bien utilisé : +100 points',
  green: 'Le feu passe au vert, repartez.',
  bounds: 'Vous avez atteint la limite de la zone.',
  arrived: 'Vous êtes arrivé à destination.',
  reroute: 'Nouvel itinéraire calculé.',
  walker: 'Attention aux piétons : −50 points',
  nid: 'Nid-de-poule ! Ralentissez.',
};
const BEST_KEY = 'changan-essai-virtuel-record';
const MONEY_KEY = 'changan-essai-virtuel-argent';

/** Pictogrammes des boutons du jeu, dessinés au trait. */
const ICONS = {
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
  view: <><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></>,
  mute: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m17 9 5 6M22 9l-5 6" /></>,
  horn: <><path d="M3 10.5v3h3l9 5.5V5L6 10.5z" /><path d="M18.5 9.5v5M21 8v8" /></>,
  run: <><circle cx="15" cy="4.5" r="2" /><path d="m6 21 3.5-6 3 2.5V22M9.5 15l2.5-6.5 4 3.5h3.5M12 8.5 7.5 9.5 5.5 13" /></>,
  jump: <><path d="M12 18V4M6.5 9.5 12 4l5.5 5.5" /><path d="M5 21h14" /></>,
  dance: <><path d="M9 18V5.5l11-2.5v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  wave: <path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 10.5V4.5a1.5 1.5 0 0 1 3 0V10.5M13 10.5V5.5a1.5 1.5 0 0 1 3 0V12M16 11.5V9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-.8a6 6 0 0 1-5.1-2.9L3.4 14a1.5 1.5 0 0 1 2.6-1.5L7.5 15" />,
  basket: <><path d="M3 9.5h18l-2 10.5H5z" /><path d="m8 9.5 3-6.5M16 9.5l-3-6.5M9 13.5v3M12 13.5v3M15 13.5v3" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></>,
  pad: <><path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 4a2.5 2.5 0 0 1-4.4 1.2L14.5 16h-5L8 17.7a2.5 2.5 0 0 1-4.4-1.2l-.6-4A4 4 0 0 1 7 8z" /><path d="M7.5 11v3M6 12.5h3" /><circle cx="16" cy="11.5" r=".8" /><circle cx="17.5" cy="13.5" r=".8" /></>,
  left: <path d="M15 5 8 12l7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  gas: <path d="M6 18 12 6l6 12M8.5 13h7" />,
  brake: <><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></>,
  tilt: <><rect x="7" y="3" width="10" height="18" rx="2" transform="rotate(-20 12 12)" /></>,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
} as const;
function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof ICONS; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}
const readMoney = () => { try { const v = localStorage.getItem(MONEY_KEY); return v === null ? 20000 : Math.max(0, Number(v) || 0); } catch { return 20000; } };
const saveMoney = (v: number) => { try { localStorage.setItem(MONEY_KEY, String(v)); } catch { /* argent gardé pour la partie seulement */ } };
const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} F`;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
/** Téléphone uniquement : une tablette ou un ordinateur tactile garde son orientation. */
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const lockLandscape = () => {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  return orientation.lock?.('landscape');
};
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const saveBest = (v: number) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* record conservé pour la partie seulement */ } };

function Hold({ label, onChange, className, children }: { label: string; onChange: (on: boolean) => void; className: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const set = (v: boolean) => { setOn(v); onChange(v); };
  return (
    <button type="button" aria-label={label} aria-pressed={on} className={`select-none touch-none ${className} ${on ? 'brightness-150' : ''}`}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); set(true); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onContextMenu={(e) => e.preventDefault()}>{children}</button>
  );
}

/** Volant tactile : il suit le doigt jusqu'à 150° de chaque côté et revient au centre au relâchement. */
function TouchWheel({ onSteer }: { onSteer: (v: number) => void }) {
  const [angle, setAngle] = useState(0);
  const drag = useRef<{ last: number; total: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const at = (e: React.PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  const end = () => { drag.current = null; setAngle(0); onSteer(0); };
  return (
    <div ref={el} role="img" aria-label="Volant : faites-le tourner du doigt" className="h-36 w-36 touch-none select-none sm:h-44 sm:w-44"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { last: at(e), total: angle }; }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const now = at(e);
        let d = now - drag.current.last;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        drag.current.last = now;
        drag.current.total = Math.max(-150, Math.min(150, drag.current.total + d));
        setAngle(drag.current.total);
        onSteer(drag.current.total / 150);
      }}
      onPointerUp={end} onPointerCancel={end}>
      <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-[0_8px_18px_rgb(0_0_0/.55)]" style={{ transform: `rotate(${angle}deg)`, transition: drag.current ? 'none' : 'transform .25s var(--ease-drive)' }}>
        <defs>
          <linearGradient id="cuir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b3d42" /><stop offset=".5" stopColor="#141518" /><stop offset="1" stopColor="#25272b" /></linearGradient>
          <radialGradient id="moyeu"><stop offset="0" stopColor="#30333a" /><stop offset="1" stopColor="#0d0e10" /></radialGradient>
        </defs>
        <circle cx="100" cy="100" r="84" fill="none" stroke="url(#cuir)" strokeWidth="19" />
        <circle cx="100" cy="100" r="84" fill="none" stroke="#7d828a" strokeWidth=".9" strokeDasharray="2.5 3.5" />
        <path d="M28 96h40l10 14-6 8H37ZM172 96h-40l-10 14 6 8h35ZM88 128h24l5 50H83Z" fill="#1a1b1f" stroke="#34363b" />
        <circle cx="100" cy="104" r="33" fill="url(#moyeu)" stroke="#3d4046" />
        <circle cx="100" cy="104" r="10" fill="none" stroke="#c4c8cd" strokeWidth="2" />
        {[46, 58].map((x) => <rect key={x} x={x} y="102" width="8" height="6" rx="1.5" fill="#55585e" />)}
        {[134, 146].map((x) => <rect key={x} x={x} y="102" width="8" height="6" rx="1.5" fill="#55585e" />)}
        <rect x="96" y="9" width="8" height="10" rx="2" fill="#d9dbde" />
      </svg>
    </div>
  );
}

/** Manette tactile pour marcher : vers le haut avance, sur les côtés tourne. */
function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const el = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    setKnob([x, y]);
    onMove(x, y);
  };
  const end = () => { setKnob([0, 0]); onMove(0, 0); };
  return (
    <div ref={el} role="img" aria-label="Manette : faites glisser le doigt pour marcher" className="glass relative h-32 w-32 touch-none select-none rounded-full sm:h-36 sm:w-36"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') move(e); }} onPointerUp={end} onPointerCancel={end}>
      <span className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/85 shadow-[0_6px_18px_rgb(0_0_0/.45)]" style={{ transform: `translate(-50%, -50%) translate(${knob[0] * 40}px, ${knob[1] * 40}px)` }} />
    </div>
  );
}

export function Jeu() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [color, setColor] = useState(COLORS[0]!);
  const [night, setNight] = useState(false);
  const [free, setFree] = useState(false);
  const [place, setPlace] = useState<'lome' | 'grid'>('lome');
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [touchUi, setTouchUi] = useState(false);
  const [tilt, setTilt] = useState(false);
  const [best, setBest] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [sideways, setSideways] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [wantSearch, setWantSearch] = useState(false);
  const [foot, setFoot] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [online, setOnline] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const toastId = useRef(0);
  const start = useRef<HTMLButtonElement>(null);
  const silent = useRef(false);
  const pauseRef = useRef<() => void>(() => {});

  useEffect(() => {
    setTouchUi(matchMedia('(pointer: coarse)').matches); setBest(readBest());
    setPseudo(readPseudo() || `Joueur ${Math.floor(1000 + Math.random() * 9000)}`);
    try { setOnline(localStorage.getItem(LIGNE_KEY) !== 'non'); } catch { /* en ligne par défaut */ }
  }, []);

  const leave = useCallback(() => {
    game.current?.dispose();
    game.current = null;
    setHud(null);
    setPaused(false);
    setTilt(false);
    setDismissed(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setPhase('setup');
    requestAnimationFrame(() => start.current?.focus());
  }, []);

  const launch = (pickedFree: boolean, onFoot = false) => {
    if (!webglAvailable()) { setPhase('unsupported'); return; }
    if (online && pseudo.trim().length < 2) { document.getElementById('pseudo')?.focus(); return; }
    setFree(pickedFree);
    setFoot(onFoot);
    setPhase('loading');
  };

  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const [{ createGame }, lome, fleet, net] = await Promise.all([
          import('./moteur/engine'),
          place === 'lome' ? fetch('/game/lome.json').then((r) => r.json()) : null,
          // Voitures stylisées du Car Kit de Kenney ; sans elles, des silhouettes génériques les remplacent.
          import('./moteur/fleet').then((m) => m.loadFleet()).catch(() => null),
          // Jeu en ligne, seulement dans Lomé : la ville imaginaire reste une partie seule, plus légère.
          online && SERVEUR_URL && place === 'lome' ? Promise.all([import('./reseau'), import('./moteur/people')]) : null,
        ]);
        try { localStorage.setItem(PSEUDO_KEY, pseudo); localStorage.setItem(LIGNE_KEY, online ? 'oui' : 'non'); } catch { /* réglages gardés pour la partie */ }
        // Les autres joueurs voient la tenue de l'IAI, avec une couleur de peau tirée du pseudo ; jamais le visage d'Honorable.
        const seed = [...pseudo].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
        const reseau = net ? net[0].creerReseau(SERVEUR_URL!, pseudo, (({ face: _f, skinShade: _s, ...look }) => look)(net[1].studentLook(seed))) : null;
        if (cancelled || !host.current) return;
        game.current = createGame(host.current, {
          color: parseInt(color.swatch.slice(1), 16), night, free, foot, lome,
          map: () => mapRef.current,
          onHud: setHud,
          onEvent: (e) => { const text = MESSAGES[e]; if (text) setToast({ id: ++toastId.current, text }); },
          onNotice: (text) => setToast({ id: ++toastId.current, text }),
          onPause: () => pauseRef.current(),
          fleet, money: readMoney(), reseau, savoirUrl: online ? SAVOIR_URL : null,
        });
        game.current.start();
        // Le bouton de lancement garde sinon le focus et avale la touche Espace (saut, montée de l'hélicoptère).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (silent.current) game.current.toggleMute();
        setPlaces(game.current.places());
        setPhase('playing');
        if (wantSearch) { setSearching(true); setWantSearch(false); }
        if (matchMedia('(pointer: coarse)').matches) {
          // Android verrouille l'horizontale une fois en plein écran ; ailleurs, le message de rotation prend le relais.
          void Promise.resolve(stage.current?.requestFullscreen?.()).then(() => (isPhone() ? lockLandscape() : undefined)).catch(() => {});
        }
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => { cancelled = true; };
    // La partie se construit une seule fois, avec les réglages du moment.
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { game.current?.dispose(); game.current = null; }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const inGame = phase === 'loading' || phase === 'playing';
  useEffect(() => {
    if (!inGame) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [inGame]);

  useEffect(() => {
    if (!inGame) return;
    const portrait = matchMedia('(orientation: portrait)');
    const sync = () => setSideways(isPhone() && portrait.matches);
    sync();
    portrait.addEventListener('change', sync);
    return () => portrait.removeEventListener('change', sync);
  }, [inGame]);

  const result = hud?.result ?? null;
  useEffect(() => {
    if (phase !== 'playing') return;
    game.current?.releaseAll();
    game.current?.setPaused(sideways || paused || searching || !!result);
  }, [sideways, phase, paused, searching, result]);
  useEffect(() => {
    if (!result) return;
    game.current?.setPaused(true);
    if (result.score > readBest()) { saveBest(result.score); setBest(result.score); }
  }, [result]);

  const togglePause = useCallback((value?: boolean) => {
    setPaused((p) => {
      const next = value ?? !p;
      game.current?.setPaused(next);
      return next;
    });
  }, []);
  pauseRef.current = () => togglePause();
  const wallet = hud?.money;
  useEffect(() => { if (wallet !== undefined) saveMoney(wallet); }, [wallet]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const onDown = (e: KeyboardEvent) => {
      // Un bouton atteint au clavier garde son comportement ; après un clic, il a déjà rendu le focus.
      if ((e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) && (e.code === 'Space' || e.code === 'Enter')) return;
      if (e.target instanceof HTMLInputElement) {
        if (e.code === 'Escape') setSearching(false);
        return;
      }
      const g = game.current;
      if (!g) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (e.code === 'Escape' || key === 'p') { togglePause(); return; }
      g.press(e.code);
      if (key === 'enter') g.ignite();
      else if (key === 'h') g.horn(true);
      else if (key === 'g') g.indicator(-1);
      else if (key === 'j') g.indicator(1);
      else if (key === 'c') g.toggleView();
      else if (key === 'n') g.toggleNight();
      else if (key === 'm') g.toggleMute();
      else if (key === 'f' && g.places().length) setSearching(true);
      else if (key === 'e') g.act();
      else if (key === 't') g.wave();
      else if (key === 'b') g.dance();
      else if (key === 'i') g.toggleSmartAI();
    };
    const onUp = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement) return; game.current?.release(e.code); if (e.key.toLowerCase() === 'h') game.current?.horn(false); };
    const onHidden = () => { if (document.hidden) togglePause(true); };
    const onBlur = () => game.current?.releaseAll();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [phase, togglePause]);

  useEffect(() => {
    if (!tilt) return;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (!game.current) return;
      const angle = screen.orientation?.angle ?? 0;
      const value = angle === 90 ? e.beta ?? 0 : angle === 270 ? -(e.beta ?? 0) : e.gamma ?? 0;
      game.current.touch.steer = Math.max(-1, Math.min(1, value / 28));
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => { window.removeEventListener('deviceorientation', onTilt); if (game.current) game.current.touch.steer = 0; };
  }, [tilt]);

  const toggleTilt = async () => {
    if (tilt) { setTilt(false); return; }
    if (!window.isSecureContext) { setToast({ id: ++toastId.current, text: 'L’inclinaison exige une adresse https.' }); return; }
    const request = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (request && (await request().catch(() => 'denied')) !== 'granted') { setToast({ id: ++toastId.current, text: 'Inclinaison refusée par le téléphone.' }); return; }
    setTilt(true);
  };

  const g = game.current;
  const pill = 'glass flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm';

  return (
    <div className="shell pb-24 pt-6 md:pt-10">
      <a href={SITE_URL || '/'} className="text-sm text-white/70 underline underline-offset-4 hover:text-white">← CHANGAN Togo, le site</a>
      <h1 className="mega mt-6 text-[clamp(2rem,11vw,10rem)]">Lomé en jeu</h1>
      <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="display text-2xl md:text-3xl">Prenez le volant dans le quartier administratif de Lomé, puis réservez le vrai essai.</p>
          <p className="mt-5 text-steel">Passez devant le monument de l’Indépendance et l’hôtel du 2 Février, respectez un feu, utilisez vos clignotants, puis garez-vous devant l’IAI-Togo. Comptez deux à trois minutes, ou roulez librement.</p>
          <dl className="mt-8 grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-steel">Clavier</dt><dd className="text-right">Flèches ou ZQSD, Espace pour freiner</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-steel">Clignotants</dt><dd className="text-right">G et J</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-steel">Autres touches</dt><dd className="text-right">I : SMART AI, conduite autonome (conduite libre). Hélicoptère : Espace monter, Maj descendre, flèches avancer et tourner. Entrée démarrer, H klaxon, C vue, F recherche, N nuit, M son, P pause</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-steel">Avec Honorable</dt><dd className="text-right">E descendre, monter, entrer ou acheter ; Maj courir (ou avancer plus de 3 s), Espace sauter, T saluer, B danser</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-steel">Manette</dt><dd className="text-right">Stick gauche, gâchettes pour accélérer et freiner ; A agir, X sauter, B courir ou klaxon, Y danser</dd></div>
            <div className="flex justify-between gap-4 border-y border-line py-3"><dt className="text-steel">Téléphone</dt><dd className="text-right">À l’horizontale, volant et pédales à l’écran</dd></div>
          </dl>
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <div className="glass rounded-[28px] p-5 md:p-8">
            <fieldset className="mb-6">
              <legend className="eyebrow text-white/60">Jeu en ligne</legend>
              <label className="mt-3 block text-sm" htmlFor="pseudo">Votre pseudo, vu par les autres joueurs</label>
              <input id="pseudo" value={pseudo} maxLength={20} onChange={(e) => setPseudo(e.target.value)} autoComplete="nickname"
                className="mt-2 min-h-11 w-full rounded-full border border-white/30 bg-black/30 px-4 text-base text-white placeholder:text-white/50" />
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="h-5 w-5 accent-white" />
                Jouer en ligne avec les autres joueurs{!SERVEUR_URL && ' (serveur non configuré)'}
              </label>
              {online && pseudo.trim().length < 2 && <p className="text-sm text-[#ff9a8f]">Le pseudo doit compter au moins 2 caractères.</p>}
            </fieldset>
            <fieldset>
              <legend className="eyebrow text-white/60">Lieu</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {([['lome', 'Lomé, quartier administratif'], ['grid', 'Ville imaginaire']] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={place === value} onClick={() => setPlace(value)}
                    className={`min-h-11 rounded-full px-5 text-sm ${place === value ? 'bg-white text-[#0b0c0e]' : 'border border-white/25'}`}>{label}</button>
                ))}
              </div>
              {place === 'grid' && <p className="mt-2 text-sm text-white/70">Plus légère, pour les téléphones modestes.</p>}
            </fieldset>
            <fieldset className="mt-6">
              <legend className="eyebrow text-white/60">Couleur</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === color.id} aria-label={c.label} title={c.label} onClick={() => setColor(c)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border ${c.id === color.id ? 'border-white' : 'border-white/25'}`}>
                    <span className="h-7 w-7 rounded-full" style={{ background: c.swatch }} />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/70">{color.label}</p>
            </fieldset>
            <fieldset className="mt-6">
              <legend className="eyebrow text-white/60">Ambiance</legend>
              <div className="mt-3 flex gap-2">
                {[[false, 'Jour'], [true, 'Nuit']].map(([value, label]) => (
                  <button key={String(label)} type="button" aria-pressed={night === value} onClick={() => setNight(value as boolean)}
                    className={`min-h-11 rounded-full px-5 text-sm ${night === value ? 'bg-white text-[#0b0c0e]' : 'border border-white/25'}`}>{label}</button>
                ))}
              </div>
            </fieldset>
            <div className="mt-8 grid gap-3">
              <button ref={start} type="button" onClick={() => launch(false)} className="btn btn-light w-full">Prendre le volant</button>
              <button type="button" onClick={() => launch(true)} className="btn btn-ghost w-full">Conduite libre</button>
              <button type="button" onClick={() => launch(true, true)} className="btn btn-ghost w-full">Se promener avec Honorable</button>
              {place === 'lome' && <button type="button" onClick={() => { setWantSearch(true); launch(true); }} className="btn btn-ghost w-full">Aller à un lieu</button>}
            </div>
            {best > 0 && <p className="num mt-4 text-sm text-white/70">Votre record : {best} points</p>}
            {phase === 'unsupported' && <p role="alert" className="mt-4 text-sm">Votre navigateur ne peut pas afficher la 3D. <a className="underline" href={`${SITE_URL}/contact?demande=essai`}>Réservez directement un essai.</a></p>}
            {phase === 'error' && <p role="alert" className="mt-4 text-sm">Le jeu n’a pas pu se charger. Vérifiez votre connexion et réessayez.</p>}
          </div>
          <p className="mt-4 text-sm text-steel">Simulation ludique : la Nevo Q05 est modélisée d’après des photos, ses sons et son comportement ne reflètent pas le vrai véhicule. Respectez le code de la route en conduite réelle.</p>
          <p className="mt-2 text-sm text-steel">En conduite libre, Honorable descend de la voiture, marche, court, danse, ramasse des billets, pilote l’hélicoptère posé sur son aire près du départ, prend une sportive, un SUV de luxe, une moto ou d’autres véhicules garés, entre dans les bâtiments et fait ses courses au supermarché Le Champion. Les personnages, les intérieurs et les prix du Champion sont imaginés pour le jeu ; les voitures stylisées viennent du Car Kit de Kenney (licence CC0).</p>
          <p className="mt-2 text-sm text-steel">Noms et rues de la recherche : ceux de la carte, dans le quartier administratif. Plan de Lomé : <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">© contributeurs OpenStreetMap</a>. Rues, emprises des bâtiments et noms suivent la carte ; façades, hauteurs et arbres sont en grande partie stylisés. L’immeuble de l’IAI-Togo, absent de la carte, a été relevé sur vue aérienne.</p>
        </div>
      </div>

      {inGame && (
        <div ref={stage} id="jeu" className="theme-dark fixed inset-0 z-[60] overflow-hidden bg-[#0b0c0e] text-white"
          data-x={hud?.x.toFixed(2)} data-z={hud?.z.toFixed(2)} data-heading={hud?.heading.toFixed(3)} data-speed={hud?.speed} data-step={hud?.step} data-hits={hud?.hits} data-reds={hud?.reds} data-signals={hud?.signals} data-fps={hud?.fps} data-indicator={hud?.indicator} data-view={hud?.view} data-night={hud?.night} data-mode={hud?.mode} data-vehicle={hud?.vehicle} data-inside={hud?.inside ?? ''} data-online={hud?.online?.statut ?? ''} data-smart={hud?.smart ? 'on' : 'off'} data-voisins={hud?.online?.voisins ?? 0}
          onPointerDownCapture={(e) => { if (e.pointerType === 'touch' && !touchUi) setTouchUi(true); }}
          onPointerUpCapture={(e) => { if (e.target instanceof HTMLElement) requestAnimationFrame(() => (e.target as HTMLElement).closest('button')?.blur()); }}>
          <div ref={host} className="absolute inset-0" />
          {phase === 'loading' && <p role="status" className="absolute inset-0 flex items-center justify-center text-white/80">Construction de la ville…</p>}
          {sideways && (
            <div role="alertdialog" aria-modal="true" aria-label="Orientation du téléphone" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#0b0c0e] p-6 text-center">
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-14 w-14 fill-none stroke-white" strokeWidth="2"><rect x="5" y="15" width="38" height="18" rx="3" /><path d="M38 21v6" /></svg>
              <p className="display text-2xl">Tournez votre téléphone</p>
              <p className="text-sm text-white/70">L’essai virtuel se joue à l’horizontale. La partie commence dès que le téléphone est couché.</p>
            </div>
          )}
          {hud && (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))] md:p-5">
                <div className="glass pointer-events-auto max-w-[min(30rem,58vw)] rounded-[20px] px-4 py-3" aria-live="polite">
                  {hud.nav && (
                    <div data-testid="itineraire">
                      <p className="eyebrow num text-[.65rem] text-white/60">Vers {hud.nav.name} · {hud.nav.remaining >= 1000 ? `${(hud.nav.remaining / 1000).toFixed(1).replace('.', ',')} km` : `${hud.nav.remaining} m`}</p>
                      <p className="mt-1 text-sm leading-snug md:text-base">{hud.nav.next ? `Dans ${hud.nav.toNext} m, tournez à ${hud.nav.next.side < 0 ? 'gauche' : 'droite'}${hud.nav.next.street ? ` : ${hud.nav.next.street}` : ''}` : 'Continuez tout droit jusqu’à l’arrivée'}</p>
                      <button type="button" onClick={() => g?.clearNav()} className="mt-1 min-h-8 text-xs underline underline-offset-2">Annuler l’itinéraire</button>
                    </div>
                  )}
                  {!hud.nav && !hud.free && <p className="eyebrow num text-[.65rem] text-white/60">Étape {hud.stepNo}/{hud.stepTotal} · {hud.score} pts</p>}
                  {!hud.nav && <p className="mt-1 text-sm leading-snug md:text-base">{hud.text}</p>}
                  {hud.street && <p className="mt-1 text-xs text-white/60 [@media(max-height:480px)]:hidden">{hud.street}</p>}
                  {hud.park > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-white" style={{ width: `${hud.park * 100}%` }} /></div>}
                </div>
                <div className="pointer-events-auto flex flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {hud.smartAvailable && <SmartAIButton on={!!hud.smart} onToggle={() => g?.toggleSmartAI()} />}
                    {hud.online && (
                      <span className={`${pill} num gap-1.5 text-xs`} data-testid="en-ligne" title={hud.online.statut === 'en-ligne' ? `${hud.online.salle} joueurs dans votre ville, ${hud.online.total} sur ce serveur` : 'Connexion au jeu en ligne'}>
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${hud.online.statut === 'en-ligne' ? 'bg-[#35e07a]' : hud.online.statut === 'connexion' ? 'bg-[#f2c14e]' : 'bg-[#ff6a5a]'}`} />
                        {hud.online.statut === 'en-ligne' ? `${hud.online.salle} en ligne` : hud.online.statut === 'connexion' ? 'Connexion…' : hud.online.statut === 'refus' ? 'Refusé' : 'Hors ligne'}
                      </span>
                    )}
                    <span className={`${pill} num gap-1.5 font-medium`} data-testid="argent" title="Argent d’Honorable"><Icon name="wallet" className="h-4 w-4 text-[#35e07a]" />{money(hud.money)}</span>
                    {hud.pad && <span className={pill} title="Manette connectée" aria-label="Manette connectée"><Icon name="pad" /></span>}
                    <button type="button" className={pill} aria-label="Pause" title="Pause" onClick={() => togglePause(true)}><Icon name="pause" /></button>
                    {hud.canSearch && <button type="button" className={pill} aria-label="Rechercher un lieu" title="Rechercher un lieu" onClick={() => { setQuery(''); setSearching(true); }}><Icon name="search" /></button>}
                    <button type="button" className={pill} aria-label={hud.view === 'chase' ? 'Vue conducteur' : hud.view === 'driver' ? 'Vue aérienne' : 'Vue extérieure'} title="Changer de vue" onClick={() => g?.toggleView()}><Icon name="view" /></button>
                    <button type="button" className={pill} aria-label={hud.night ? 'Passer au jour' : 'Passer à la nuit'} title={hud.night ? 'Jour' : 'Nuit'} onClick={() => g?.toggleNight()}><Icon name={hud.night ? 'sun' : 'moon'} /></button>
                    <button type="button" className={pill} aria-pressed={hud.muted} aria-label={hud.muted ? 'Activer le son' : 'Couper le son'} title="Son" onClick={() => { silent.current = !hud.muted; g?.toggleMute(); }}><Icon name={hud.muted ? 'mute' : 'sound'} /></button>
                  </div>
                  <div className="relative">
                    <canvas ref={mapRef} width={260} height={260} aria-hidden="true" className="glass h-24 w-24 rounded-[18px] md:h-36 md:w-36 [@media(max-height:480px)]:h-24 [@media(max-height:480px)]:w-24" />
                    {hud.bearing !== null && (
                      <div className="glass absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs">
                        <span aria-hidden="true" className="inline-block text-base leading-none" style={{ transform: `rotate(${-hud.bearing}rad)` }}>↑</span>
                        <span className="num">{hud.distance} m</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {toast && <p key={toast.id} role="status" className="glass pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 rounded-full px-5 py-2.5 text-center text-sm">{toast.text}</p>}

              {hud.inside && <p className="glass pointer-events-none absolute left-1/2 top-[max(5.5rem,env(safe-area-inset-top))] -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-xs [@media(max-height:480px)]:top-3">{hud.inside.startsWith('IAI-Togo') ? `${hud.inside} · couloirs et escaliers d’après vidéo, salles supposées` : `Intérieur imaginé · ${hud.inside}`}</p>}

              {hud.smart && <SmartAIFrame t={hud.smart} />}
              {hud.smart && <SmartAIDashboard t={hud.smart} />}
              {hud.shop && (
                <section aria-label="Panier" className="glass absolute left-3 top-1/2 w-[min(15rem,42vw)] -translate-y-1/2 rounded-[20px] p-3 text-sm md:left-5">
                  <p className="flex items-center gap-2 font-medium"><Icon name="basket" className="h-4 w-4" />Panier · {hud.basket.length}</p>
                  {hud.basket.length ? (
                    <>
                      <ul className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto text-xs">
                        {hud.basket.map((b, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{b.name}</span><span className="num shrink-0 text-white/70">{money(b.price)}</span></li>)}
                      </ul>
                      <p className="num mt-2 flex justify-between border-t border-white/15 pt-2 font-medium"><span>Total</span><span>{money(hud.basket.reduce((a, b) => a + b.price, 0))}</span></p>
                      <button type="button" onClick={() => g?.emptyBasket()} className="mt-2 min-h-9 text-xs underline underline-offset-2">Vider le panier</button>
                    </>
                  ) : <p className="mt-1 text-xs text-white/70">Approchez-vous d’un rayon pour prendre un article, puis payez en caisse.</p>}
                  {hud.bag > 0 && <p className="mt-2 text-xs text-white/60">Déjà acheté : {hud.bag} article{hud.bag > 1 ? 's' : ''}</p>}
                </section>
              )}

              {hud.action && !paused && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] flex justify-center px-3 md:bottom-36">
                  <button type="button" onClick={() => g?.act()} className="pointer-events-auto flex min-h-12 max-w-[min(26rem,80vw)] items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[#0b0c0e] shadow-[0_8px_30px_rgb(0_0_0/.4)] active:scale-95">
                    {!touchUi && <kbd className="rounded-md border border-black/20 px-1.5 text-xs">{hud.pad ? 'A' : 'E'}</kbd>}<span className="truncate">{hud.action}</span>
                  </button>
                </div>
              )}

              {hud.mode === 'car' && !hud.engineOn && !paused && (
                <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                  <button type="button" onClick={() => g?.ignite()} className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-[#ff5a4d] bg-[#16181c] text-sm font-medium shadow-[0_0_40px_rgb(255_90_77/.45)] transition-transform active:scale-95">
                    <span className="eyebrow text-[.6rem] text-white/60">Moteur</span>Start
                  </button>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:p-5">
                <div className="pointer-events-auto">
                  {touchUi && hud.mode === 'foot' && <Joystick onMove={(x, y) => { if (g) { g.touch.steer = Math.abs(x) > 0.2 ? x : 0; g.touch.throttle = Math.max(0, -y); g.touch.brake = Math.max(0, y - 0.25); } }} />}
                  {touchUi && hud.mode === 'car' && !tilt && !hud.smart && <TouchWheel onSteer={(v) => { if (g) g.touch.steer = v; }} />}
                </div>
                <div className={`glass pointer-events-auto flex items-center gap-1.5 rounded-[22px] px-2 py-2 md:gap-3 md:px-4 ${touchUi ? 'absolute bottom-44 left-1/2 -translate-x-1/2 landscape:bottom-3 sm:bottom-52' : 'mb-1'}`}>
                  {hud.mode === 'foot' && <p className="px-2 text-xs"><span className="font-medium">Honorable</span><span className="block text-white/60">{hud.dance ? 'danse' : hud.inside ? 'à l’intérieur' : hud.running ? 'court' : hud.speed > 0 ? 'marche' : 'à pied'}</span></p>}
                  {hud.mode === 'car' && <button type="button" aria-label="Clignotant gauche" aria-pressed={hud.indicator === -1} onClick={() => g?.indicator(-1)} className={`flex h-11 w-11 items-center justify-center rounded-full ${hud.indicator === -1 && hud.blink ? 'text-[#35e07a]' : 'text-white/55'}`}><Icon name="left" className="h-6 w-6" /></button>}
                  <div className="min-w-14 text-center">
                    <p className={`num text-2xl font-light leading-none md:text-4xl ${hud.overLimit ? 'text-[#ff7a6b]' : ''}`} data-testid="vitesse">{hud.speed}</p>
                    <p className="mt-1 text-[.65rem] text-white/60">km/h · {hud.mode === 'car' ? `${hud.vehicle.toLowerCase()} · ${hud.gear}` : hud.gear}</p>
                    {hud.smart && <p className="mt-0.5 text-[.65rem] font-semibold text-[#35e07a]">Pilote : SMART AI</p>}
                    {hud.altitude !== null && <p className="num mt-0.5 text-xs" data-testid="altitude">Altitude {hud.altitude} m</p>}
                  </div>
                  {hud.mode === 'car' ? (
                    <>
                      <button type="button" aria-label="Clignotant droit" aria-pressed={hud.indicator === 1} onClick={() => g?.indicator(1)} className={`flex h-11 w-11 items-center justify-center rounded-full ${hud.indicator === 1 && hud.blink ? 'text-[#35e07a]' : 'text-white/55'}`}><Icon name="right" className="h-6 w-6" /></button>
                      {!hud.free && <span className="num hidden h-9 w-9 items-center justify-center rounded-full border-[3px] border-[#d8291d] bg-white text-xs font-bold text-black sm:flex" title="Limitation : 50 km/h">50</span>}
                      <Hold label="Klaxon" className="flex h-11 w-11 items-center justify-center rounded-full text-white/80" onChange={(on) => g?.horn(on)}><Icon name="horn" className="h-6 w-6" /></Hold>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label="Saluer" title="Saluer (T)" onClick={() => g?.wave()} className="flex h-11 w-11 items-center justify-center rounded-full text-white/80"><Icon name="wave" className="h-6 w-6" /></button>
                      <button type="button" aria-label={hud.dance ? 'Changer de danse' : 'Danser'} aria-pressed={hud.dance > 0} title="Danser (B)" onClick={() => g?.dance()} className={`flex h-11 w-11 items-center justify-center rounded-full ${hud.dance ? 'bg-white text-[#0b0c0e]' : 'text-white/80'}`}><Icon name="dance" className="h-6 w-6" /></button>
                    </>
                  )}
                </div>
                <div className="pointer-events-auto flex items-end gap-2">
                  {touchUi && hud.mode === 'foot' && (
                    <div className="flex items-end gap-2">
                      <button type="button" aria-label="Sauter" onPointerDown={() => { if (g) g.touch.jump = true; }} className="glass flex h-20 w-20 items-center justify-center rounded-full"><Icon name="jump" className="h-8 w-8" /></button>
                      <Hold label="Courir" className="flex h-24 w-24 items-center justify-center rounded-full border border-white/30 bg-white/90 text-[#0b0c0e]" onChange={(on) => { if (g) g.touch.run = on; }}><Icon name="run" className="h-10 w-10" /></Hold>
                    </div>
                  )}
                  {touchUi && hud.altitude !== null && (
                    <div className="flex flex-col gap-2">
                      <Hold label="Monter" className="glass flex h-16 w-16 flex-col items-center justify-center rounded-[18px] text-[.6rem]" onChange={(on) => { if (g) g.touch.lift = on ? 1 : 0; }}><Icon name="up" className="h-7 w-7" />Monter</Hold>
                      <Hold label="Descendre" className="glass flex h-16 w-16 flex-col items-center justify-center rounded-[18px] text-[.6rem]" onChange={(on) => { if (g) g.touch.lift = on ? -1 : 0; }}><Icon name="down" className="h-7 w-7" />Descendre</Hold>
                    </div>
                  )}
                  {touchUi && hud.mode === 'car' && !hud.smart && (
                    <>
                      <div className="flex flex-col items-center gap-2">
                        <button type="button" aria-pressed={tilt} aria-label="Conduire en inclinant le téléphone" onClick={toggleTilt} className={`${pill} !h-9 ${tilt ? 'bg-white !text-[#0b0c0e]' : ''}`}><Icon name="tilt" /></button>
                        <Hold label="Frein" className="glass flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[18px] text-[.65rem] sm:h-24" onChange={(on) => { if (g) g.touch.brake = on ? 1 : 0; }}><Icon name="brake" className="h-7 w-7" />Frein</Hold>
                      </div>
                      <Hold label="Accélérateur" className="flex h-32 w-20 flex-col items-center justify-center gap-1 rounded-[18px] border border-white/30 bg-white/90 text-[.65rem] font-medium text-[#0b0c0e] sm:h-36" onChange={(on) => { if (g) g.touch.throttle = on ? 1 : 0; }}><Icon name="gas" className="h-8 w-8" />Accélérer</Hold>
                    </>
                  )}
                </div>
              </div>

              {searching && (
                <div role="dialog" aria-modal="true" aria-label="Rechercher un lieu" className="absolute inset-0 z-10 flex justify-center bg-black/60 p-3 md:p-8">
                  <div className="glass flex h-full w-full max-w-xl flex-col rounded-[24px] p-4">
                    <div className="flex items-center gap-2">
                      <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Un lieu ou une rue : IAI, mairie, avenue…" aria-label="Rechercher un lieu ou une rue"
                        className="min-h-11 w-full min-w-0 rounded-full border border-white/30 bg-black/30 px-4 text-base text-white placeholder:text-white/50" />
                      <button type="button" onClick={() => setSearching(false)} className="min-h-11 shrink-0 px-3 text-sm underline underline-offset-2">Fermer</button>
                    </div>
                    <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
                      {searchPlaces(places, query).map((p) => (
                        <li key={`${p.kind}${p.name}`}>
                          <button type="button" onClick={() => {
                            const ok = g?.navigate(p.name, p.x, p.z);
                            setSearching(false);
                            if (!ok) setToast({ id: ++toastId.current, text: 'Aucun itinéraire trouvé vers ce lieu.' });
                          }} className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-white/10 py-2 text-left text-sm hover:bg-white/10">
                            <span>{p.name}</span><span className="shrink-0 text-xs text-white/50">{p.kind === 'rue' ? 'Rue' : 'Lieu'}</span>
                          </button>
                        </li>
                      ))}
                      {searchPlaces(places, query).length === 0 && <li className="py-4 text-sm text-white/70">Aucun lieu de ce nom sur la carte du quartier.</li>}
                    </ul>
                  </div>
                </div>
              )}

              {paused && !result && (
                <div role="dialog" aria-modal="true" aria-label="Pause" className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
                  <div className="glass w-full max-w-sm rounded-[28px] p-6">
                    <h2 className="display text-3xl">Pause</h2>
                    <div className="mt-6 grid gap-3">
                      <button type="button" autoFocus onClick={() => togglePause(false)} className="btn btn-light w-full">Reprendre</button>
                      <button type="button" onClick={leave} className="btn btn-ghost w-full">Quitter le jeu</button>
                    </div>
                  </div>
                </div>
              )}

              {result && !dismissed && (
                <div role="dialog" aria-modal="true" aria-labelledby="bilan" className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-black/55 p-4">
                  <div className="glass w-full max-w-md rounded-[28px] p-6 md:p-8">
                    <p className="eyebrow text-white/60">Parcours terminé</p>
                    <h2 id="bilan" className="mega mt-3 text-5xl"><span className="num">{result.score}</span> pts</h2>
                    <p className="mt-3 text-xl tracking-widest" role="img" aria-label={`${result.stars} étoiles sur 3`}>{'★'.repeat(result.stars)}<span className="text-white/25">{'★'.repeat(3 - result.stars)}</span></p>
                    <dl className="num mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <dt className="text-white/60">Temps</dt><dd className="text-right">{Math.floor(result.time / 60)} min {String(Math.round(result.time % 60)).padStart(2, '0')} s</dd>
                      <dt className="text-white/60">Chocs</dt><dd className="text-right">{result.hits}</dd>
                      <dt className="text-white/60">Feux grillés</dt><dd className="text-right">{result.reds}</dd>
                      <dt className="text-white/60">Clignotants</dt><dd className="text-right">{result.signals}/{result.signalTotal}</dd>
                    </dl>
                    <div className="mt-6 grid gap-3">
                      <a href={`${SITE_URL}/contact?demande=essai`} autoFocus className="btn btn-light w-full">Réserver un vrai essai</a>
                      <button type="button" onClick={() => { g?.continueFree(); g?.setPaused(false); setDismissed(true); }} className="btn btn-ghost w-full">Continuer à rouler</button>
                      <button type="button" onClick={leave} className="btn btn-ghost w-full">Rejouer</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
