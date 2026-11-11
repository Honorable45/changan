import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Le client est un site statique : il se sert depuis un CDN ou n'importe quel serveur de fichiers.
export default defineConfig({
  plugins: [react(), tailwind()],
  // Le protocole réseau est partagé avec le serveur, un dossier au-dessus.
  server: { fs: { allow: ['..'] } },
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
