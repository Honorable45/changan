/** Adresse du site public : l'administration vit sur son propre domaine. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  if (res.status === 401 && !path.startsWith('/admin/auth/login')) {
    window.location.assign('/connexion');
    throw new ApiError('Session expirée', 401);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(Array.isArray(data?.message) ? data.message.join(' · ') : data?.message ?? 'Une erreur est survenue', res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
