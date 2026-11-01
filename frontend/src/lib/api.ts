import type { Category, Credit, Facets, Site, VehicleCard, VehicleDetail } from './types';

const BASE = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { next: { revalidate: 15 } });
  if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
  return res.json();
}

export const getSite = () => get<Site>('/site');
export const getCategories = () => get<Category[]>('/categories');
export const getFacets = () => get<Facets>('/vehicles/facets');
export const getCredits = () => get<Credit[]>('/vehicles/credits');
export const getVehicles = (params: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return get<VehicleCard[]>(`/vehicles?${q}`);
};
export async function getVehicle(slug: string) {
  const res = await fetch(`${BASE}/api/vehicles/${encodeURIComponent(slug)}`, { next: { revalidate: 15 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<VehicleDetail>;
}
