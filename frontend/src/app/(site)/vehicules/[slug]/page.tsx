import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactActions } from '@/components/ContactActions';
import { Car } from '@/components/Car';
import { DimensionRule } from '@/components/DimensionRule';
import { Gallery } from '@/components/Gallery';
import { Immersive } from '@/components/Immersive';
import { largestOf, SPIN_MIN_FRAMES } from '@/lib/media';
import { SpecSheet } from '@/components/SpecSheet';
import { StickyActions } from '@/components/StickyActions';
import { VehicleCard } from '@/components/VehicleCard';
import Link from 'next/link';
import { getSite, getVehicle } from '@/lib/api';
import { AVAILABILITY, COMMERCIAL, energyLine, fcfa } from '@/lib/labels';

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVehicle(slug);
  if (!v) return { title: 'Véhicule introuvable' };
  const primary = v.media.find((m) => m.isPrimary);
  const description = v.tagline ?? `CHANGAN ${v.name} : photographies et caractéristiques.`;
  const image = primary?.sources.find((s) => s.size === '1080')?.url ?? (primary ? largestOf(primary) : undefined);
  return {
    title: `CHANGAN ${v.name}`, description, alternates: { canonical: `/vehicules/${v.slug}` },
    openGraph: { title: `CHANGAN ${v.name}`, description, images: image ? [{ url: image, alt: primary?.alt }] : undefined },
  };
}

