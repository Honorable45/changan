/**
 * En-têtes de sécurité du jeu, une seule définition :
 * - `vite preview` (jeu local et tests) les applique, ce qui vérifie que le jeu fonctionne avec eux ;
 * - render.yaml et deploy/Caddyfile en recopient la valeur (le test « en-têtes de sécurité » vérifie qu'elles concordent).
 *
 * Ce qu'ils empêchent :
 * - frame-ancestors / X-Frame-Options : un autre site ne peut pas afficher le jeu dans un cadre (piège au micro) ;
 * - script-src 'self' : aucun script injecté ou venu d'ailleurs ne s'exécute ('wasm-unsafe-eval' : décodeur Meshopt des personnages) ;
 * - connect-src : le jeu ne parle qu'à son propre serveur ;
 * - Permissions-Policy : micro pour ce site seul, ni caméra ni position.
 */
export function securite({ connect }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    // Les couleurs et positions calculées par React passent par l'attribut style.
    "style-src 'self' 'unsafe-inline'",
    // Textures des modèles 3D (blob:) et dessins sur canvas (data:).
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self'",
    // blob: et data: : le chargeur de modèles 3D lit leurs textures intégrées avec fetch().
    `connect-src ${connect} blob: data:`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
