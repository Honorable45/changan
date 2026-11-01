import type { Metadata } from 'next';
import Link from 'next/link';
import { Car } from '@/components/Car';
import { getSite, getVehicles } from '@/lib/api';

export const metadata: Metadata = { title: 'La marque', description: 'CHANGAN, constructeur automobile chinois établi à Chongqing.', alternates: { canonical: '/marque' } };

export default async function Brand() {
  const [site, vehicles] = await Promise.all([getSite(), getVehicles()]);
  const v = site.featured ?? vehicles[0];
  return (
    <>
      <div className="shell pb-12 pt-10 md:pt-16">
        <h1 className="mega text-[clamp(2rem,11vw,10rem)]">La marque</h1>
      </div>
      {v && <div className="stage h-[48vw] max-h-[40rem] min-h-[15rem] px-[6%] pb-8 md:px-[14%]"><Car media={v.image} sizes="(min-width:768px) 72vw, 88vw" /></div>}
      <div className="shell grid gap-10 py-16 md:grid-cols-12 md:py-24">
        <p className="display text-3xl md:col-span-7 md:text-5xl">Un constructeur chinois dont le groupe fait remonter ses origines à 1862.</p>
        <div className="md:col-span-4 md:col-start-9">
          <dl className="divide-y divide-line border-y border-line text-[0.9375rem]">
            <div className="flex justify-between gap-6 py-3"><dt className="text-steel">Siège</dt><dd>Chongqing, Chine</dd></div>
            <div className="flex justify-between gap-6 py-3"><dt className="text-steel">Statut</dt><dd className="text-right">Groupe d’État chinois</dd></div>
            <div className="flex justify-between gap-6 py-3"><dt className="text-steel">Production 2025</dt><dd className="num text-right">2 913 177 véhicules</dd></div>
          </dl>
          <p className="mt-3 text-sm text-steel">Source : <a className="underline" href="https://en.wikipedia.org/wiki/Changan_Automobile" target="_blank" rel="noopener">Wikipedia (en)</a>, à remplacer par la présentation officielle.</p>
          <Link href="/vehicules" className="btn btn-primary mt-8 w-full">Explorer la gamme</Link>
        </div>
      </div>
    </>
  );
}
