# Architecture du jeu

Le jeu est une application à part du site de la concession. Il a son propre dossier, son domaine, son déploiement et ses tests. Le site n'en garde qu'une page de présentation, `/essai-virtuel`, avec un lien vers le jeu.

```
Navigateur ──HTTPS──▶ CDN ou Caddy ──▶ client statique (HTML, JS, modèles 3D)
     │
     └──WebSocket wss://jeu…/ws──▶ répartiteur (Caddy, least_conn)
                                      ├──▶ serveur de jeu, instance 1 ─ salles de 60 joueurs
                                      ├──▶ serveur de jeu, instance 2 ─ salles de 60 joueurs
                                      └──▶ …autant d'instances que nécessaire
```

## Dossiers

| Dossier | Contenu |
| --- | --- |
| `client/` | Le jeu dans le navigateur : Vite, React pour l'interface, Three.js pour la 3D. `src/moteur/` contient le rendu et la simulation, `src/reseau.ts` la connexion en ligne, `public/game/` la carte de Lomé et les modèles 3D. |
| `serveur/` | Le serveur en ligne : Node 24 et la bibliothèque `ws`, sans base de données. `src/index.ts` est le serveur, `src/charge.ts` l'essai de charge. |
| `partage/` | Le protocole réseau, commun au client et au serveur. |
| `tests/` | Les tests de bout en bout du jeu, du protocole et du serveur. |

## Pourquoi le jeu ne rame pas

**Au chargement :**
- L'écran d'accueil ne charge qu'environ 90 Ko compressés.
- Three.js et le moteur, environ 250 Ko compressés, ne se téléchargent qu'au lancement d'une partie.
- Les modèles des personnages arrivent ensuite, pendant que la ville est déjà jouable.
- Chaque fichier est précompressé en Brotli et en Gzip à la compilation : 6,2 Mio de fichiers deviennent 2,8 Mio transférés.
- Les scripts portent leur empreinte dans leur nom et se gardent un an en cache. Three.js est à part, donc une mise à jour du jeu ne le fait pas retélécharger.

**Pendant la partie :**
- Seuls les personnages proches de la caméra sont détaillés : 14 au plus, 5 sur un téléphone. Les autres gardent une silhouette simple.
- Les passants lointains ne sont ni dessinés ni animés.
- Si l'image passe sous 26 images par seconde pendant 3 secondes, le jeu coupe les ombres, puis baisse la définition.
- Les appareils modestes (écran tactile, 4 cœurs ou moins) ont dès le départ moins de circulation, de passants et d'étudiants.

**En ligne :**
- Le serveur ne calcule pas la physique. Chaque navigateur simule sa propre partie et envoie l'état de son personnage, 20 octets, 10 fois par seconde au plus, et seulement s'il a changé.
- Chaque joueur ne reçoit que ses 32 voisins les plus proches, dans un rayon de 400 m, 21 octets par voisin. Le débit reste donc stable quand la salle se remplit : moins de 1 Kio/s par joueur mesuré, au plus environ 7 Kio/s avec 32 voisins.
- Les autres joueurs sont affichés 200 ms dans le passé et interpolés entre deux instantanés : pas d'à-coups, même avec une connexion irrégulière.
- Ce sont des « fantômes » : on ne les percute pas. Il n'y a donc rien à corriger quand deux navigateurs ne sont pas d'accord.

## Montée en charge : des milliers de joueurs

**Salles.** Une salle est une session de la ville : 60 joueurs au plus (`CAPACITE_SALLE`).
- Un nouveau joueur rejoint la salle la plus remplie qui a encore de la place, pour que les joueurs se croisent. Une nouvelle salle s'ouvre quand toutes sont pleines.
- On voit les joueurs de sa salle, pas ceux des autres salles.

**Instances.** Une instance du serveur héberge des salles jusqu'à `MAX_JOUEURS` joueurs.
- Les instances ne partagent rien : ni base, ni Redis, ni état commun. On en ajoute ou on en retire sans rien changer d'autre.
- Le répartiteur (Caddy) envoie chaque nouvelle connexion à l'instance qui en a le moins.
- Il écarte une instance pleine ou en cours d'arrêt : sa page `/sante` répond alors 503.

**Mesures.** Sur la machine de développement (12 cœurs, robots et serveur sur le même ordinateur, donc des chiffres prudents) :

