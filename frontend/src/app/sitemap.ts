import type { MetadataRoute } from 'next';
import { getVehicles } from '@/lib/api';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await getVehicles().catch(() => []);
  return [
    ...['', '/vehicules', '/comparer', '/marque', '/services', '/contact', '/mentions-legales', '/confidentialite', '/credits'].map((p) => ({ url: `${base}${p}` })),
    ...vehicles.map((v) => ({ url: `${base}/vehicules/${v.slug}` })),
  ];
}
