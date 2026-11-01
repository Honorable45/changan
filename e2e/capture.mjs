// Captures de contrôle visuel : node e2e/capture.mjs [largeur...]
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const OUT = fileURLToPath(new URL('./artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const widths = process.argv.slice(2).map(Number);
const pages = { accueil: '/', gamme: '/vehicules', fiche: '/vehicules/nevo-q05', comparer: '/comparer?m=uni-k,hunter,nevo-q05' };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const width of widths.length ? widths : [1440, 390]) {
  const p = await browser.newPage({ viewport: { width, height: width < 768 ? 800 : 900 } });
  for (const [name, path] of Object.entries(pages)) {
    await p.goto(BASE + path, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}${name}-${width}-fold.jpg`, type: 'jpeg', quality: 70 });
    await p.evaluate(async () => {
      document.documentElement.classList.remove('js-reveal');
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }); }));
    });
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}${name}-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 62 });
  }
  await p.close();
}
await browser.close();