| Joueurs simulés | Durée moyenne d'un instant (100 ms disponibles) | Sortie du serveur |
| --- | --- | --- |
| 1 000 | 24 ms | 0,7 Mo/s |
| 1 500 | 31 ms | 1,1 Mo/s |

Ces mesures donnent une instance d'un cœur pour 1 500 joueurs, avec de la marge. Pour 10 000 joueurs simultanés, il faut 7 à 8 instances, par exemple deux serveurs de 4 cœurs, et environ 60 Mbit/s en sortie. `pnpm jeu:charge 1500 30 wss://jeu…/ws` refait la mesure sur le vrai serveur.

**Arrêt et mise à jour sans coupure :**
- À l'arrêt (SIGTERM), une instance prévient ses joueurs et ferme leurs connexions.
- Chaque client se reconnecte de lui-même, après un délai qui double jusqu'à 30 s, avec un peu de hasard pour que tous ne reviennent pas à la même milliseconde.
- Il retombe sur une autre instance, et la partie en cours continue pendant ce temps.

## SMART AI : conduite autonome

**Utilisation.** Le bouton « SMART AI : OFF » (ou la touche I) apparaît en conduite libre, dans un véhicule routier ; il n'existe ni pour l'hélicoptère ni à pied.
- Activée, SMART AI conduit avec les mêmes commandes que le joueur : accélérateur, frein, volant.
- Pendant ce temps, le clavier, le tactile et la manette sont ignorés.
- Un second clic rend la main.

Le code est dans `client/src/moteur/smart-ai/`. Il ne touche ni à la physique ni aux collisions de `sim.ts`.

