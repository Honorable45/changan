// Données de DÉMONSTRATION. Rien ici n'est une information officielle de CHANGAN Togo :
// - la gamme reprend des modèles cités sur le marché togolais par des annonces et des blogs ;
// - les caractéristiques viennent de sources internationales, citées champ par champ ;
// - statut et disponibilité restent « à confirmer » ; aucun prix, aucune coordonnée, aucun coloris.
// Les véhicules portant isDemo sont remplacés à chaque exécution ; les autres ne sont pas touchés.
import { Energy, MediaView, PrismaClient, SpecGroup } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MediaService } from '../src/media/media.service';
import { StorageService } from '../src/media/storage.service';

const prisma = new PrismaClient();
const INTERIOR = ['INTERIOR', 'DASHBOARD', 'SEATS', 'TRUNK', 'DETAIL'];
const CUTOUTS: Record<string, string[]> = {
  'uni-k': ['uni-k-02', 'uni-k-01', 'uni-k-05', 'uni-k-06'],
  'nevo-q05': ['q05-01', 'q05-02', 'q05-03', 'q05-04'],
  'x5-plus': ['x5-plus-01', 'x5-plus-04'],
  'cs35-plus': ['cs35-plus-01', 'cs35-plus-02', 'cs35-plus-04'],
  'eado-ev': ['eado-ev-01', 'eado-ev-05'],
  hunter: ['hunter-04'],
};
const wiki = (page: string) => ({ sourceLabel: 'Wikipedia (en)', sourceUrl: `https://en.wikipedia.org/wiki/${page}` });
type S = [SpecGroup, string | null, string, string];
const dims = (l: string, w: string, h: string, wb: string): S[] => [
  ['DIMENSIONS', 'length', 'Longueur', `${l} mm`], ['DIMENSIONS', 'width', 'Largeur', `${w} mm`],
  ['DIMENSIONS', 'height', 'Hauteur', `${h} mm`], ['DIMENSIONS', 'wheelbase', 'Empattement', `${wb} mm`],
];

const VEHICLES: { slug: string; name: string; tagline: string; category: string; energies: Energy[]; isNew?: boolean; page: string; specs: S[] }[] = [
  {
    slug: 'uni-k', name: 'UNI-K', tagline: 'Un grand SUV de 4,87 mètres à la ligne fuyante.', category: 'suv', energies: ['PETROL', 'PLUG_IN_HYBRID'], page: 'Changan_UNI-K',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', '2,0 L turbo essence ; 1,5 L turbo hybride rechargeable (iDD), selon les marchés'],
      ['POWERTRAIN', 'transmission', 'Transmission', 'Automatique 8 rapports (2,0 L) ; DHT 3 rapports (iDD)'],
      ['POWERTRAIN', 'drive', 'Roues motrices', 'Traction ou quatre roues motrices, selon les marchés'],
      ...dims('4 865', '1 948', '1 690 à 1 700', '2 890'),
    ],
  },
  {
    slug: 'nevo-q05', name: 'Nevo Q05', tagline: 'Un SUV compact 100 % électrique, sur plateforme dédiée.', category: 'suv', energies: ['ELECTRIC'], isNew: true, page: 'Changan_Nevo_Q05',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', 'Électrique synchrone à aimants permanents, à l’avant'],
      ['POWERTRAIN', 'power', 'Puissance', '120 kW'],
      ['POWERTRAIN', 'battery', 'Batterie', '40,3 ou 51,9 kWh, LFP'],
      ['POWERTRAIN', 'range', 'Autonomie', '405 à 506 km (cycle chinois CLTC)'],
      ...dims('4 435', '1 855', '1 600', '2 735'),
    ],
  },
  {
    slug: 'x5-plus', name: 'X5 Plus', tagline: 'Un SUV compact cinq places, turbo essence.', category: 'suv', energies: ['PETROL'], page: 'Changan_X5_Plus',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', '1,5 L turbo essence'],
      ['POWERTRAIN', 'transmission', 'Transmission', 'Double embrayage 7 rapports ou manuelle 5 rapports, selon les marchés'],
      ['COMFORT', 'seats', 'Places', '5'],
      ...dims('4 490', '1 860', '1 580', '2 710'),
    ],
  },
  {
    slug: 'cs35-plus', name: 'CS35 Plus', tagline: 'Un petit SUV de 4,34 mètres, taillé pour la ville.', category: 'suv', energies: ['PETROL'], page: 'Changan_CS35_Plus',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', '1,4 L turbo ou 1,6 L essence, selon les marchés'],
      ['POWERTRAIN', 'transmission', 'Transmission', 'Manuelle 5 rapports, semi-automatique 6 rapports ou double embrayage 7 rapports'],
      ['POWERTRAIN', 'drive', 'Roues motrices', 'Traction'],
      ...dims('4 335', '1 825', '1 660', '2 600'),
    ],
  },
  {
    slug: 'eado-ev', name: 'Eado EV', tagline: 'La berline compacte de la gamme, en version électrique.', category: 'berlines', energies: ['ELECTRIC'], page: 'Changan_Eado',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', 'Électrique'],
      ...dims('4 710', '1 820', '1 505', '2 700'),
    ],
  },
  {
    slug: 'hunter', name: 'Hunter', tagline: 'Un pick-up intermédiaire double cabine.', category: 'pick-up', energies: ['DIESEL', 'PETROL', 'RANGE_EXTENDER'], page: 'Changan_F70',
    specs: [
      ['POWERTRAIN', 'engine', 'Moteur', '1,9 L ou 2,5 L diesel ; 2,4 L turbo essence ; prolongateur d’autonomie 2,0 L turbo, selon les marchés'],
      ['POWERTRAIN', 'transmission', 'Transmission', 'Manuelle 6 rapports, automatique 6 ou 8 rapports'],
      ['POWERTRAIN', 'drive', 'Roues motrices', 'Propulsion ou quatre roues motrices'],
      ...dims('5 330', '1 920', '1 819', '3 180').map(([g, k, l, v]): S => [g, k, k === 'length' ? 'Longueur (double cabine)' : l, v]),
    ],
  },
];

