import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/connexion', '/mot-de-passe-oublie', '/reinitialiser'];

// Premier filtre d'ergonomie : l'autorisation réelle est contrôlée par l'API sur chaque appel.
export function middleware(req: NextRequest) {
  if (PUBLIC.includes(req.nextUrl.pathname) || req.cookies.has('changan_admin')) return NextResponse.next();
  return NextResponse.redirect(new URL('/connexion', req.url));
}

// Hors /api et /media : un envoi de fichier ne doit pas traverser ce filtre, limité en taille.
export const config = { matcher: '/((?!api/|media/|_next/|icon.svg|robots.txt).*)' };
