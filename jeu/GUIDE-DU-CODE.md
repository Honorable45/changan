# Guide du code : « Lomé en jeu »

Ce guide explique comment le jeu est construit : les langages, le rôle de chaque dossier et fichier, où se trouvent l'API et l'interface, et comment les morceaux s'enchaînent. **SMART AI**, la conduite autonome, a sa propre partie détaillée, avec l'emplacement exact de son code.

Pour aller plus loin : [ARCHITECTURE.md](ARCHITECTURE.md) (choix techniques, montée en charge, sécurité) et [DEPLOIEMENT.md](DEPLOIEMENT.md) (mise en ligne).

---

## 1. Langages et technologies

| Partie | Langage | Bibliothèques |
| --- | --- | --- |
| Jeu dans le navigateur | **TypeScript**, et **TSX** (TypeScript avec balises HTML) pour l'interface | **React 19** (boutons, panneaux), **Three.js** (3D WebGL), **Vite** (compilation), **Tailwind CSS 4** (styles) |
| Serveur en ligne | **TypeScript**, exécuté directement par **Node.js 24**, sans étape de compilation | **ws** (WebSocket) |
| Code commun au jeu et au serveur | **TypeScript** | aucune |
| Tests | **JavaScript** (`.mjs`) | **node:test** (intégré à Node), **Playwright** (pilote un vrai Chrome) |
| Données | JSON (plan de Lomé), glTF binaire `.glb` (modèles 3D) | — |

Le serveur exécute le TypeScript tel quel (Node « retire » les types au chargement). Seul du TypeScript dit *effaçable* y est permis : pas d'`enum`, pas de propriétés déclarées dans les paramètres d'un constructeur, et des imports qui écrivent l'extension `.ts`.

Les commentaires et les noms de l'interface sont en français. Les noms du moteur 3D et de SMART AI sont surtout en anglais (`DecisionEngine`, `RiskAnalyzer`…), ceux du réseau et du serveur en français (`envoyer`, `relayerVoix`…).

---

## 2. Vue d'ensemble

```
            Navigateur du joueur                                         Serveur du jeu (Node.js)
 ┌───────────────────────────────────────────────┐   WebSocket /ws   ┌────────────────────────────────────┐
 │ Interface React   Jeu.tsx, Communication.tsx  │ ◄──────────────►  │ serveur/src/index.ts               │
 │        │ commandes  ▲ HUD (vitesse, carte…)   │  positions,       │  salles de 60, voisins à 400 m,    │
 │        ▼            │                         │  discussion,      │  discussion, voix à 5 m,           │
 │ Moteur 3D        moteur/engine.ts (Three.js)  │  voix             │  modération, limites de débit      │
 │        │ chaque image                         │                   │                                    │
 │        ▼                                      │   HTTP /savoir    │  savoir partagé de SMART AI        │
 │ Simulation       moteur/sim.ts (sans rendu)   │ ◄──────────────►  │  (passages appris des joueurs)     │
 │ SMART AI         moteur/smart-ai/*.ts         │                   └────────────────────────────────────┘
 └───────────────────────────────────────────────┘          ▲
                         ▲                                  │
                         └──── partage/*.ts : protocole et validation communs aux deux côtés
```

Trois idées guident tout le code :

1. **La simulation est séparée de l'image.** `sim.ts` calcule la conduite, les collisions et la circulation sans rien dessiner. `engine.ts` lit son état et le dessine. On peut donc tester la conduite, et SMART AI, des milliers de fois plus vite que le temps réel, sans navigateur.
2. **Le serveur ne simule pas la physique.** Chaque joueur calcule son propre personnage et envoie sa position. Le serveur la vérifie (format, limites du monde, débit) et la relaie aux joueurs proches.
3. **SMART AI conduit comme un joueur.** Elle produit les mêmes commandes (accélérateur, frein, volant) que le clavier ou l'écran tactile. Elle ne téléporte rien et ne traverse rien.

---

## 3. Les dossiers

```
jeu/
├── client/        le jeu qui tourne dans le navigateur
├── serveur/       le serveur du jeu en ligne (l'« API » du jeu)
├── partage/       code commun au client et au serveur
├── tests/         tests automatiques
├── ARCHITECTURE.md, DEPLOIEMENT.md, GUIDE-DU-CODE.md, README.md
```

### `client/` : le jeu

