import type { Telemetry } from './moteur/smart-ai/types';

const COULEUR = { vert: '#35e07a', orange: '#f5a524', rouge: '#ff4d3d' } as const;
const LIBELLE = { vert: 'Route dégagée', orange: 'Vigilance', rouge: 'Danger critique' } as const;

/** Bouton SMART AI, dans la rangée de boutons du jeu : gris à l'arrêt, vert quand l'IA conduit. */
export function SmartAIButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" data-testid="smart-ai" aria-pressed={on} onClick={onToggle} title="Conduite autonome (touche I)"
      className={`flex h-11 items-center gap-2 rounded-full px-3.5 text-xs font-semibold tracking-wide transition-colors ${on ? 'bg-[#35e07a] text-[#06210f] shadow-[0_0_24px_rgb(53_224_122/.55)]' : 'glass text-white'}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${on ? 'bg-[#06210f]' : 'bg-white/50'}`} />
      SMART AI : {on ? 'ON' : 'OFF'}
    </button>
  );
}

/** Tableau de bord de SMART AI : ce que l'IA perçoit, le danger, sa décision et ce qu'elle exécute. */
export function SmartAIDashboard({ t }: { t: Telemetry }) {
  const c = COULEUR[t.couleur];
  return (
    <section aria-label="Tableau de bord SMART AI" aria-live="polite" data-testid="smart-ai-panneau" data-danger={t.niveau} data-decision={t.decision}
      className="glass absolute left-3 top-1/2 max-h-[calc(100svh-11rem)] w-[min(19rem,48vw)] -translate-y-1/2 overflow-y-auto rounded-[20px] p-3 text-xs md:left-5 md:text-sm [@media(max-height:480px)]:top-[58%] [@media(max-height:480px)]:p-2.5">
      <p className="flex items-center gap-2 font-semibold tracking-wide">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
        SMART AI : ACTIVÉE
      </p>
      <p className="mt-0.5 text-[.7rem]" style={{ color: c }}>{LIBELLE[t.couleur]}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 [@media(max-height:480px)]:gap-y-0">
        <dt className="text-white/60">Vitesse</dt><dd className="num text-right">{t.vitesse} km/h</dd>
        <dt className="text-white/60">Objet détecté</dt><dd className="text-right font-medium">{t.objet}</dd>
        <dt className="text-white/60">Distance</dt><dd className="num text-right">{t.distance === null ? '—' : `${t.distance} m`}</dd>
        <dt className="text-white/60">Danger</dt><dd className="text-right font-medium" style={{ color: t.niveau >= 2 ? c : undefined }}>{t.danger}</dd>
        <dt className="text-white/60">Décision</dt><dd className="text-right font-semibold">{t.decision}</dd>
        <dt className="text-white/60">Action</dt><dd className="text-right">{t.action}</dd>
        <dt className="text-white/60">Trajectoire</dt><dd className="text-right" data-testid="smart-trajectoire">{t.trajectoire}</dd>
        <dt className="text-white/60">Navigation</dt><dd className="text-right" data-testid="smart-navigation">{t.navigation}</dd>
        <dt className="text-white/60">Contournements</dt><dd className="num text-right">{t.contournements}</dd>
        <dt className="text-white/60">Anti-blocage</dt><dd className="text-right" data-testid="smart-antiblocage">{t.antiBlocage}</dd>
      </dl>
      {t.savoir && <p className="mt-2 text-[.68rem] text-[#9fd8ff]" data-testid="smart-savoir">Savoir : {t.savoir}</p>}
      {t.passages && <p className="mt-2 text-[.68rem] leading-snug text-white/70 [@media(max-height:480px)]:hidden">Passages : {t.passages}</p>}
      <p className="mt-2 border-t border-white/15 pt-2 leading-snug text-white/85 [@media(max-height:480px)]:hidden">{t.message}</p>
      <p className="mt-1 text-[.65rem] text-white/50 [@media(max-height:480px)]:hidden">{t.percus} objets analysés · vos commandes sont en pause</p>
    </section>
  );
}

/** Liseré autour de l'écran : la couleur du danger, rappel permanent que l'IA tient le volant. */
export function SmartAIFrame({ t }: { t: Telemetry }) {
  const c = COULEUR[t.couleur];
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 transition-shadow duration-300" style={{ boxShadow: `inset 0 0 0 3px ${c}, inset 0 0 ${t.couleur === 'rouge' ? 60 : 28}px ${c}${t.couleur === 'rouge' ? '88' : '44'}` }} />;
}
