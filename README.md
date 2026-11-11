# CHANGAN Togo

Site vitrine automobile, en trois projets : `frontend` (site public, Next.js), `admin` (administration, Next.js), `backend` (API NestJS, Prisma, PostgreSQL). Médias sur disque local ou stockage S3.

> **Maquette de démonstration.** Gamme, caractéristiques et disponibilités ne sont pas confirmées par CHANGAN Togo.
> Le mode démonstration affiche un bandeau et exclut le site des moteurs de recherche. Voir [docs/a-confirmer.md](docs/a-confirmer.md).

## Installation locale

Prérequis : Node 20.11+, pnpm 9, PostgreSQL 16 (binaires sur la machine, ou `PG_BIN=...`).

```bash
pnpm install
cp .env.example .env
ln -s ../.env frontend/.env.local
ln -s ../.env admin/.env.local
pnpm db:start                     # cluster propre au projet, 127.0.0.1:5544, dossier .pgdata
pnpm db:migrate
pnpm db:seed                      # données de démonstration
ADMIN_EMAIL=vous@exemple.tg ADMIN_PASSWORD='12 caractères minimum' pnpm admin:create
pnpm build && pnpm start          # site : http://localhost:3000 — administration : http://localhost:3002 — jeu : http://localhost:3004 (serveur en ligne : 3005)
```

`pnpm dev` lance l'ensemble en mode développement. La documentation Swagger de l'API est sur `http://127.0.0.1:3001/api/docs` (désactivée en production).

## Tests

```bash
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm test:e2e
```

Parcours réels dans Chrome (`CHROME_PATH` pour changer de navigateur) : `e2e/` pour le site, `jeu/tests/` pour le jeu et son serveur en ligne (`pnpm test:jeu` seuls). Les fichiers 360° et 3D sont générés par le test sur un véhicule temporaire, supprimé à la fin. Les limites de requêtes par minute s'appliquent aussi aux tests : laisser une minute entre deux exécutions.

## Structure

| Dossier | Rôle |
| --- | --- |
| `frontend/src/app/(site)` | Pages publiques |
| `frontend/src/components` | Composants (galerie, 360°, 3D, formulaire…) |
| `admin/src/app` | Administration : connexion, véhicules, catégories, accueil, demandes |
| `admin/src/components` | Formulaires, médias, caractéristiques |
| `backend/src/catalog` | API publique |
| `backend/src/admin`, `auth` | API protégée, sessions |
| `backend/src/media` | Validation des fichiers, variantes WebP, stockage |
| `backend/prisma` | Schéma, migrations, données de démonstration |
| `backend/seed/photos` | Photographies Wikimedia Commons et `manifest.json` (licences) |
| `backend/seed/cutouts` | Vues détourées, plaques masquées (mêmes licences) |
| `e2e` | Tests de bout en bout du site |
| `jeu` | Le jeu, à part du site : client, serveur en ligne, protocole, tests ([jeu/ARCHITECTURE.md](jeu/ARCHITECTURE.md)) |
| `deploy`, `docker-compose.yml` | Déploiement ([docs/deploiement.md](docs/deploiement.md)) |

`admin` copie quelques fichiers de `frontend` pour rester autonome : `lib/types.ts`, `lib/labels.ts`, `lib/media.ts`, `components/Photo.tsx`. Une modification de l'un est à reporter sur l'autre. Le site public ne relaie pas `/api/admin` : l'API d'administration ne passe que par `admin`.

## Variables d'environnement

Voir [.env.example](.env.example) en local et [.env.production.example](.env.production.example) en production. Aucun secret n'est préfixé `NEXT_PUBLIC_`.

## Déploiement

Voir [docs/deploiement.md](docs/deploiement.md).

## État vérifié

Mesures Lighthouse du 1er novembre 2026 : profil mobile simulé (4G lente), serveur local, données de démonstration, 3 passages par page. À refaire sur l'hébergement final avec les visuels définitifs.

| Page | Performance | Accessibilité | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- |
| Accueil | 93 | 100 | 3,2 s | 0 | 30 à 50 ms |
| Gamme | 98 à 100 | 100 | 0,9 à 2,4 s | 0 | 30 à 40 ms |
| Fiche | 93 à 96 | 100 | 2,8 à 3,2 s | 0 | 30 à 40 ms |

