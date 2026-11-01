// Parcours réels dans Chrome. Prérequis : API + site démarrés, données de démonstration chargées.
// E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm test:e2e
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_BASE = process.env.E2E_ADMIN_URL ?? 'http://localhost:3002';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const OUT = fileURLToPath(new URL('./artifacts/', import.meta.url));
const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp');
const PHOTO = fileURLToPath(new URL('../backend/seed/photos/uni-k-01.jpg', import.meta.url));
const WIDTHS = [320, 375, 390, 768, 1024, 1440];

let browser;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
});
after(() => browser?.close());

async function page(width = 1440, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(`exception: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/40[01]/.test(m.text()) && !/status of 404/.test(m.text())) p.errors.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 500 || (r.status() === 404 && !/n-existe-pas/.test(r.url()))) p.errors.push(`${r.status()} ${r.url()}`); });
  return p;
}

async function brokenImages(p) {
  return p.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
  });
}

async function firstVehicleSlug() {
  const v = await (await fetch(`${API}/vehicles`)).json();
  assert.ok(v.length >= 2, 'le catalogue de démonstration doit être chargé');
  return v;
}

test('aucun débordement ni image cassée sur toutes les largeurs', async () => {
  const vehicles = await firstVehicleSlug();
  const paths = ['/', '/vehicules', `/vehicules/${vehicles[0].slug}`, `/comparer?m=${vehicles[0].slug},${vehicles[1].slug},${vehicles[2].slug}`, '/contact', '/marque', '/services', '/credits', '/confidentialite', '/mentions-legales'];
  for (const width of WIDTHS) {
    const p = await page(width);
    for (const path of paths) {
      assert.equal((await p.goto(BASE + path, { waitUntil: 'load' })).status(), 200, path);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, `${path} déborde de ${over}px à ${width}px`);
    }
    await p.goto(`${BASE}/vehicules`);
    assert.deepEqual(await brokenImages(p), []);
    assert.deepEqual(p.errors, [], `erreurs navigateur à ${width}px`);
    await p.context().close();
  }
});

test('structure : un seul h1, images décrites, métadonnées et URLs', async () => {
  const [v] = await firstVehicleSlug();
  const p = await page();
  const titles = new Set();
  for (const path of ['/', '/vehicules', `/vehicules/${v.slug}`, '/comparer', '/contact']) {
    await p.goto(BASE + path);
    assert.equal(await p.locator('h1').count(), 1, `h1 sur ${path}`);
    titles.add(await p.title());
    assert.equal(await p.locator('img:not([alt])').count(), 0);
  }
  assert.equal(titles.size, 5, 'titres uniques');
  await p.goto(`${BASE}/vehicules/${v.slug}`);
  assert.ok(await p.locator('meta[property="og:image"]').getAttribute('content'));
  assert.match(await p.locator('script[type="application/ld+json"]').textContent(), /"@type":"Car"/);
  assert.doesNotMatch(await p.locator('script[type="application/ld+json"]').textContent(), /price/i);
  assert.equal((await p.goto(`${BASE}/vehicules/n-existe-pas`)).status(), 404);
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert.ok(sitemap.includes(`/vehicules/${v.slug}`));
  assert.match(await (await fetch(`${BASE}/robots.txt`)).text(), /Disallow: \//); // mode démonstration
  await p.context().close();
});

test('accueil : toutes les photographies se chargent au défilement', async () => {
  const p = await page(1440);
  await p.goto(BASE);
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } });
  assert.equal(await p.getByText('Photographie à venir').count(), 0);
  assert.deepEqual(await brokenImages(p), []);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('catalogue : recherche, filtre, résultat vide', async () => {
  const p = await page();
  await p.goto(`${BASE}/vehicules`);
  const all = await p.locator('main a[href^="/vehicules/"]').count();
  assert.ok(all >= 2);
  await p.getByRole('button', { name: 'Pick-up' }).click();
  await p.waitForURL(/categorie=pick-up/);
  await p.getByRole('heading', { name: 'Hunter' }).waitFor();
  assert.equal(await p.locator('main a[href^="/vehicules/"]').count(), 1);
  await p.goto(`${BASE}/vehicules`);
  await p.getByLabel('Rechercher un modèle').fill('zzzz');
  await p.getByRole('heading', { name: 'Aucun véhicule ne correspond.' }).waitFor();
  await p.getByRole('link', { name: 'Voir toute la gamme' }).click();
  await p.waitForURL(/\/vehicules$/);
  await p.context().close();
});

test('galerie : visionneuse au clavier, zoom net, fermeture, toucher', async () => {
  const p = await page(1440);
  await p.goto(`${BASE}/vehicules/nevo-q05`);
  const gallery = p.locator('#galerie');
  await gallery.getByRole('button', { name: /^Agrandir/ }).click();
  const box = p.getByRole('dialog', { name: /Photographies/ });
  await box.waitFor();
  const before = await box.locator('p.num').textContent();
  await p.keyboard.press('ArrowRight');
  assert.notEqual(await box.locator('p.num').textContent(), before);
  await p.keyboard.press('ArrowLeft');
  assert.equal(await box.locator('p.num').textContent(), before);
  await p.keyboard.press('+');
  await p.keyboard.press('+');
  await box.getByText('200 %').waitFor();
  const img = box.locator('img');
  await img.evaluate((i) => (i.complete ? null : new Promise((r) => { i.onload = r; })));
  assert.equal(await img.evaluate((i) => i.getAttribute('srcset')), null, 'en zoom, la plus grande variante est servie');
  assert.ok(await img.evaluate((i) => i.naturalWidth) >= 1600, 'source suffisante pour le zoom');
  await box.screenshot({ path: `${OUT}lightbox-zoom.png` });
  await p.keyboard.press('Escape');
  await box.waitFor({ state: 'detached' });
  assert.deepEqual(p.errors, []);
  await p.context().close();

  const m = await page(390, { hasTouch: true, isMobile: true });
  await m.goto(`${BASE}/vehicules/nevo-q05`);
  await m.locator('#galerie').getByRole('button', { name: /^Agrandir/ }).tap();
  const mobile = m.getByRole('dialog', { name: /Photographies/ });
  await mobile.waitFor();
  const first = await mobile.locator('p.num').textContent();
  const zone = mobile.locator('.touch-none');
  const b = await zone.boundingBox();
  const cdp = await m.context().newCDPSession(m);
  const y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await m.waitForFunction((t) => document.querySelector('dialog p.num')?.textContent !== t, first);
  await mobile.getByRole('button', { name: 'Fermer la visionneuse' }).tap();
  await m.context().close();
});

test('comparateur : ajout, écarts, retrait', async () => {
  const p = await page(390);
  await p.goto(`${BASE}/comparer`);
  await p.getByRole('link', { name: 'Ajouter le UNI-K à la comparaison' }).click();
  await p.waitForURL(/m=uni-k/);
  await p.getByRole('link', { name: 'Ajouter le Hunter à la comparaison' }).click();
  await p.getByRole('heading', { name: 'Dimensions' }).waitFor();
  assert.ok(await p.getByText('4 865 mm').isVisible());
  assert.ok(await p.getByText('(valeurs différentes)').count() > 0);
  await p.screenshot({ path: `${OUT}comparateur-mobile.png`, fullPage: true });
  await p.getByRole('link', { name: 'Retirer le Hunter de la comparaison' }).click();
  await p.waitForURL(/m=uni-k$/);
  await p.context().close();
});

test('administration, publication, WhatsApp, médias, 360° et 3D', { skip: !ADMIN.email }, async () => {
  const p = await page();
  // Routes protégées
  await p.goto(`${ADMIN_BASE}/`);
  await p.waitForURL(/\/connexion$/);
  assert.equal((await fetch(`${API}/admin/vehicles`)).status, 401);
  assert.equal((await fetch(`${API}/admin/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"demoMode":false}' })).status, 401);
  await p.getByLabel('Courriel').fill(ADMIN.email);
  await p.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await p.getByText('Identifiants incorrects').waitFor();
  await p.getByLabel('Mot de passe').fill(ADMIN.password);
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await p.getByRole('heading', { name: 'Véhicules' }).waitFor();
  const cookie = (await p.context().cookies()).find((c) => c.name === 'changan_admin');
  assert.ok(cookie.httpOnly);

  const name = `Essai E2E ${Date.now()}`;
  const slug = name.toLowerCase().replace(/ /g, '-');
  await p.getByRole('link', { name: 'Nouveau véhicule' }).click();
  await p.getByLabel('Nom du modèle').fill(name);
  await p.getByLabel('Catégorie').selectOption({ label: 'SUV' });
  await p.getByLabel('Publié sur le site').check();
  await p.getByRole('button', { name: 'Créer le véhicule' }).click();
  await p.waitForURL(/\/vehicules\/c/);
  const id = p.url().split('/').pop();

  try {
    // Fichier invalide refusé côté serveur, malgré une extension trompeuse
    await p.getByRole('tab', { name: 'Médias' }).click();
    await p.locator('input[name=files]').setInputFiles({ name: 'faux.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<?php echo 1;') });
    await p.getByLabel('Texte alternatif', { exact: false }).first().fill('test');
    await p.getByRole('button', { name: 'Téléverser' }).click();
    await p.getByText(/Image illisible/).waitFor();

    // Vraie photographie : variantes générées, principale, prévisualisée
    await p.locator('input[name=files]').setInputFiles(PHOTO);
    await p.getByRole('button', { name: 'Téléverser' }).click();
    await p.getByText('Principale').waitFor();
    await p.locator('input[name=files]').setInputFiles(PHOTO);
    await p.getByLabel('Texte alternatif', { exact: false }).first().fill('test 2');
    await p.getByRole('button', { name: 'Téléverser' }).click();
    await p.getByRole('button', { name: 'Définir principale' }).waitFor();

    // Détourage : un fichier sans transparence est refusé, un fichier transparent est accepté
    const firstMedia = (await (await p.request.get(`${ADMIN_BASE}/api/admin/vehicles/${id}`)).json()).media[0].id;
    const cut = (buffer) => p.request.post(`${ADMIN_BASE}/api/admin/media/${firstMedia}/cutout`, { multipart: { file: { name: 'c.png', mimeType: 'image/png', buffer } } });
    assert.equal((await cut(readFileSync(PHOTO))).status(), 400);
    const transparent = await sharp({ create: { width: 1400, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    assert.equal((await cut(transparent)).status(), 201);

    // Spécification et disponibilité administrables
    await p.getByRole('tab', { name: 'Caractéristiques' }).click();
    await p.getByLabel('Libellé').last().fill('Places');
    await p.getByLabel('Clé').last().fill('seats');
    await p.getByLabel('Valeur').last().fill('5');
    await p.getByLabel('Vérification').last().selectOption('CONFIRMED_TOGO');
    await p.getByRole('button', { name: 'Ajouter' }).click();
    await p.getByRole('button', { name: 'OK' }).waitFor();
    await p.getByRole('tab', { name: 'Informations' }).click();
    await p.getByLabel('Disponibilité').selectOption('ON_ORDER');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Modifications enregistrées.').waitFor();

    // Une version, un prix masqué : le prix ne doit pas sortir de l'API publique
    await p.request.post(`${ADMIN_BASE}/api/admin/vehicles/${id}/versions`, { data: { name: 'Elite', year: 2026, priceFcfa: 12345678, priceVisible: false, position: 0 } });
    const pub = await (await fetch(`${API}/vehicles/${slug}`)).json();
    assert.equal(pub.availability, 'ON_ORDER');
    assert.equal(pub.versions[0].priceFcfa, null, 'prix masqué côté API');
    assert.ok(!JSON.stringify(pub).includes('vehicles/' + id + '/') || pub.media[0].sources[0].url.startsWith('/media/'));

    // Coloris : proposé uniquement s'il est confirmé et associé à une photo
    const color = await (await p.request.post(`${ADMIN_BASE}/api/admin/vehicles/${id}/colors`, { data: { name: 'Blanc test', hex: '#ffffff', confirmed: true, position: 0 } })).json();
    await p.request.patch(`${ADMIN_BASE}/api/admin/media/${pub.media[0].id}`, { data: { colorId: color.id } });

    // 360° (12 vues générées pour le test) et GLB minimal valide
    const frames = await Promise.all(Array.from({ length: 12 }, (_, i) => sharp({ create: { width: 1400, height: 800, channels: 3, background: { r: 20 * i, g: 80, b: 120 } } }).jpeg().toBuffer()));
    for (const buffer of frames) {
      const res = await p.request.post(`${ADMIN_BASE}/api/admin/vehicles/${id}/media`, { multipart: { kind: 'SPIN_FRAME', file: { name: 'f.jpg', mimeType: 'image/jpeg', buffer } } });
      assert.equal(res.status(), 201);
    }
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const gltf = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
    let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const head = Buffer.alloc(12); head.write('glTF'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + 36, 8);
    const chunk = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.write(type, 4); return c; };
    const glb = Buffer.concat([head, chunk(json.length, 'JSON'), json, chunk(36, 'BIN\0'), Buffer.from(positions.buffer)]);
    assert.equal((await p.request.post(`${ADMIN_BASE}/api/admin/vehicles/${id}/media`, { multipart: { kind: 'MODEL_3D', file: { name: 'm.glb', mimeType: 'model/gltf-binary', buffer: glb } } })).status(), 201);
    assert.equal((await p.request.post(`${ADMIN_BASE}/api/admin/vehicles/${id}/media`, { multipart: { kind: 'MODEL_3D', file: { name: 'm.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('pas un modele') } } })).status(), 400);

    // WhatsApp configuré : lien encodé ; absent : formulaire
    const settings = await (await p.request.get(`${ADMIN_BASE}/api/admin/settings`)).json();
    const { id: _i, updatedAt: _u, ...restore } = settings;
    await p.request.put(`${ADMIN_BASE}/api/admin/settings`, { data: { ...restore, whatsappNumber: '+000 000 00000' } }).then((r) => assert.equal(r.status(), 400));
    try {
      const v = await page(1440);
      const fresh = async () => { for (let i = 0; i < 40; i++) { await v.goto(`${BASE}/vehicules/${slug}`); if (await v.getByRole('heading', { level: 1, name }).count()) return; await v.waitForTimeout(1000); } };
      await fresh();
      await v.getByRole('button', { name: 'Demander le prix' }).first().click();
      await v.getByRole('dialog').getByLabel('Nom').fill('Client Test');
      await v.getByRole('dialog').getByLabel('Téléphone').fill('+228 90 00 00 00');
      await v.getByRole('dialog').getByRole('checkbox').check();
      await v.getByRole('dialog').getByRole('button', { name: 'Envoyer la demande' }).click();
      await v.getByText('Demande envoyée.').waitFor();
      assert.ok(await v.getByText('Sur commande').count());
      await v.keyboard.press('Escape');

      // Coloris visible, rotation 360° au glisser, modèle 3D à la demande
      await v.getByRole('group', { name: 'Coloris' }).getByRole('button', { name: 'Blanc test' }).waitFor();
      const spin = v.getByTestId('spin');
      await spin.scrollIntoViewIfNeeded();
      assert.equal(await spin.getAttribute('aria-valuenow'), '1');
      const s = await spin.boundingBox();
      await v.mouse.move(s.x + s.width * 0.8, s.y + s.height / 2);
      await v.mouse.down();
      await v.mouse.move(s.x + s.width * 0.4, s.y + s.height / 2, { steps: 6 });
      await v.mouse.up();
      assert.notEqual(await spin.getAttribute('aria-valuenow'), '1');
      assert.equal(await v.locator('canvas').count(), 0, 'Three.js ne se charge pas avant la demande');
      await v.getByRole('button', { name: 'Lancer la vue 3D' }).click();
      await v.getByRole('button', { name: 'Réinitialiser la vue' }).last().waitFor({ timeout: 30000 });
      await v.getByTestId('model-host').locator('canvas').waitFor();
      assert.deepEqual(v.errors, []);
      await v.context().close();

      await p.request.put(`${ADMIN_BASE}/api/admin/settings`, { data: { ...restore, whatsappNumber: '22890000000' } });
      const w = await page(1440);
      let href = null;
      for (let i = 0; i < 40 && !href; i++) {
        await w.goto(`${BASE}/vehicules/${slug}`);
        href = await w.getByRole('link', { name: 'Demander le prix' }).first().getAttribute('href', { timeout: 500 }).catch(() => null);
        if (!href) await w.waitForTimeout(1000);
      }
      const url = new URL(href);
      assert.equal(url.origin + url.pathname, 'https://wa.me/22890000000');
      assert.equal(url.searchParams.get('text'), `Bonjour, je souhaite obtenir des informations sur le CHANGAN ${name}, version Elite. Pourriez-vous me communiquer son prix et sa disponibilité au Togo ?`);
      const test = await w.getByRole('link', { name: 'Réserver un essai' }).nth(1).getAttribute('href');
      assert.match(new URL(test).searchParams.get('text'), /essai routier.*proposer un rendez-vous/);
      await w.context().close();
    } finally {
      await p.request.put(`${ADMIN_BASE}/api/admin/settings`, { data: restore });
    }

    // Demande reçue et suivie, puis retirée
    await p.goto(`${ADMIN_BASE}/demandes`);
    await p.getByText('Client Test').first().waitFor();
    await p.getByLabel('Statut de la demande de Client Test').first().selectOption('IN_PROGRESS');
    const rows = await (await p.request.get(`${ADMIN_BASE}/api/admin/requests`)).json();
    const mine = rows.filter((r) => r.name === 'Client Test');
    await p.waitForTimeout(300);
    for (const r of mine) await p.request.delete(`${ADMIN_BASE}/api/admin/requests/${r.id}`);
  } finally {
    await p.goto(`${ADMIN_BASE}/vehicules/${id}`);
    await p.getByRole('button', { name: 'Supprimer le véhicule' }).click();
    await p.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await p.waitForURL(`${ADMIN_BASE}/`);
  }
  assert.equal((await fetch(`${API}/vehicles/${slug}`)).status, 404);

  await p.getByRole('button', { name: 'Déconnexion' }).click();
  await p.waitForURL(/connexion/);
  await p.goto(`${ADMIN_BASE}/accueil`);
  await p.waitForURL(/connexion/);
  await p.context().close();
});

test('formulaire public : validation serveur et robots', async () => {
  const post = (body) => fetch(`${API}/contact-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ type: 'PRICE', name: 'A', phone: 'abc', consent: true })).status, 400);
  assert.equal((await post({ type: 'PRICE', name: 'Client', phone: '+22890000000', consent: false })).status, 400);
  assert.equal((await post({ type: 'PRICE', name: 'Client', phone: '+22890000000', consent: true, admin: true })).status, 400);
});

test('réduction des animations respectée', async () => {
  const p = await page(1440, { reducedMotion: 'reduce' });
  await p.goto(BASE);
  const d = await p.locator('.hero-rise').first().evaluate((e) => getComputedStyle(e).animationDuration);
  assert.ok(parseFloat(d) < 0.01);
  await p.mouse.wheel(0, 500);
  await p.waitForTimeout(400);
  assert.ok((await p.locator('.drive-car').evaluate((e) => e.style.transform)).startsWith('translate3d(0px, 0px'), 'la voiture reste immobile');
  await p.context().close();
});

test('le site public ne donne aucun accès à l\'administration', async () => {
  assert.equal((await fetch(`${BASE}/admin`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/admin/vehicles`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/site`)).status, 200);
  assert.equal((await fetch(`${ADMIN_BASE}/api/admin/vehicles`)).status, 401);
  assert.match((await fetch(`${ADMIN_BASE}/robots.txt`).then((r) => r.text())), /Disallow: \//);
});

test('accueil : les voitures de couleurs différentes se suivent au défilement', async () => {
  const p = await page(1440);
  await p.goto(BASE);
  const pressed = () => p.locator('[aria-label="Choisir une couleur"] [aria-pressed="true"]').getAttribute('aria-label');
  assert.equal(await pressed(), 'Bleu clair');
  await p.locator('[data-car="noir"]').waitFor({ state: 'attached' });
  assert.equal(await p.locator('.drive-car').count(), 5);
  await p.waitForLoadState('networkidle');
  assert.equal(await brokenImages(p).then((x) => x.length), 0);

  await p.getByRole('button', { name: 'Noir' }).click();
  await p.waitForFunction(() => { const r = document.querySelector('[data-car="noir"]').getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 8; }, null, { timeout: 5000 });
  const car = await p.locator('[data-car="noir"]').evaluate((e) => { const r = e.getBoundingClientRect(); return { center: r.left + r.width / 2, visibility: getComputedStyle(e).visibility }; });
  assert.ok(Math.abs(car.center - 720) < 8, `voiture noire au centre (${car.center})`);
  assert.equal(car.visibility, 'visible');
  assert.equal(await pressed(), 'Noir');
  await p.getByText('teinte simulée').waitFor();

  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(800);
  assert.equal(await pressed(), 'Bleu clair');
  await p.context().close();
});

test('accueil : la voiture roule au rythme du défilement, dans les deux sens', async () => {
  for (const width of [390, 1440]) {
    const p = await page(width);
    await p.goto(BASE);
    const state = () => p.evaluate(() => {
      const car = document.querySelector('.drive-car').getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(document.querySelector('.drive-wheel')).transform);
      const drive = document.querySelector('.drive');
      return { center: car.left + car.width / 2, right: car.right, wheel: m.b, top: drive.getBoundingClientRect().top + scrollY, max: drive.offsetHeight - innerHeight };
    });
    const start = await state();
    const go = async (f) => { await p.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), start.top + start.max * f); await p.waitForTimeout(500); return state(); };

    assert.ok(Math.abs(start.center - width / 2) < 2, 'centrée à l\'arrivée');
    assert.ok(Math.abs(start.wheel) < 0.001, 'roues immobiles à l\'arrivée');

    const third = await go(0.3);
    const half = await go(0.6);
    const a = start.center - third.center;
    const b = third.center - half.center;
    assert.ok(a > 0 && b > 0, 'elle avance vers l\'avant');
    assert.ok(Math.abs(b / a - 0.3 / (0.3 - 0.03)) < 0.25, `vitesse constante après le démarrage (${(b / a).toFixed(2)})`);

    const rolling = await go(0.08);
    assert.ok(Math.abs(rolling.wheel) > 0.01, 'les roues tournent');
    const end = await go(1);
    assert.ok(end.right < 0, 'elle sort de l\'écran');
    assert.equal(await p.locator('.drive-car').evaluateAll((all) => all.filter((e) => e.getBoundingClientRect().right > 0).length), 0, 'tout le convoi est passé');
    await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(500);
    const back = await state();
    assert.ok(Math.abs(back.center - width / 2) < 2, 'elle revient si on remonte');
    assert.ok(Math.abs(back.wheel) < 0.001);
    await p.context().close();
  }
});
