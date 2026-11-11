// Après la compilation : une copie Brotli et Gzip de chaque fichier texte ou 3D, servie telle quelle par Caddy ou un CDN.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const racine = fileURLToPath(new URL('./dist/', import.meta.url));
const types = /\.(js|css|html|json|svg|glb|txt)$/;
let avant = 0, apres = 0;
const parcourir = (d) => {
  for (const nom of readdirSync(d)) {
    const f = join(d, nom);
    if (statSync(f).isDirectory()) { parcourir(f); continue; }
    if (!types.test(nom) || statSync(f).size < 1024) continue;
    const brut = readFileSync(f);
    const br = brotliCompressSync(brut, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: brut.length } });
    writeFileSync(`${f}.br`, br);
    writeFileSync(`${f}.gz`, gzipSync(brut, { level: 9 }));
    avant += brut.length; apres += br.length;
  }
};
parcourir(racine);
console.log(`Précompression : ${(avant / 1048576).toFixed(1)} Mio → ${(apres / 1048576).toFixed(1)} Mio en Brotli`);