async function main() {
  const dir = join(__dirname, '..', 'seed', 'photos');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, { file: string; category: MediaView; alt: string; credit: string; license: string; licenseUrl: string; sourceUrl: string }[]>;
  const media = new MediaService(prisma as never, new StorageService());
  const manifestKey: Record<string, string> = { 'nevo-q05': 'q05' };

  for (const old of await prisma.vehicle.findMany({ where: { isDemo: true }, select: { id: true } })) {
    for (const m of await prisma.vehicleMedia.findMany({ where: { vehicleId: old.id }, select: { id: true } })) await media.remove(m.id);
    await prisma.vehicle.delete({ where: { id: old.id } });
  }

  const categories = new Map<string, string>();
  for (const [position, [slug, name]] of [['suv', 'SUV'], ['berlines', 'Berlines'], ['pick-up', 'Pick-up']].entries()) {
    const c = await prisma.vehicleCategory.upsert({ where: { slug }, update: {}, create: { slug, name, position } });
    categories.set(slug, c.id);
  }

  const ids: Record<string, string> = {};
  for (const [position, v] of VEHICLES.entries()) {
    const created = await prisma.vehicle.create({
      data: {
        slug: v.slug, name: v.name, tagline: v.tagline, categoryId: categories.get(v.category)!, energies: v.energies,
        published: true, isDemo: true, isNew: v.isNew ?? false, position,
        specifications: {
          create: v.specs.map(([group, key, label, value], i) => ({ group, key, label, value, position: i, verification: 'INTERNATIONAL_SOURCE', ...wiki(v.page) })),
        },
      },
    });
    ids[v.slug] = created.id;
    // Vues extérieures retenues : détourées, plaques masquées, sans décor. Habitacle : photographies d'origine.
    const all = manifest[manifestKey[v.slug] ?? v.slug] ?? [];
    const chosen = CUTOUTS[v.slug] ?? [];
    const photos = [
      ...chosen.map((name) => all.find((p) => p.file === `${name}.jpg`)!),
      ...all.filter((p) => !chosen.includes(p.file.slice(0, -4)) && (INTERIOR.includes(p.category) || v.slug === 'hunter')),
    ];
    for (const p of photos) {
      const cut = chosen.includes(p.file.slice(0, -4));
      const row = await media.ingest(created.id, 'IMAGE', readFileSync(join(dir, p.file)), {
        view: p.category, alt: p.alt, credit: cut ? `${p.credit}, photo détourée et plaque masquée` : p.credit, license: p.license, licenseUrl: p.licenseUrl, sourceUrl: p.sourceUrl,
      });
      if (cut) await media.attachCutout(row.id, readFileSync(join(dir, '..', 'cutouts', `${p.file.slice(0, -4)}.webp`)));
    }
    console.log(`${v.name} : ${photos.length} photographies`);
  }

  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: { heroVehicleId: ids['uni-k'], featuredVehicleId: ids['nevo-q05'] },
    create: { id: 1, demoMode: true, heroVehicleId: ids['uni-k'], featuredVehicleId: ids['nevo-q05'] },
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
