import type { Metadata } from 'next';
import Link from 'next/link';
import { Car } from '@/components/Car';
import { getVehicle, getVehicles } from '@/lib/api';
import { AVAILABILITY, ENERGY, fcfa, SPEC_GROUP } from '@/lib/labels';
import type { VehicleDetail } from '@/lib/types';

export const metadata: Metadata = { title: 'Comparer', description: 'Comparez deux ou trois véhicules CHANGAN, sur les données effectivement renseignées.', alternates: { canonical: '/comparer' } };

type P = { searchParams: Promise<{ m?: string }> };
const href = (slugs: string[]) => (slugs.length ? `/comparer?m=${slugs.join(',')}` : '/comparer');

export default async function Compare({ searchParams }: P) {
  const slugs = [...new Set(((await searchParams).m ?? '').split(',').filter(Boolean))].slice(0, 3);
  const [all, details] = await Promise.all([getVehicles(), Promise.all(slugs.map((s) => getVehicle(s)))]);
  const chosen = details.filter((d): d is VehicleDetail => !!d);
  const ids = chosen.map((c) => c.slug);
  const available = all.filter((v) => !ids.includes(v.slug));

  const value = (v: VehicleDetail, key: string) => v.specifications.find((s) => (s.key ?? s.id) === key)?.value ?? null;
  const groups = SPEC_GROUP.map(([id, title]) => {
    const keys = new Map<string, string>();
    for (const v of chosen) for (const s of v.specifications) if (s.group === id && s.key) keys.set(s.key, s.label);
    return { title, rows: [...keys].map(([key, label]) => ({ label, values: chosen.map((v) => value(v, key)) })) };
  }).filter((g) => g.rows.length);
  const prices = chosen.map((v) => { const p = v.versions.map((x) => x.priceFcfa).filter((n): n is number => n != null); return p.length ? `À partir de ${fcfa(Math.min(...p))}` : null; });
  const general = [
    { label: 'Catégorie', values: chosen.map((v) => v.category.name) },
    { label: 'Énergie', values: chosen.map((v) => v.energies.map((e) => ENERGY[e]).join(', ') || null) },
    { label: 'Disponibilité', values: chosen.map((v) => AVAILABILITY[v.availability]) },
    ...(prices.some(Boolean) ? [{ label: 'Prix', values: prices }] : []),
  ];
  const cols = { gridTemplateColumns: `repeat(${chosen.length}, minmax(0, 1fr))` };

  const Row = ({ label, values }: { label: string; values: (string | null)[] }) => {
    const differs = new Set(values).size > 1;
    return (
      <div className="border-b border-line py-3.5 md:grid md:grid-cols-[14rem_1fr] md:gap-6">
        <div className="mb-2 flex items-center gap-2 text-sm text-steel md:mb-0">{label}{differs && <span title="Valeurs différentes" className="h-1.5 w-1.5 bg-accent" />}{differs && <span className="sr-only">(valeurs différentes)</span>}</div>
        <div className="num grid gap-3 text-[0.9375rem] sm:gap-6" style={cols}>
          {values.map((x, i) => <div key={i} className={`min-w-0 break-words ${x ? '' : 'text-steel'}`}>{x ?? 'Non renseigné'}</div>)}
        </div>
      </div>
    );
  };

  return (
    <div className="shell pb-24 pt-10 md:pt-16">
      <h1 className="mega text-[clamp(2rem,11vw,10rem)]">Comparer</h1>
      <p className="mt-5 max-w-xl text-lg leading-snug text-steel">Choisissez deux ou trois modèles. Seules les données renseignées sont affichées, et les écarts sont signalés d’un repère bleu.</p>

      {chosen.length > 0 && (
        <div className="glass sticky top-20 z-20 mt-10 rounded-[24px] px-4 py-3 md:grid md:grid-cols-[14rem_1fr] md:gap-6">
          <div className="hidden md:block" />
          <div className="grid gap-3 sm:gap-6" style={cols}>
            {chosen.map((v) => {
              const img = v.media.find((m) => m.isPrimary);
              return (
                <div key={v.slug} className="min-w-0">
                  <Link href={`/vehicules/${v.slug}`} className="hidden aspect-[3/2] sm:block"><Car media={img ?? null} sizes="30vw" /></Link>
                  <Link href={`/vehicules/${v.slug}`} className="display mt-2 block break-words text-lg sm:text-2xl">{v.name}</Link>
                  <Link href={href(ids.filter((s) => s !== v.slug))} scroll={false} className="mt-1 inline-flex min-h-9 items-center text-sm text-white/70 underline" aria-label={`Retirer le ${v.name} de la comparaison`}>Retirer</Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chosen.length >= 2 && (
        <div className="mt-2">
          <Section title="Général">{general.map((r) => <Row key={r.label} {...r} />)}</Section>
          {groups.map((g) => <Section key={g.title} title={g.title}>{g.rows.map((r) => <Row key={r.label} {...r} />)}</Section>)}
          <p className="mt-6 max-w-2xl text-sm text-steel">Données issues de sources internationales, à confirmer pour les versions vendues au Togo.</p>
        </div>
      )}

      {chosen.length < 3 && (
        <section className="mt-14" aria-labelledby="ajouter">
          <h2 id="ajouter" className="eyebrow text-steel">{chosen.length === 0 ? 'Choisissez un premier modèle' : chosen.length === 1 ? 'Ajoutez un second modèle' : 'Ajoutez un troisième modèle (facultatif)'}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 lg:grid-cols-6">
            {available.map((v) => (
              <li key={v.slug}>
                <Link href={href([...ids, v.slug])} scroll={false} aria-label={`Ajouter le ${v.name} à la comparaison`} className="group block">
                  <span className="block aspect-[3/2] overflow-hidden rounded-2xl bg-mist p-3"><Car media={v.image} sizes="(min-width:768px) 20vw, 50vw" /></span>
                  <span className="mt-2 flex items-baseline justify-between gap-2"><span className="font-medium">{v.name}</span><span aria-hidden="true" className="text-lg">+</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10"><h2 className="display border-b border-ink pb-3 text-2xl">{title}</h2>{children}</section>;
}
