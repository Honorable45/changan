import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  images: { unoptimized: true }, // Les variantes WebP sont générées à l'import par l'API.
  // Réservé aux images Docker : `next start` n'accepte pas ce mode.
  ...(process.env.NEXT_OUTPUT_STANDALONE ? { output: 'standalone', outputFileTracingRoot: root } : {}),
  // Figé à la compilation : API_INTERNAL_URL doit être connue au moment du build.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/media/:path*', destination: `${api}/media/:path*` },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    }];
  },
};