L'objectif LCP de 2,5 s n'est pas atteint sur l'accueil et les fiches. Avec un ralentissement réel du navigateur (2 passages), l'accueil mesure 2,5 à 2,6 s, pour un CLS de 0,015. L'INP n'a pas été mesuré : il exige des visites réelles. Le SEO (66 à 69 lors de la dernière mesure) est plafonné par l'exclusion volontaire des moteurs en mode démonstration.

## Direction artistique

Showroom sombre, véhicules détourés sur scène de studio et verre liquide (`.glass` dans `globals.css`). La réfraction SVG ne s'active que sous Chromium sur grand écran. Ailleurs : flou classique, ou aplat si le système demande moins de transparence.

Le hero de l'accueil fait rouler la voiture au défilement (`HeroDrive`). Il exige une vue de profil dont les jantes et les phares ont été relevés dans `lib/drive.ts` : seul l'UNI-K en a une. Un autre véhicule mis en avant dans l'administration retrouve le hero fixe avec son sélecteur de modèles (`HeroStage`). Si le système demande moins d'animations, la voiture reste immobile.

Cinq voitures du même modèle passent à la suite au défilement, une par couleur ; les pastilles amènent à l'une d'elles. Le bleu clair est la photo d'origine ; blanc, noir, gris et bleu sont simulés par `scripts/hero-colors.cjs` et affichés comme tels. Leurs noms viennent de listes de marchés étrangers : gamme de couleurs au Togo à confirmer.

## Essai virtuel

Le jeu vit dans `jeu/`, à part du site, avec son domaine et son serveur en ligne (voir [jeu/ARCHITECTURE.md](jeu/ARCHITECTURE.md)) ; la page `/essai-virtuel` du site le présente et y mène (`NEXT_PUBLIC_JEU_URL`, sinon le port 3004 du même hôte). Il charge Three.js seulement au clic sur « Prendre le volant » ou « Conduite libre ». Deux lieux : le quartier administratif de Lomé (par défaut) et une ville imaginaire plus légère. `jeu/client/src/moteur/sim.ts` porte la logique (conduite, circulation, parcours, score), `jeu/client/src/moteur/engine.ts` le rendu commun, `jeu/client/src/moteur/lome.ts` et `jeu/client/src/moteur/grid.ts` les deux lieux, `jeu/client/src/Jeu.tsx` l'interface.

