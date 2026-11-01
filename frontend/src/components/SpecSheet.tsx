import { SPEC_GROUP } from '@/lib/labels';
import type { Spec } from '@/lib/types';

/** Groupes séparés, en colonnes sur grand écran et en sections repliables sur mobile, sans tableau géant. */
export function SpecSheet({ specs }: { specs: Spec[] }) {
  const groups = SPEC_GROUP.map(([id, title]) => ({ id, title, rows: specs.filter((s) => s.group === id) })).filter((g) => g.rows.length);
  const sources = [...new Map(specs.filter((s) => s.sourceUrl).map((s) => [s.sourceUrl, s])).values()];
  const unconfirmed = specs.some((s) => s.verification !== 'CONFIRMED_TOGO');
  return (
    <div>
      {unconfirmed && (
        <p className="mb-10 max-w-3xl border-l-2 border-accent pl-4 text-[0.9375rem] leading-relaxed">
          Données publiées pour le modèle à l’international. La version vendue au Togo peut différer : motorisation, équipements et dimensions restent à confirmer auprès du concessionnaire.
        </p>
      )}
      <div className="grid gap-x-16 md:grid-cols-2">
        {groups.map((g, i) => (
          <details key={g.id} open className="group mb-4 md:mb-12" data-first={i === 0}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between border-b border-ink pb-3 md:pointer-events-none [&::-webkit-details-marker]:hidden">
              <h3 className="display text-2xl">{g.title}</h3>
              <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45 md:hidden">+</span>
            </summary>
            <dl>
              {g.rows.map((s) => (
                <div key={s.id} className="grid grid-cols-[minmax(6.5rem,2fr)_3fr] gap-4 border-b border-line py-3.5 text-[0.9375rem]">
                  <dt className="text-steel">{s.label}</dt>
                  <dd className="num">{s.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
      {sources.length > 0 && (
        <p className="mt-2 text-sm text-steel">Source : {sources.map((s, i) => <span key={s.id}>{i > 0 && ', '}<a className="underline" href={s.sourceUrl!} target="_blank" rel="noopener">{s.sourceLabel ?? s.sourceUrl}</a></span>)}.</p>
      )}
    </div>
  );
}
