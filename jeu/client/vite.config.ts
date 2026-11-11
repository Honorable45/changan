import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { securite } from './securite.mjs';

/*
 * Visage d'Honorable : photo personnelle, jamais dans un build publiable.
 * Elle reste dans public/ (hors Git) pour le développement ; elle est retirée de dist/ à chaque compilation,
 * et `vite preview` (le jeu local sur le port 3004) la sert directement depuis public/.
 * Ainsi, déposer dist/ sur un hébergeur ne peut jamais la publier.
 */
const VISAGE = '/game/humains/visage-honorable.png';
const visagePrive = (): Plugin => {
  const source = fileURLToPath(new URL(`./public${VISAGE}`, import.meta.url));
  return {
    name: 'visage-prive',
    apply: (_config, env) => env.command === 'build' || !!env.isPreview,
    closeBundle() {
      rmSync(fileURLToPath(new URL(`./dist${VISAGE}`, import.meta.url)), { force: true });
    },
    configurePreviewServer(server) {
      server.middlewares.use(VISAGE, (_req, res) => {
        if (!existsSync(source)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'no-store');
        res.end(readFileSync(source));
      });
    },
  };
};

// Le client est un site statique : il se sert depuis un CDN ou n'importe quel serveur de fichiers.
export default defineConfig({
  plugins: [react(), tailwind(), visagePrive()],
  // Le protocole réseau est partagé avec le serveur, un dossier au-dessus.
  server: { fs: { allow: ['..'] } },
  // Mêmes en-têtes de sécurité qu'en production (render.yaml, Caddy) : les tests locaux vérifient que le jeu les supporte.
  // Le serveur local du jeu est sur un autre port, et l'adresse du réseau local change : ws: et http: sont permis ici.
  preview: { headers: securite({ connect: "'self' ws: http:" }) },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three.js à part : il change rarement, le navigateur le garde en cache d'une version à l'autre.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : id.includes('node_modules/react') ? 'react' : undefined),
      },
    },
  },
});