Lomé vient d'OpenStreetMap (© contributeurs OpenStreetMap, ODbL, à créditer) : `scripts/lome-map.cjs` produit `jeu/client/public/game/lome.json` (limite officielle du quartier, rues, sens uniques, feux, bâtiments, parcours). Tracés, emprises, murs et noms suivent la carte : aucun bâtiment n'est inventé et aucun nom n'est ajouté, sauf l'immeuble de l'IAI-Togo, absent d'OpenStreetMap et relevé sur vue aérienne (forme à faire confirmer, précision de l'ordre de 10 m, hauteur estimée). Hauteurs sans donnée, couleurs, façades, arbres et circulation sont stylisés. L'hôtel du 2 Février et la place de l'Indépendance (`jeu/client/src/moteur/lome-hotel.ts`) sont reconstruits d'après deux vidéos de drone et de nuit, recoupées avec le plan : tour, socle à ailettes, dôme, auvent, monument, allées et bassins. Les dimensions sont déduites (dôme de 27 m sur la carte, tour de 102 m publiée), le relief et les reflets de la façade sont peints. Ces vidéos, de tiers et non libres, servent de référence : aucune image n'est intégrée, et `docs/2 Fervrier/` est exclu de Git. Le Palais des congrès et l'immeuble du CENETI (`jeu/client/src/moteur/lome-places.ts`) suivent le même principe, d'après des captures Google Maps exclues de Git elles aussi : les enseignes y sont redessinées, le côté de la façade du CENETI reste à confirmer. BSIC-TOGO, absent de la carte à cet endroit, est placé entre SUNU et le CENETI d'après son ombre sur la vue aérienne ; sa position et son emprise sont approximatives. Le CASEF (`jeu/client/src/moteur/lome-casef.ts`), dont la carte n'a que la rotonde, est relevé sur vue aérienne d'après `docs/autre lieu/casef/`. Plusieurs établissements (`jeu/client/src/moteur/lome-landmarks.ts` : UTB Circulaire, Orabank, La Poste de Nyékonakpoé, Sapeurs-pompiers, tour de la Direction des Postes, BSIC, SUNU, Hôtel Ahodikpe, Hôtel Folyana, Le Champion, Bar Metro, Fifty-Fifty, Cofina, Gozem) reçoivent façade et enseigne en texte, sans logo, d'après `docs/autre lieu/`, également exclu de Git ; leur usage public demande l'accord des établissements.

La voiture du joueur est la CHANGAN Nevo Q05 (1re génération, `jeu/client/src/moteur/changan.ts`), modelée à la main d'après les photographies du catalogue et la photo d'habitacle fournie par l'utilisateur (conduite à gauche, en miroir de la photo) : ce n'est pas un fichier 3D officiel, et vitesse, accélération et son restent ceux d'un jeu. Ne pas y afficher de valeur présentée comme celle d'un véhicule CHANGAN. Un modèle officiel remplacera `buildCar` (`jeu/client/src/moteur/vehicles.ts`) et `buildCabin` (`engine.ts`).

En conduite libre et avec « Se promener avec Honorable », l'acteur principal, Honorable, descend du véhicule (E), marche, court (Maj), saute (Espace) et salue (T). Il prend les véhicules garés près du départ (moto, SUV, pick-up, minibus, berline) et entre dans les bâtiments de la carte. Le parcours guidé reste en voiture. Des passants marchent sur les trottoirs, s'arrêtent devant les véhicules et s'écartent ; la circulation mêle voitures, motos, minibus et pick-up. Les personnages proches de la caméra sont des modèles 3D animés (`jeu/client/src/moteur/humans.ts`) : corps, coiffures et 13 animations de Quaternius, sous licence CC0 (`jeu/client/public/game/humains/LICENCE.txt`), habillés dans le jeu (chemise, cravate, pantalon ou jupe, chaussures peints sur le corps) ; les plus lointains gardent une silhouette simple (`jeu/client/src/moteur/people.ts`). Les véhicules et les deux intérieurs (`jeu/client/src/moteur/interior.ts`, une maison et un hall) sont imaginés : un intérieur générique s'ouvre derrière chaque porte, avec le nom du bâtiment s'il figure sur la carte, et la mention « Intérieur imaginé ». Aucun ne reproduit un lieu, une personne ou un modèle réel.

L'IAI-Togo a son propre intérieur (`jeu/client/src/moteur/iai-interior.ts`), d'après une vidéo de visite et huit photographies conservées hors du dépôt (vidéo dans les téléchargements de l'utilisateur, photographies dans `docs/iaitogo et palis des congrais/iaitogo/`, exclu de Git). Quatre niveaux dans les proportions de l'emprise de la carte ; hall d'entrée à sol de marbre en carrés concentriques, plafond sculpté, accueil, ascenseur (il dessert les quatre niveaux) et escalier de marbre ; portes vitrées du hall sur la cour ; galeries tout autour de la cour, à angles arrondis, parapet de marbre blanc à bandeau gris côté cour et vert côté galerie ; couloirs en damier à portes de bois ; escalier de béton gris et escalier à marches terre cuite ; cour avec pelouse, haies, allée brun-rouge, bassin rond et pas japonais. Dehors, le porche d'entrée (marbre noir, portes vitrées, enseigne) est ajouté au modèle de la ville. Le plan des salles, leur mobilier, la place des escaliers et de l'ascenseur, sont supposés ; aucune salle n'est nommée. L'entrée est sur la petite façade qui fait face à la clôture de la rue Agoucon et à la pelouse de la sculpture, et non côté parking, comme l'a indiqué l'utilisateur ; le hall occupe l'aile ouest jusqu'aux portes vitrées de la cour. Des étudiants en tenue (chemise bleu clair, cravate noire, pantalon ou jupe noirs) parcourent couloirs, galeries, cour et hall (36, ou 14 sur un téléphone modeste), et une quinzaine marchent dehors dans l'enceinte ; un passant sur trois porte la même tenue en ville. Honorable porte cette tenue. Le parking est l'espace entre l'IAI et BSIC, dans l'enceinte, comme l'a indiqué l'utilisateur : la bande entre la façade côté BSIC et la clôture, en dalles de béton, avec une vingtaine de motos en épi contre la clôture, une allée libre vers le portail, et un abri à toit de tôle sur poteaux blancs au bout, côté BSIC. Toutes se conduisent ; la bleue, près du portail, est placée pour Honorable. Toutes les motos garées sont dans l'enceinte de l'IAI : les rues n'ont que les autres véhicules.

Autres véhicules : cinq voitures stylisées du Car Kit de Kenney, sous licence CC0 (`jeu/client/public/game/voitures/`, `jeu/client/src/moteur/fleet.ts`) : sportive, compacte sport, SUV de luxe, taxi et fourgon, mises à l'échelle d'une vraie voiture. Elles roulent dans la circulation, et une sportive est garée près du départ. Aucun modèle de marque (Ferrari, Mercedes, Dodge…) n'est intégré : aucun n'a été trouvé sous licence libre vérifiable, et un site CHANGAN ne doit pas afficher d'autres marques sans leur accord. La Ferrari 458 des exemples de Three.js a été écartée, sa page d'origine et sa licence n'étant plus consultables. Sans les fichiers, ces véhicules prennent une silhouette générique.

À pied, Honorable danse (B, deux danses composées dans le jeu sur le squelette Quaternius, `danceClips` dans `jeu/client/src/moteur/humans.ts`), ramasse des billets de 1 000 F dans les rues et dépense son argent (20 000 F au départ, conservé dans le navigateur). Le supermarché Le Champion a son intérieur imaginé (`jeu/client/src/moteur/champion.ts`) : quatre allées, des frigos, des étals de fruits et légumes, trois caisses avec leur caissier. On y prend des articles, que l'on paie en caisse ; les articles non payés retournent en rayon à la sortie. Ce sont 26 produits génériques, sans marque. Les prix sont indicatifs : riz, spaghetti, huile et lait en poudre d'après des supermarchés en ligne du Cameroun et de Côte d'Ivoire, faute de prix publiés à Lomé ; les autres sont estimés. Honorable a le visage de l'utilisateur, tiré d'une image de face de sa vidéo du 9 novembre 2026 (`jeu/client/public/game/humains/visage-honorable.png`, exclu de Git car le dépôt est public : le copier à la main sur le serveur). Le visage est projeté de face sur la tête du modèle, calé sur le bout du nez et la largeur de la tête ; la coupe très courte est peinte sur le crâne. Ses vêtements suivent ceux de la vidéo : chemise bleu clair, cravate bleu nuit. Sans le fichier, il garde le visage du modèle. Deux-roues construits en code, sans marque : moto, scooter à tablier et moto sportive carénée (aucun modèle de moto libre de droits n'a été trouvé en téléchargement direct) ; le parking de l'IAI les mélange, la moto bleue d'Honorable est une sportive. En conduite libre il n'y a pas de limitation : chaque véhicule va de 250 à 300 km/h (sportive et moto sportive), avec un braquage réduit à haute vitesse et des pas de collision plus fins pour ne pas traverser les murs ; le parcours guidé garde ses 50 km/h. Maintenir « avancer » plus de 3 secondes fait courir Honorable. Un hélicoptère (construit en code, imaginé pour le jeu) attend sur une aire peinte, sur le terrain nu face à l'IAI : Espace monte, Maj descend, les flèches avancent et tournent (sur téléphone, boutons Monter et Descendre ; à la manette, stick droit ou RB). Il ne roule pas au sol, vole jusqu'à 250 km/h et 180 m, contourne ce qui le dépasse grâce aux hauteurs des bâtiments de la carte (`colliderHeights`) et se pose au sol ou sur un toit ; on n'en descend qu'au sol. SMART AI (bouton ou touche I, en conduite libre) prend le volant : perception des piétons, véhicules, obstacles, nids-de-poule et feux, décision (continuer, ralentir, freiner, s'arrêter, contourner) et commandes, voir [jeu/ARCHITECTURE.md](jeu/ARCHITECTURE.md). Les boutons du jeu sont des pictogrammes. Une manette standard (Xbox, PlayStation) est prise en charge : stick gauche, gâchettes pour accélérer et freiner, A pour agir, X pour sauter, B pour courir ou klaxonner, Y pour danser, Start pour la pause.

Non réalisé ou non vérifié :

- Docker Compose et l'envoi réel de courriel SMTP n'ont pas été exécutés. Le lien de réinitialisation a été testé via le journal de développement. Le stockage S3 a été testé contre un émulateur (s3rver), pas contre un service réel.
- Exploration d'habitacle (mode C), coloris par matériaux dans la 3D et vidéo dans le hero : non développés, faute de ressources.
- 360° et 3D sont testés avec des fichiers générés : aucun modèle ni série de photos du véhicule n'existe. Sans ces fichiers, les fonctions restent masquées.
- La lecture vidéo n'a pas été testée avec une vraie vidéo.
- `pnpm audit` signale `deepmerge-ts` (élevé) via l'outil Prisma, dont le correctif impose une nouvelle version majeure. Les autres alertes sont corrigées par `pnpm.overrides`.