export default async function VehiclePage({ params }: P) {
  const { slug } = await params;
  const [v, site] = await Promise.all([getVehicle(slug), getSite()]);
  if (!v) notFound();
  const images = v.media.filter((m) => m.kind === 'IMAGE');
  const primary = images.find((m) => m.isPrimary) ?? images[0] ?? null;
  const frames = v.media.filter((m) => m.kind === 'SPIN_FRAME').sort((a, b) => a.position - b.position);
  const model = v.media.find((m) => m.kind === 'MODEL_3D') ?? null;
  const video = v.media.find((m) => m.kind === 'VIDEO');
  const spin = frames.length >= SPIN_MIN_FRAMES ? frames : [];
  const hasImmersive = spin.length > 0 || !!model;
  const prices = v.versions.map((x) => x.priceFcfa).filter((p): p is number => p != null);
  const versionNames = v.versions.map((x) => x.name);
  const single = v.versions.length === 1 ? v.versions[0] : null;
  const anchors = [['galerie', 'Galerie'], ...(hasImmersive ? [['exploration', 'Exploration']] : []), ...(v.specifications.length ? [['caracteristiques', 'Caractéristiques']] : []), ['contact', 'Contact']];
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Car', name: `CHANGAN ${v.name}`, brand: { '@type': 'Brand', name: 'CHANGAN' },
    bodyType: v.category.name, description: v.tagline ?? undefined, image: primary ? largestOf(primary) : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="stage -mt-20 pt-24 text-white md:pt-28" aria-labelledby="titre">
        <div className="shell">
          <p className="eyebrow text-white/60"><Link href={`/vehicules?categorie=${v.category.slug}`} className="hover:text-white">{v.category.name}</Link>{single && ` · ${single.name}${single.year ? `, ${single.year}` : ''}`}</p>
        </div>
        <h1 id="titre" className="mega mt-5 whitespace-nowrap text-center" style={{ fontSize: `min(${(118 / Math.max(v.name.length, 4)).toFixed(1)}vw, 34svh)` }}>{v.name}</h1>
        <div className="relative mx-auto mt-2 h-[min(52vw,48svh)] min-h-[14rem] w-[94%] md:w-[76%]">
          <Car media={primary} sizes="(min-width:768px) 76vw, 94vw" priority label={`CHANGAN ${v.name}`} />
        </div>
        <div id="actions-fiche" className="shell mt-10 grid gap-6 pb-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            {v.tagline && <p className="max-w-md text-lg leading-snug">{v.tagline}</p>}
            <dl className="mt-4 grid gap-0.5 text-sm text-white/65">
              {v.energies.length > 0 && <div><dt className="sr-only">Énergie</dt><dd>{energyLine(v.energies)}</dd></div>}
              {prices.length > 0 && <div><dt className="sr-only">Prix</dt><dd className="num text-white">À partir de {fcfa(Math.min(...prices))}</dd></div>}
              <div><dt className="sr-only">Commercialisation</dt><dd>{COMMERCIAL[v.commercialStatus]}</dd></div>
              <div><dt className="sr-only">Disponibilité</dt><dd>{AVAILABILITY[v.availability]}</dd></div>
            </dl>
          </div>
          <div className="md:col-span-6 md:flex md:justify-end"><div><ContactActions tone="dark" whatsapp={site.whatsappNumber} vehicleSlug={v.slug} vehicleName={v.name} versions={versionNames} /><Link href="/essai-virtuel" className="mt-3 inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-white">Prendre le volant en essai virtuel</Link></div></div>
        </div>
      </section>

      <nav aria-label="Sections de la fiche" className="pointer-events-none sticky top-20 z-30 flex justify-center px-4 py-2">
        <ul className="glass scroll-quiet pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
          {anchors.map(([id, label]) => <li key={id} className="shrink-0"><a href={`#${id}`} className="flex min-h-10 items-center rounded-full px-4 text-sm hover:bg-white/15">{label}</a></li>)}
        </ul>
      </nav>

      <section id="galerie" className="shell scroll-mt-32 py-16 md:py-24" aria-labelledby="galerie-titre">
        <h2 id="galerie-titre" className="display mb-8 text-[clamp(2.25rem,5vw,4.5rem)] md:mb-12">Galerie</h2>
        {images.length ? <Gallery images={images} colors={v.colors} name={v.name} /> : <p className="text-steel">Les photographies de ce modèle seront ajoutées prochainement.</p>}
        {video && (
          <video controls preload="none" playsInline poster={primary ? largestOf(primary) : undefined} className="mt-12 aspect-video w-full bg-ink">
            <source src={video.sources[0].url} />
            <track kind="captions" />
          </video>
        )}
      </section>

      {hasImmersive && (
        <section id="exploration" className="shell scroll-mt-32 pb-16 md:pb-24" aria-labelledby="exploration-titre">
          <h2 id="exploration-titre" className="display mb-8 text-[clamp(2.25rem,5vw,4.5rem)] md:mb-12">Exploration</h2>
          <Immersive model={model} frames={spin} name={v.name} fallback={primary} />
        </section>
      )}

      {v.specifications.length > 0 && (
        <section id="caracteristiques" className="scroll-mt-32" aria-labelledby="spec-titre">
          {v.specifications.some((s) => s.key === 'length') && (
            <div className="bg-mist py-16 md:py-20">
              <div className="shell grid gap-10 md:grid-cols-12">
                <h2 id="spec-titre" className="display min-w-0 text-[clamp(1.875rem,9vw,3.75rem)] md:col-span-5">Caractéristiques</h2>
                <div className="md:col-span-7"><DimensionRule specs={v.specifications} /></div>
              </div>
            </div>
          )}
          <div className="shell py-12 md:py-20"><SpecSheet specs={v.specifications} /></div>
        </section>
      )}

      {site.warrantyText && <section className="shell pb-16"><h2 className="display text-3xl">Garantie</h2><p className="mt-4 max-w-2xl whitespace-pre-line text-steel">{site.warrantyText}</p></section>}

      <section id="contact" className="theme-stone scroll-mt-32 py-16 md:py-24" aria-labelledby="fiche-contact">
        <div className="shell grid gap-10 md:grid-cols-12 md:items-end">
          <h2 id="fiche-contact" className="display text-[clamp(2.25rem,5vw,5rem)] md:col-span-7">Le {v.name} vous intéresse ?</h2>
          <div className="md:col-span-5">
            <ContactActions whatsapp={site.whatsappNumber} vehicleSlug={v.slug} vehicleName={v.name} versions={versionNames} />
            <Link href={`/comparer?m=${v.slug}`} className="link-line mt-5 inline-block text-[0.9375rem]">Comparer ce modèle</Link>
          </div>
        </div>
      </section>

      {v.similar.length > 0 && (
        <section className="shell py-16 md:py-24" aria-labelledby="similaires">
          <h2 id="similaires" className="eyebrow mb-8 text-steel">Dans la même catégorie</h2>
          <div className="grid gap-3 md:grid-cols-3">{v.similar.map((s) => <VehicleCard key={s.id} v={s} sizes="(min-width:768px) 33vw, 100vw" />)}</div>
        </section>
      )}

      <StickyActions>
        <ContactActions layout="bar" whatsapp={site.whatsappNumber} vehicleSlug={v.slug} vehicleName={v.name} />
      </StickyActions>
    </>
  );
}
