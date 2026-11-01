import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/api';

export const dynamic = 'force-dynamic';
const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite().catch(() => null);
  if (site?.demoMode !== false) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api'] }, sitemap: `${base}/sitemap.xml` };
}