| Module | Rôle |
| --- | --- |
| `controller.ts` (SmartAIController) | Activation, enchaînement des modules à chaque image, alertes, données du tableau de bord |
| `route.ts` (LanePlanner) | Trajectoire : la voie de droite des rues, celle que suit la circulation ; aux carrefours, vers l'itinéraire demandé ou tout droit, en évitant les impasses |
| `detector.ts` (EnvironmentDetector, GameStateSensor) | Perception : piétons, motos, voitures, camions et minibus, véhicules garés, nids-de-poule, feux, murs et poteaux, lus dans la simulation |
| `risk.ts` (RiskAnalyzer) | Distance libre, écart au couloir maintenant et prédit, temps avant collision, décélération nécessaire, niveau de danger |
| `decision.ts` (DecisionEngine) | CONTINUER, RALENTIR, FREINER, ARRÊT ou CONTOURNER, avec une vitesse visée et un décalage latéral |
| `itinerary.ts` (Itinerary) | Itinéraire vers la destination demandée (recherche d'un lieu) : plus court chemin dans le graphe des rues, calculé une fois et suivi tel quel ; il dit si le point de passage est derrière le véhicule |
| `antiblock.ts` (AntiBlockage) | Surveille que le véhicule avance, identifie la cause d'un blocage, choisit la manœuvre suivante sans répéter un échec au même endroit, et décide d'un arrêt sécurisé expliqué après 5 tentatives |
| `maneuver.ts` (Maneuver) | Manœuvres de dégagement : recul, demi-tour en plusieurs fois, marche arrière guidée jusqu'au carrefour ; sondes devant et derrière |
| `vehicle.ts` (VehicleController) | Volant (poursuite de la voie), accélérateur et frein ; arrêt à la distance voulue |
| `SmartAIDashboard.tsx` | Bouton, tableau de bord, liseré coloré autour de l'écran |

**Règles de prudence :**
- Seul un objet immobile par nature se contourne : véhicule garé, mur, nid-de-poule. Il ne se contourne qu'après vérification du couloir sur toute la manœuvre : chaussée, obstacles fixes, objets perçus et leur trajectoire, véhicule en face avec 3 secondes de marge.
- Un piéton, une moto ou une voiture en mouvement ne se contournent jamais : on freine ou on s'arrête.
- **En cas de doute, ralentir ou s'arrêter.** Si la voie est introuvable, au bout d'une impasse, ou sans manœuvre sûre, SMART AI s'arrête et demande au conducteur de reprendre le volant.
- Après un arrêt, la voie doit rester libre 0,8 s avant de repartir.
- SMART AI s'arrête aux feux rouges.
- Elle roule à 50 km/h au plus, moins dans les virages.

**Itinéraire.** Un lieu choisi dans la recherche devient la destination de SMART AI.
- **Itinéraire fixe :** il est calculé une fois. Il n'est recalculé qu'en cas d'écart (manœuvre de secours) ou de rue bloquée, jamais arbitrairement ; un contournement ne le change pas.
- **Point de passage derrière le véhicule :** le plus court chemin commence par la rue dans l'autre sens.
  - Là où la rue offre 7 m praticables, SMART AI fait demi-tour, puis reprend l'itinéraire.
  - Sinon, elle avance en cherchant un endroit plus large.
- **Arrivée :** arrêt à la hauteur de la destination.

**Choisir un passage.** Avant chaque contournement, le moteur de décision compare plusieurs passages :
- **Candidats :** à gauche et à droite, au plus près puis plus largement. Pour une barrière, toutes les positions de −6 à +6 m.
- **Vérifications, chacune sur toute la manœuvre :**
  - chaussée, ou bas-côté (jusqu'à 3,5 m au-delà de la bordure) si chaque point est praticable : ni mur, ni eau, dans les limites ;
  - murs sondés tous les 50 cm en longueur et 40 cm en largeur ;
  - piétons et véhicules, avec leur mouvement prévu ;
  - véhicule venant en face, avec 3 s de marge ;
  - place pour braquer.
- **Note :** marge aux obstacles, ampleur de l'écart, terrain (bas-côté pénalisé). Le passage le plus sûr l'emporte.
- **Piétons :**
  - un piéton arrêté se contourne avec 1 m de marge, au pas, et reste surveillé pendant le passage ;
  - un piéton qui marche ou qui traverse : arrêt et attente.
- **Retour :** après l'obstacle, le véhicule ne revient dans sa voie que si elle est libre sur 18 m.

**Tableau de bord.** Il affiche :
- objet détecté, distance et danger ;
- décision, action en cours et trajectoire (dans la voie, décalée, bas-côté, manœuvre) ;
- navigation, nombre de contournements et état de l'anti-blocage ;
- passages évalués, avec la raison de chaque refus.

Dans la scène, un ruban montre la trajectoire visée, aux couleurs du danger, et un anneau entoure chaque danger.

**Quand la voie reste bloquée** (2 s à l'arrêt sans solution), SMART AI cherche une issue, dans cet ordre :
1. **Contourner par la gauche ou par la droite**, si un couloir est libre.
2. **Reculer** quelques mètres si l'obstacle est trop proche pour braquer, puis contourner.
3. **Attendre** si le côté n'est bloqué que par la circulation qui passe en face, jusqu'à 25 s.
4. **Rebrousser chemin :**
   - demi-tour en plusieurs fois si la rue est assez large (7 m entre les murs) ;
   - sinon, marche arrière guidée le long de la voie jusqu'au carrefour précédent.

   La rue bloquée est ensuite évitée pendant 90 s, et la trajectoire en prend une autre.

Deux cas particuliers :
- **Véhicule immobile depuis 20 s** (panne, embouteillage) : il est traité comme un obstacle et se contourne.
- **Piéton immobile devant le véhicule** : il attend souvent que la voiture s'écarte. SMART AI recule de 5 m pour lui laisser le passage, sans jamais le contourner.

Pendant toute manœuvre, des sondes vérifient l'espace devant et derrière (murs, véhicules, piétons). Au-delà de deux demi-tours en deux minutes, SMART AI considère toutes les issues bloquées : elle s'arrête et demande au conducteur de reprendre le volant.

**Nids-de-poule.** Il n'y en avait pas dans le jeu : il y en a désormais quelques-uns sur les rues larges. Ils secouent le véhicule et lui font perdre de la vitesse.

**Cadres de détection.** En mode automatique, chaque objet perçu à moins de 70 m (piéton, moto, voiture, camion, véhicule garé, obstacle, nid-de-poule) est encadré à l'écran : sa boîte 3D est projetée, avec sa classe et sa distance, en couleur selon le danger. Un objet caché par un bâtiment n'est pas encadré.

**Apprentissage par la conduite des joueurs** (`smart-ai/learning.ts`, `partage/savoir.ts`) :
- **Point critique :** là où SMART AI reste bloquée, elle note le lieu, son cap et la cause.
- **Démonstration :** quand un joueur conduit lui-même, ses dernières secondes sont gardées (positions, marche avant ou arrière). S'il traverse un point critique et s'en éloigne de 25 m sans choc, ce morceau de conduite devient une démonstration. Une conduite avec un choc n'est jamais apprise.
- **Rejeu :** bloquée près d'une démonstration orientée dans son sens, SMART AI la rejoue au pas.
  - Les sondes de sécurité restent actives.
  - Si l'avant ou un flanc bute, elle corrige par une petite marche arrière contre-braquée, au plus 4 fois.
- **Verdict :** la démonstration est réussie si le véhicule s'éloigne ensuite de 20 m, ratée s'il rebloque au même endroit. Deux échecs sans réussite l'éliminent ; les meilleures passent en premier.
- **Partage :** le serveur du jeu reçoit, valide, fusionne et enregistre ce savoir (`GET` et `POST /savoir`, fichier `SAVOIR_FICHIER`, fusionné toutes les 30 s entre instances). Chaque joueur en profite au lancement d'une partie en ligne. Hors ligne, le savoir reste dans le navigateur.
- **Données :** des positions dans la ville, rien de personnel.

 Une détection par caméra (YOLO via ONNX Runtime Web, ou OpenCV.js, sur l'image de la caméra du véhicule) se branche comme un capteur de plus (`Sensor`, `EnvironmentDetector.addSensor`). Ses détections, moins sûres, sont fusionnées avec celles de l'état du jeu : l'analyse du risque et la décision ne changent pas.

**Vérifié** (`tests/smart-ai.test.mjs`) :
- dix scénarios : désactivée, piéton immobile puis reprise, piéton qui traverse, moto lente devant, mur, véhicule garé contourné, refus de contourner face à un véhicule qui arrive, nid-de-poule, feu rouge, reprise en main ;
- deux minutes sur la vraie carte de Lomé, depuis deux départs, avec circulation et piétons : aucun choc, environ 0,1 à 0,3 ms de calcul par image, simulation comprise.

**Limites :**
- Les autres joueurs en ligne ne sont pas perçus : ce sont des fantômes, qu'on ne peut pas percuter.
- À quelques endroits de la carte, un angle de bâtiment touche le bord de la voie, ou deux véhicules de la circulation se bloquent face à face. SMART AI y alterne attente et manœuvres, sans choc, mais peut mettre plus d'une minute à se dégager.

## Communication entre joueurs

Tout passe par la connexion WebSocket du jeu, dans la salle du joueur (60 joueurs au plus).

| Fonction | Côté client | Côté serveur |
| --- | --- | --- |
| **Où sont les autres** | `Communication.tsx` : liste des joueurs (distance, direction, « dans un bâtiment »), bouton « Y aller » qui trace l'itinéraire ; `engine.ts` : points de couleur et pseudos sur la mini-carte, flèche au bord pour ceux hors du cadre | message `carte` toutes les 2 s : `[id, pseudo, x, z, dedans]` de toute la salle, au mètre ; dans un bâtiment, la dernière position dehors |
| **Discussion écrite** | touche Y ou bouton bulle ; les derniers messages s'affichent 8 s même discussion fermée ; compteur de non-lus | message `chat` nettoyé (`nettoieMessage`, 200 caractères), un toutes les 0,8 s par joueur, diffusé à la salle ; les 30 derniers envoyés à l'arrivant (`historique`), en mémoire seulement |
| **Messages vocaux** (talkie-walkie) | `voix.ts` : maintenir le bouton micro ou V, relâcher pour envoyer (15 s au plus, Opus 16 kbit/s, environ 2 Ko par seconde) ; lecture automatique l'un après l'autre, bouton pour couper les voix, ▶ pour réécouter | binaire `[3][format][audio]` relayé aux autres joueurs de la salle avec l'id de l'auteur, jamais enregistré ; budget de 120 Ko, rechargé de 2 Ko/s (une minute de parole sur trois) |
| **Ignorer quelqu'un** | depuis la liste : ses messages écrits et vocaux sont filtrés chez soi | — |

**Limites :**
- La voix n'est pas un appel en direct : chaque message part au relâchement du bouton, comme une note vocale. Un appel en continu demanderait WebRTC et un serveur relais (TURN), payant.
- Le micro n'est autorisé par les navigateurs que sur une page https (ou `localhost`) : en ligne sur Render, oui ; sur le réseau local en `http://192.168…`, non.
- Pas de modération automatique : « Ignorer » et la limite de débit sont les seules protections. Avant une ouverture au grand public, prévoir un signalement et un filtre.

## Sécurité du serveur

- **Validation des messages :**
  - taille maximale de 2 Ko par message, 64 Ko pour un message vocal ;
  - format binaire contrôlé ;
  - positions dans les limites du monde, nombres finis ;
  - pseudo nettoyé, de 2 à 20 caractères ;
  - apparence limitée à des couleurs.
- **Débit :** 30 messages par seconde en moyenne et par joueur, avec des rafales de 60 tolérées. Au-delà, les messages sont ignorés, et la connexion est fermée en cas d'abus prolongé.
- **Connexions :**
  - 8 au plus par adresse IP (`CONNEXIONS_PAR_IP`) ;
  - présentation obligatoire dans les 5 secondes ;
  - battement toutes les 15 secondes, une connexion muette pendant 30 secondes est coupée.
- **Origine :** en production, seules les pages du domaine du jeu peuvent se connecter (`ORIGINES`).
- **Joueur lent :** un joueur dont le tampon d'envoi déborde ne reçoit plus d'instantanés. Il est déconnecté au-delà de 2 Mo en attente.
- **Vie privée :** le visage d'Honorable n'est jamais transmis. Les autres joueurs voient un pseudo et une tenue d'étudiant de l'IAI.

## Limites connues

- **Aucune donnée n'est gardée côté serveur :** pas de compte, pas de classement. L'argent et le record restent dans le navigateur du joueur.
- **Triche possible :** le serveur ne vérifie pas la physique, donc un joueur peut tricher sur sa position. C'est sans conséquence tant qu'il n'y a rien à gagner. Le jour où il y aura des scores ou un classement, il faudra une simulation faisant autorité sur le serveur.
- **Visibilité limitée à la salle :** deux joueurs dans des salles ou des instances différentes ne se voient pas. Pour jouer ensemble à coup sûr, il faudra ajouter des salles privées, par exemple avec un code à partager.
- **Pas encore mesuré pour de vrai :** la fluidité sur de vrais téléphones et sur de vrais réseaux mobiles. Les mesures ci-dessus sont des robots sur un même ordinateur.

## Lancer en local

```bash
pnpm install
pnpm jeu:build        # compile le client
pnpm jeu:start        # client sur le port 3004, serveur sur le port 3005
pnpm test:jeu         # tests du jeu, du protocole et du serveur
pnpm jeu:charge 500   # essai de charge : 500 joueurs simulés
```

Développement avec rechargement : `pnpm jeu:dev`.

| Variable du client (à la compilation) | Rôle |
| --- | --- |
| `VITE_SITE_URL` | Adresse du site de la concession, pour les liens « Réserver un vrai essai » |
| `VITE_SERVEUR_URL` | Serveur en ligne, `wss://…/ws` ; `off` pour un jeu seul |

| Variable du serveur | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | 3005 | Port d'écoute |
| `MAX_JOUEURS` | 2000 | Joueurs au plus sur l'instance |
| `CAPACITE_SALLE` | 60 | Joueurs au plus par salle |
| `CONNEXIONS_PAR_IP` | 8 | Connexions simultanées au plus par adresse |
| `ORIGINES` | (toutes) | Domaines autorisés, séparés par des virgules |
| `TRUST_PROXY` | 0 | Nombre de mandataires de confiance (1 derrière Caddy) |

## Mise en production

Le dépôt fournit trois éléments :
- `docker-compose.yml` déclare les services `jeu-client` et `jeu-serveur`, ce dernier en `JEU_INSTANCES` exemplaires ;
- `deploy/Caddyfile` sert le domaine `JEU_DOMAIN` : `/ws` vers les serveurs, le reste vers le client ;
- les deux Dockerfiles sont dans `client/` et `serveur/`.

Le client étant statique, on peut aussi publier `client/dist/` sur un CDN (Cloudflare Pages, S3 avec CloudFront…) et ne garder sur le serveur que `jeu-serveur`.
