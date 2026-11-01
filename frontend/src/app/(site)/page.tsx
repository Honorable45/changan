import type { Metadata } from 'next';
import Link from 'next/link';
import { AngleExplorer } from '@/components/AngleExplorer';
import { Car } from '@/components/Car';
import { HeroDrive } from '@/components/HeroDrive';
import { HeroStage } from '@/components/HeroStage';
import { DRIVE_VIEWS } from '@/lib/drive';
import { Photo } from '@/components/Photo';
import { RangeIndex } from '@/components/RangeIndex';
import { RequestSection } from '@/components/RequestSection';
import { getCategories, getSite, getVehicle, getVehicles } from '@/lib/api';
import { hasCutout } from '@/lib/media';
import type { Media, VehicleDetail } from '@/lib/types';

export const metadata: Metadata = {
  title: { absolute: 'CHANGAN Togo | La gamme CHANGAN à Lomé' },
  description: 'Explorez les véhicules CHANGAN : photographies, caractéristiques et contact direct avec le concessionnaire au Togo.',
};

const specOf = (v: VehicleDetail | null, key: string) => v?.specifications.find((s) => s.key === key);
const byView = (v: VehicleDetail | null, ...views: string[]): Media | undefined => v?.media.find((m) => m.kind === 'IMAGE' && views.includes(m.view));

export default async function Home() {
  const [site, vehicles, categories] = await Promise.all([getSite(), getVehicles(), getCategories()]);
  const hero = site.hero ?? vehicles[0] ?? null;
  const [heroDetail, featured] = await Promise.all([
    hero ? getVehicle(hero.slug) : null,
    site.featured ? getVehicle(site.featured.slug) : null,
  ]);

  const interior = (['DASHBOARD', 'INTERIOR', 'SEATS', 'TRUNK'] as const)
    .map((view) => ({ view, m: byView(featured, view) })).filter((d): d is { view: typeof d.view; m: Media } => !!d.m);
  const INTERIOR_TITLE = { DASHBOARD: 'Poste de conduite', INTERIOR: 'Habitacle', SEATS: 'Places arrière', TRUNK: 'Coffre' };

  const angleLabel = (m: Media) => (m.view === 'SIDE' ? 'Profil' : /arrière/.test(m.alt) ? 'Arrière' : /avant/.test(m.alt) ? 'Avant' : 'Trois-quarts');
  const seen = new Set<string>();
  const angles = (heroDetail?.media ?? []).filter((m) => hasCutout(m) && !seen.has(angleLabel(m)) && seen.add(angleLabel(m))).map((media) => ({ media, label: angleLabel(media) }));
  const immersive = heroDetail?.media.some((m) => m.kind === 'MODEL_3D' || m.kind === 'SPIN_FRAME') ? 'exploration' : null;
  const facts = featured ? ([['Puissance', specOf(featured, 'power')?.value], ['Autonomie', specOf(featured, 'range')?.value], ['Longueur', specOf(featured, 'length')?.value], ['Empattement', specOf(featured, 'wheelbase')?.value]] as const).filter(([, value]) => value) : [];

  return (
    <>
      {hero && (DRIVE_VIEWS[hero.slug]
        ? <HeroDrive vehicle={hero} view={DRIVE_VIEWS[hero.slug]!} />
        : <HeroStage vehicles={vehicles} initial={hero.id} />)}

      <section className="theme-stone py-16 md:py-24" aria-labelledby="gamme-titre">
        <div className="shell"><RangeIndex vehicles={vehicles} categories={categories} /></div>
      </section>

      {featured && site.featured && (
        <section aria-labelledby="une-titre" className="stage py-16 text-white md:py-24">
          <div className="shell">
            <p className="eyebrow text-white/60">Modèle à la une</p>
            <h2 id="une-titre" className="mega mt-5 text-[clamp(3.5rem,13vw,13rem)]">{featured.name}</h2>
          </div>
          <div className="relative mx-auto -mt-[3vw] h-[52vw] max-h-[46rem] min-h-[15rem] w-[92%] md:w-[76%]" data-reveal>
            <Car media={site.featured.image} sizes="(min-width:768px) 76vw, 92vw" label={featured.name} />
          </div>
          <div className="shell mt-2 grid gap-6 md:grid-cols-12 md:items-end">
            <dl className="glass glass-refract relative z-10 -mt-20 grid grid-cols-2 gap-x-6 gap-y-6 rounded-[28px] p-6 md:col-span-8 md:-mt-28 lg:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-white/60">{label}</dt>
                  <dd className="num mt-2 text-2xl font-light leading-tight md:text-3xl">{value!.replace(/\s*\(.*\)$/, '')}</dd>
                </div>
              ))}
            </dl>
            <div className="md:col-span-4"><Link href={`/vehicules/${featured.slug}`} className="btn btn-light w-full">Voir le {featured.name}</Link></div>
          </div>
        </section>
      )}

      {interior.length > 0 && featured && (
        <section aria-labelledby="details-titre">
          <div className="relative">
            <Photo media={interior[0].m} sizes="100vw" className="aspect-[4/3] md:aspect-[21/9]" />
            <div className="absolute inset-x-0 bottom-0 pb-4 md:pb-8">
              <div className="shell"><h2 id="details-titre" className="glass glass-refract display inline-block rounded-[24px] px-5 py-3 text-[clamp(1.5rem,4vw,3.75rem)] md:px-8 md:py-5">À bord du {featured.name}</h2></div>
            </div>
          </div>
          {interior.length > 1 && (
            <div className="grid gap-1 pt-1 md:grid-cols-3">
              {interior.slice(1).map((d) => (
                <Link key={d.view} href={`/vehicules/${featured.slug}#galerie`} className="photo-zoom group relative block" data-reveal>
                  <Photo media={d.m} sizes="(min-width:768px) 33vw, 100vw" className="aspect-[3/2]" />
                  <span className="glass absolute bottom-4 left-4 rounded-full px-4 py-2 text-sm">{INTERIOR_TITLE[d.view]}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {hero && angles.length > 1 && (
        <section className="stage py-16 text-white md:py-24" aria-labelledby="angles-titre">
          <div className="shell mb-6"><h2 id="angles-titre" className="display text-[clamp(2.25rem,5vw,5rem)]">{hero.name}, sous tous les angles</h2></div>
          <AngleExplorer name={hero.name} slug={hero.slug} angles={angles} immersive={immersive} />
        </section>
      )}

      <div className="theme-stone"><RequestSection site={site} /></div>
    </>
  );
}