| Fichier ou dossier | Rôle |
| --- | --- |
| [client/index.html](client/index.html) | Page HTML unique ; charge `src/main.tsx`. |
| [client/src/main.tsx](client/src/main.tsx) | Point d'entrée : lit la configuration, puis affiche l'interface React. |
| [client/src/config.ts](client/src/config.ts) | Adresses du serveur et du site, lues dans `/config.json` ou fixées à la compilation. |
| [client/src/Jeu.tsx](client/src/Jeu.tsx) | **Interface principale** : écran d'accueil (pseudo, bouton « Jouer », réglages), puis tout le HUD (vitesse, mini-carte, boutons, pédales tactiles, recherche de lieu, pause, bilan) et les touches du clavier. |
| [client/src/Communication.tsx](client/src/Communication.tsx) | **Interface en ligne** : liste des joueurs (distance, direction, « Y aller », Ignorer, Signaler), discussion écrite, bouton « Parler ». |
| [client/src/SmartAIDashboard.tsx](client/src/SmartAIDashboard.tsx) | Bouton **SMART AI : ON/OFF**, tableau de bord de l'IA, liseré coloré autour de l'écran. |
| [client/src/reseau.ts](client/src/reseau.ts) | Connexion au serveur : envoi de la position 10 fois par seconde, réception et lissage des autres joueurs, discussion, voix, reconnexion automatique. |
| [client/src/voix.ts](client/src/voix.ts) | Micro (capture et conversion en 8 kHz) et haut-parleurs (volume selon la distance, son du bon côté). |
| [client/src/moteur/](client/src/moteur/) | Le moteur du jeu, décrit ci-dessous. |
| [client/public/](client/public/) | Fichiers servis tels quels : plan de Lomé (`game/lome.json`), modèles 3D (`game/voitures`, `game/humains`), police, `config.json`. |
| [client/securite.mjs](client/securite.mjs) | En-têtes de sécurité du jeu (CSP, pas d'affichage dans un cadre, micro). Ils sont recopiés dans `render.yaml` et `deploy/Caddyfile`. |
| [client/vite.config.ts](client/vite.config.ts) | Compilation. Elle retire aussi la photo du visage d'Honorable de tout build publiable. |
| [client/precompresse.mjs](client/precompresse.mjs) | Après compilation : copies Brotli et Gzip des fichiers, servies telles quelles. |

#### `client/src/moteur/` : simulation, rendu, contenu

| Fichier | Rôle |
| --- | --- |
| [sim.ts](client/src/moteur/sim.ts) | **Logique du jeu, sans rendu** (classe `GameSim`) : physique des voitures, motos et hélicoptère ; Honorable à pied ; collisions ; feux ; circulation (`updateTraffic`) ; piétons ; parcours et score ; klaxon (`honk` : le véhicule devant se range). |
| [engine.ts](client/src/moteur/engine.ts) | **Moteur 3D** (`createGame`) : scène Three.js, caméras, lumières jour et nuit, boucle de rendu (`frame`), lecture du clavier, de l'écran tactile et de la manette, mini-carte (`drawMap`), autres joueurs, branchement de SMART AI, cadres de détection. Envoie le HUD à React (`emit`). |
| [lome.ts](client/src/moteur/lome.ts) | Construit le quartier administratif de Lomé à partir de `lome.json` (rues, bâtiments, arbres). |
| [lome-places.ts](client/src/moteur/lome-places.ts), [lome-landmarks.ts](client/src/moteur/lome-landmarks.ts), [lome-hotel.ts](client/src/moteur/lome-hotel.ts), [lome-casef.ts](client/src/moteur/lome-casef.ts) | Bâtiments reconnaissables, redessinés d'après des références : Palais des congrès, CENETI (IAI-Togo), hôtel du 2 Février, CASEF… |
| [grid.ts](client/src/moteur/grid.ts) | Ville imaginaire, plus légère (lien `?ville=imaginaire`). |
| [nav.ts](client/src/moteur/nav.ts) | Recherche de lieu et itinéraire du GPS (plus court chemin, annonce des virages). |
| [changan.ts](client/src/moteur/changan.ts) | Modèle 3D de la CHANGAN Nevo Q05, construit en code. |
| [vehicles.ts](client/src/moteur/vehicles.ts), [fleet.ts](client/src/moteur/fleet.ts) | Les autres véhicules : caractéristiques, et chargement des modèles du Car Kit de Kenney. |
| [humans.ts](client/src/moteur/humans.ts), [people.ts](client/src/moteur/people.ts) | Personnages : Honorable, passants, autres joueurs ; animations. |
| [interior.ts](client/src/moteur/interior.ts), [iai-interior.ts](client/src/moteur/iai-interior.ts), [champion.ts](client/src/moteur/champion.ts) | Intérieurs : générique, IAI-Togo, supermarché Le Champion (rayons, caisse). |
| [audio.ts](client/src/moteur/audio.ts) | Sons de synthèse : moteur, klaxon, alertes. |
| [kit.ts](client/src/moteur/kit.ts) | Réglages de la nuit, communs aux deux villes. |
| [smart-ai/](client/src/moteur/smart-ai/) | **SMART AI** (partie 5). |

### `serveur/` : l'API du jeu

Le serveur est **un seul fichier** : [serveur/src/index.ts](serveur/src/index.ts). Il expose ces points d'entrée :

| Adresse | Type | Rôle |
| --- | --- | --- |
| `/ws` | WebSocket | Jeu en ligne. Présentation (`bonjour`), positions 10 fois par seconde, arrivée et départ des voisins, carte de la salle, discussion, voix, signalements. |
| `/savoir` | HTTP GET / POST | Savoir partagé de SMART AI : passages appris des joueurs, points critiques, votes. |
| `/sante` | HTTP GET | État du serveur, pour l'hébergeur et le répartiteur. |
| `/metriques` | HTTP GET | Chiffres de supervision ; protégés par un jeton. |
| `/` | HTTP GET | Page texte « serveur en marche ». |

Ses fonctions principales, dans l'ordre du fichier :
- `fusionner`, `sauverSavoir` : savoir partagé, gardé dans `savoir.json` ;
- `choisirSalle` : place le joueur dans une salle de 60 au plus ;
- `adresse` : adresse réelle du joueur, derrière Cloudflare et Render ;
- `recevoir` : aiguille chaque message reçu ;
- `discuter` : message écrit (nettoyé, filtré, diffusé à la salle) ;
- `relayerVoix` : voix, relayée aux joueurs à moins de 5 m seulement ;
- `signaler` : modération collective ;
- `carteDe` : positions de toute la salle ;
- `tick` : 10 fois par seconde, envoie à chaque joueur ses voisins.

[serveur/src/charge.ts](serveur/src/charge.ts) est un robot de charge : il simule des centaines de joueurs.

> **Et l'API du site ?** Le dossier `backend/`, hors de `jeu/`, contient l'API NestJS du site CHANGAN (catalogue, demandes de contact, administration). **Le jeu ne l'utilise pas** : son seul serveur est `jeu/serveur`.

### `partage/` : code commun

| Fichier | Rôle |
| --- | --- |
| [partage/protocole.ts](partage/protocole.ts) | Format exact des messages entre jeu et serveur : état d'un joueur en 20 octets, instantané des voisins, trame de voix, codec audio μ-law, messages texte. On y trouve aussi le nettoyage des pseudos et des messages, les pseudos réservés et le filtre de grossièretés. |
| [partage/savoir.ts](partage/savoir.ts) | Format et validation du savoir de SMART AI (démonstrations, points critiques). |

Le client et le serveur importent ces mêmes fichiers : ils ne peuvent pas se désaccorder sur le format.

### `tests/`

| Fichier | Ce qu'il vérifie |
| --- | --- |
| [tests/smart-ai.test.mjs](tests/smart-ai.test.mjs) | SMART AI sans navigateur : les 10 scénarios exigés, l'apprentissage, l'anti-blocage, l'anti-collision de toute la circulation, le klaxon, 5 minutes de vraie circulation dans Lomé sans collision. |
| [tests/jeu.test.mjs](tests/jeu.test.mjs) | Le jeu dans un vrai Chrome (pédales tactiles, Honorable à pied, parcours, hélicoptère, deux navigateurs qui se voient, s'écrivent et se parlent) et le protocole du serveur. |
| [tests/securite.test.mjs](tests/securite.test.mjs) | Sécurité : adresse réelle et limites, pseudos réservés, signalements, savoir partagé, métriques, en-têtes, visage absent du build. |

---

## 4. Comment une image du jeu est produite

À chaque image (60 fois par seconde), la fonction `frame` de [engine.ts](client/src/moteur/engine.ts) :

1. lit les commandes du joueur (clavier, écran tactile, manette) ;
2. **si SMART AI est active**, les remplace par celles de `smart.update(sim, dt)` ;
3. sinon, si le joueur conduit lui-même, applique le freinage d'urgence de `fleet.emergency(sim)` ;
4. avance la simulation : `sim.update(dt, commandes)` ;
5. envoie la position au serveur (`sendState`), et place les autres joueurs (`syncRemotes`) ;
6. dessine la scène, la trajectoire de SMART AI (`drawSmart`) et ses cadres de détection (`drawBoxes`) ;
7. environ 10 fois par seconde, envoie le HUD à React (`emit`) et redessine la mini-carte (`drawMap`).

L'interface React ([Jeu.tsx](client/src/Jeu.tsx)) n'intervient jamais dans le calcul. Elle affiche le HUD reçu et appelle les méthodes du moteur : `g.toggleSmartAI()`, `g.horn(true)`, `g.navigate(...)`…

---

## 5. SMART AI : la conduite autonome en détail

### 5.1 Où est le code

Tout SMART AI est dans **[client/src/moteur/smart-ai/](client/src/moteur/smart-ai/)** :

| Fichier | Classe ou fonction principale | Rôle dans la chaîne |
| --- | --- | --- |
| [types.ts](client/src/moteur/smart-ai/types.ts) | `Detection`, `Threat`, `Decision`, `Path`, `Telemetry` | Les types partagés, et la convention d'orientation du jeu. |
| [controller.ts](client/src/moteur/smart-ai/controller.ts) | **`SmartAIController`** | **Le chef d'orchestre** : active ou coupe l'IA et fait tourner toute la chaîne à chaque image (méthode `update`). |
| [itinerary.ts](client/src/moteur/smart-ai/itinerary.ts) | `Itinerary` | 1. Itinéraire : la suite de rues jusqu'à la destination (Dijkstra). |
| [route.ts](client/src/moteur/smart-ai/route.ts) | `LanePlanner`, `project`, `pointAt` | 2. Trajectoire : la voie de droite à suivre sur les 120 m et plus qui viennent. |
| [detector.ts](client/src/moteur/smart-ai/detector.ts) | `Sensor`, `GameStateSensor`, `EnvironmentDetector` | 3. Perception : ce qu'il y a autour (piétons, véhicules, obstacles, feux, nids-de-poule). |
| [risk.ts](client/src/moteur/smart-ai/risk.ts) | `RiskAnalyzer` | 4. Risque : distance, temps avant collision et niveau de danger de chaque objet. |
| [decision.ts](client/src/moteur/smart-ai/decision.ts) | `DecisionEngine` | 5. Décision : continuer, ralentir, freiner, s'arrêter ou contourner, et à quelle vitesse. |
| [vehicle.ts](client/src/moteur/smart-ai/vehicle.ts) | `VehicleController` | 6. Commandes : volant, accélérateur, frein. |
| [antiblock.ts](client/src/moteur/smart-ai/antiblock.ts) | `AntiBlockage` | Surveillance : repère un véhicule bloqué et choisit la manœuvre suivante, sans boucle. |
| [maneuver.ts](client/src/moteur/smart-ai/maneuver.ts) | `Maneuver`, `clearance` | Manœuvres de dégagement : recul, demi-tour en plusieurs fois, marche arrière jusqu'au carrefour, passage appris. |
| [learning.ts](client/src/moteur/smart-ai/learning.ts) | `KnowledgeBase`, `DrivingRecorder` | Apprentissage à partir de la conduite des joueurs. |
| [fleet.ts](client/src/moteur/smart-ai/fleet.ts) | `FleetSafety` | Anti-collision de **toute la circulation**, et freinage d'urgence du joueur. |

Elle est branchée au jeu en quatre endroits :
- **[engine.ts](client/src/moteur/engine.ts)** : création de `SmartAIController` et de `FleetSafety` (`sim.safety = fleet`), base de savoir chargée et partagée avec le serveur, appel `smart.update` dans `frame`, dessin de la trajectoire et des cadres ;
- **[sim.ts](client/src/moteur/sim.ts)** : `updateTraffic` demande à `sim.safety.guard(...)` la vitesse permise à chaque véhicule de la circulation ; `drivable` et `occludes` disent à l'IA où l'on peut rouler et ce qui cache la vue ;
- **[SmartAIDashboard.tsx](client/src/SmartAIDashboard.tsx)** : le bouton et le tableau de bord ;
- **[Jeu.tsx](client/src/Jeu.tsx)** : la touche **I** et l'affichage du bouton.

Convention d'orientation, utile pour lire tous les calculs : un véhicule de cap `h` regarde vers `(sin h, cos h)`, et sa droite est `(−cos h, sin h)`. Un décalage latéral positif est à droite.

### 5.2 La chaîne, image par image

`SmartAIController.update(sim, dt)` ([controller.ts](client/src/moteur/smart-ai/controller.ts)) fait, dans cet ordre :

```
 Itinerary ─► LanePlanner ─► EnvironmentDetector ─► RiskAnalyzer ─► DecisionEngine ─► VehicleController ─► commandes
 (rues)       (trajectoire)  (objets perçus)        (dangers)       (action)           (volant, pédales)
                                                                         │
                                       AntiBlockage (bloqué ?) ──────────┴──► Maneuver (recul, demi-tour, passage appris…)
```

1. **Manœuvre en cours ?** S'il y en a une (recul, demi-tour…), elle seule commande (`runManeuver`), en continuant de percevoir les alentours.
2. **Itinéraire** (`navigate`, puis `Itinerary.plan`) : si une destination est choisie (recherche de lieu ou « Y aller »), le plus court chemin dans le sens de circulation est calculé **une fois**. Il n'est recalculé que si le véhicule s'en écarte ou si une rue se révèle bloquée. Si la destination est derrière, l'IA cherche un endroit assez large pour faire demi-tour.
3. **Trajectoire** (`LanePlanner.plan`), 4 fois par seconde : la voie de droite des rues sur au moins 120 m (7 secondes de route à la vitesse actuelle). Aux carrefours, elle prend la rue de l'itinéraire, sinon la plus à droite.
4. **Perception** (`EnvironmentDetector.detect`) : tous les objets à moins de 150 m, ou de 8 secondes de route. Aujourd'hui, le capteur `GameStateSensor` lit l'état réel de la simulation : piétons, circulation, véhicules garés, nids-de-poule, feux, murs devant. L'interface `Sensor` est faite pour qu'un capteur de vision (caméra et YOLO, par exemple) s'ajoute sans rien changer à la suite. `trackStill` note depuis combien de temps chaque objet est immobile : un véhicule arrêté depuis longtemps est traité comme un obstacle (panne).
5. **Risque** (`RiskAnalyzer.analyze`) : chaque objet est ramené à la trajectoire. On calcule :
   - la distance libre devant (`gap`) ;
   - l'écart latéral, maintenant et prédit au moment où l'on arrivera à sa hauteur (un piéton qui traverse) ;
   - le temps avant collision (`ttc`) ;
   - la décélération nécessaire pour l'éviter (`decel`).

   Le niveau de danger en découle (méthode `level`). Dans le couloir ou en travers :

   | Niveau | Seuil |
   | --- | --- |
   | **4 CRITIQUE** | moins de 3 m, ou décélération > 6 m/s², ou collision dans moins de 1,2 s |
   | **3 ÉLEVÉ** | moins de 8 m, ou décélération > 2,5 m/s², ou collision dans moins de 3 s |
   | **2 MOYEN** | moins de 45 m |
   | **1 FAIBLE** | au-delà |

   En cas d'incertitude, le niveau le plus prudent l'emporte.
6. **Décision** (`DecisionEngine.decide`) : on part de « CONTINUER » à 50 km/h, ralenti dans les virages (`curveSpeed`), et chaque danger peut imposer plus prudent :
   - **feu rouge** : arrêt à la ligne ;
   - **piéton qui traverse** : arrêt avant son passage ;
   - **piéton immobile sur la voie** : contourné largement et au pas, s'il y a la place ;
   - **véhicule devant dans le même sens** : 2 secondes de distance, 6 m au moins ;
   - **véhicule arrêté, garé, obstacle fixe** : contourné par le passage le plus sûr, sinon arrêt à 7 m ;
   - **véhicule en face** : jamais de contournement.

   Pour contourner, `options` compare plusieurs passages : gauche ou droite, sur la chaussée ou sur un bas-côté praticable (`drivable`). Chacun est noté selon la marge aux obstacles, l'ampleur de l'écart, le terrain et les véhicules qui arrivent en face (`check`). Le plus sûr l'emporte ; sans passage sûr, la voiture s'arrête. Un contournement engagé est tenu jusqu'à dépasser l'obstacle, puis la voiture regagne sa voie dès qu'elle est libre.
7. **Commandes** (`VehicleController.control`) :
   - le volant vise un point de la trajectoire situé de 5 à 26 m devant, selon la vitesse (poursuite pure), décalé si l'on contourne ; le décalage se prend progressivement, sans coup de volant ;
   - l'accélérateur et le frein suivent la vitesse demandée ; à l'arrêt, le frein reste serré, et la voiture ne passe jamais d'elle-même en marche arrière.
8. **Anti-blocage** (`AntiBlockage.watch`) : il y a blocage si la décision immobilise la voiture sans solution, ou si la voiture n'a pas parcouru 0,8 m en 4 s alors qu'elle devrait avancer. `escape` choisit alors une stratégie, sans répéter celle qui vient d'échouer au même endroit :
   1. **un passage appris** d'un joueur qui s'est sorti de ce même endroit (partie 5.3) ;
   2. si un piéton bloque : **reculer de 5 m**, puis **attendre** ;
   3. si un obstacle est trop proche pour être contourné : **reculer** pour prendre de l'élan ;
   4. si la voiture ne bouge plus : **reculer de 3 m** ;
   5. **demi-tour en plusieurs fois**, si la rue est assez large (au moins 7 m) ;
   6. sinon, **marche arrière en suivant la voie jusqu'au carrefour précédent**, et la rue bloquée est évitée.

   Après **5 manœuvres en 3 minutes** (`AntiBlockage.MAX`), c'est l'**arrêt sécurisé** avec un message : le conducteur reprend la main.
9. **Tableau de bord** : la télémétrie est mise à jour (vitesse, objet, distance, danger, décision, action, trajectoire, navigation, contournements, anti-blocage, savoir), ainsi que ce qui est dessiné (trajectoire et cadres de détection).

Pendant toutes les manœuvres ([maneuver.ts](client/src/moteur/smart-ai/maneuver.ts)), des **sondes** (`clearance`) vérifient l'espace devant ou derrière. La manœuvre change de sens avant de toucher quoi que ce soit, et se met en pause si quelqu'un passe tout près.

### 5.3 Apprentissage par la conduite des joueurs

Code : [learning.ts](client/src/moteur/smart-ai/learning.ts), branché dans `escape` ([controller.ts](client/src/moteur/smart-ai/controller.ts)) et dans [engine.ts](client/src/moteur/engine.ts).

1. Là où SMART AI reste bloquée, elle note un **point critique** (`KnowledgeBase.addCritical`) : lieu, cap, cause.
2. Quand un joueur conduit lui-même, `DrivingRecorder.sample` garde un point tous les 50 cm de sa dernière minute de conduite.
3. S'il passe par un point critique et s'en éloigne de 25 m **sans aucun choc**, le morceau de trajet devient une **démonstration** (`addDemo`).
4. Bloquée de nouveau près de ce point, SMART AI rejoue la démonstration au pas, sondes actives (`Maneuver` de type `apprise`). C'est **réussi** si la voiture s'éloigne de 20 m, **raté** si elle se rebloque à moins de 10 m. Une démonstration qui échoue deux fois sans jamais réussir est abandonnée.
5. Le savoir est gardé dans le navigateur (`localStorage`) et partagé par le serveur (`/savoir`) avec tous les joueurs. Le serveur n'accepte une démonstration que près d'un point critique connu, compte un seul vote par adresse et par démonstration, et applique des quotas par heure.

### 5.4 Toute la circulation est équipée

Code : [fleet.ts](client/src/moteur/smart-ai/fleet.ts), appelé par `updateTraffic` dans [sim.ts](client/src/moteur/sim.ts).

Chaque véhicule de la circulation analyse sa propre trajectoire avec le **même `RiskAnalyzer`** que la voiture du joueur, et en déduit une vitesse à ne pas dépasser (`FleetSafety.guard` puis `limitFor`) :
- **piétons et obstacles** : arrêt avant eux ;
- **véhicule devant** : il le suit à distance ;
- **véhicule en face** : il s'arrête ;
- **croisement** : celui qui arriverait le second cède le passage ; à égalité, l'indice du véhicule départage ;
- **deux véhicules qui s'attendent l'un l'autre** plus de 3 s : le plus petit indice repart au pas.

Pour rester fluide sur téléphone, chaque véhicule ne refait son analyse que 10 fois par seconde, en décalé. `FleetSafety.emergency` fournit aussi le **freinage d'urgence** du joueur qui conduit lui-même : collision dans moins de 1,5 s, ou freinage nécessaire de plus de 5,5 m/s².

Quand le joueur **klaxonne** (`GameSim.honk`), les véhicules devant lui, dans le même sens et à moins de 40 m, se rangent à droite et s'arrêtent. Le détecteur les marque alors comme immobiles, et SMART AI les dépasse comme un véhicule garé.

### 5.5 Où regarder pour modifier SMART AI

| Pour changer… | Aller à |
| --- | --- |
| la vitesse de croisière (50 km/h) | `cruise` dans `DecisionEngine` ([decision.ts](client/src/moteur/smart-ai/decision.ts)) |
| les seuils de danger | `RiskAnalyzer.level` ([risk.ts](client/src/moteur/smart-ai/risk.ts)) |
| les distances de sécurité et les règles de contournement | `DecisionEngine.decide` et `options` |
| la tenue de route (volant, freinage) | `VehicleController.control` ([vehicle.ts](client/src/moteur/smart-ai/vehicle.ts)) |
| l'ordre des stratégies de dégagement | `SmartAIController.escape` ([controller.ts](client/src/moteur/smart-ai/controller.ts)) |
| le nombre de manœuvres avant l'arrêt sécurisé | `AntiBlockage.MAX` ([antiblock.ts](client/src/moteur/smart-ai/antiblock.ts)) |
| l'ajout d'un vrai capteur (caméra, vision) | une nouvelle classe qui implémente `Sensor` ([detector.ts](client/src/moteur/smart-ai/detector.ts)), passée à `new SmartAIController(sim, [capteurs])` |
| le comportement de la circulation | `FleetSafety.limitFor` ([fleet.ts](client/src/moteur/smart-ai/fleet.ts)) |

Après toute modification, `node --test jeu/tests/smart-ai.test.mjs` rejoue les scénarios en quelques secondes, sans navigateur.

---

## 6. Le jeu en ligne

- **Connexion** ([reseau.ts](client/src/reseau.ts), `creerReseau`) : WebSocket vers `/ws`, présentation avec le pseudo et l'apparence (jamais le visage d'Honorable). En cas de coupure, nouvelle tentative de plus en plus espacée, jusqu'à 30 s ; le jeu reste jouable seul.
- **Positions** : 20 octets par joueur, 10 fois par seconde (`encodeEtat` dans [protocole.ts](partage/protocole.ts)). Le serveur renvoie à chacun ses 32 voisins les plus proches dans un rayon de 400 m. Le client les affiche 200 ms « dans le passé », pour interpoler sans à-coups.
- **Carte de la salle** : toutes les 2 s, la position de tous les joueurs de la salle (points de couleur sur la mini-carte, liste des joueurs).
- **Discussion** : messages de 200 caractères au plus, un toutes les 0,8 s, filtrés, diffusés à la salle. Les 30 derniers sont envoyés à l'arrivant, en mémoire seulement.
- **Voix en direct** : bouton « Parler » ou touche V. Trames de 100 ms en μ-law 8 kHz, relayées **seulement aux joueurs à moins de 5 m** ; c'est le serveur qui mesure la distance. Rien n'est enregistré.
- **Modération** :
  - pseudos uniques dans chaque salle (« Kofi 2 ») ;
  - pseudos réservés refusés (Honorable, CHANGAN, Admin…) ;
  - grossièretés masquées ;
  - « Ignorer » ;
  - « Signaler » : 2 joueurs et 20 % de la salle mettent un joueur en sourdine pendant 10 minutes.

---

## 7. Lancer, tester, compiler

Les commandes se lancent depuis la racine du dépôt.

| Commande | Effet |
| --- | --- |
| `pnpm jeu:dev` | Jeu sur http://localhost:3004 (rechargement à chaque modification) et serveur sur le port 3005. |
| `pnpm jeu:build` | Compile le jeu dans `jeu/client/dist`. |
| `pnpm jeu:start` | Sert le jeu compilé et le serveur. |
| `pnpm test:jeu` | Tous les tests du jeu (le jeu et son serveur doivent tourner). |
| `node --test jeu/tests/smart-ai.test.mjs` | Les tests de SMART AI seuls, sans navigateur ni serveur. |
| `pnpm --filter jeu-client exec tsc --noEmit` | Vérification des types du jeu. |
