# Guide de déploiement

Mettre en ligne, sur un serveur, le site CHANGAN Togo, son administration et le jeu « Lomé en jeu », avec son mode en ligne et SMART AI. Tout tourne avec Docker Compose. Seul Caddy est exposé à Internet, et il obtient lui-même les certificats HTTPS.

| Service | Rôle | Exposé |
| --- | --- | --- |
| `caddy` | HTTPS, renvoie chaque domaine vers la bonne application | ports 80 et 443 |
| `frontend` | Site public | non |
| `admin` | Administration | non |
| `backend` | API | non |
| `migrate` | Applique les migrations de la base à chaque démarrage, puis s'arrête | non |
| `db` | PostgreSQL 16 | non |
| `jeu-client` | Le jeu : fichiers statiques précompressés | non |
| `jeu-serveur` | Jeu en ligne et savoir partagé de SMART AI, en `JEU_INSTANCES` exemplaires | non |

Pour les détails techniques du jeu (montée en charge, sécurité, SMART AI), voir [jeu/ARCHITECTURE.md](../jeu/ARCHITECTURE.md).

## 1. Ce qu'il faut avant de commencer

- **Un serveur Linux** (VPS) avec un accès SSH, Ubuntu 24.04 par exemple.
  - Pour démarrer : 2 processeurs, 4 Go de mémoire et 40 Go de disque.
  - Pour des milliers de joueurs en ligne : 4 processeurs et 8 Go de mémoire.
- **Un nom de domaine**, avec trois adresses qui pointent vers l'adresse IP du serveur (enregistrements DNS de type A) :

  | Adresse | Pour |
  | --- | --- |
  | `changan-togo.tg` | le site |
  | `admin.changan-togo.tg` | l'administration |
  | `jeu.changan-togo.tg` | le jeu |

- **Les ports 80 et 443 ouverts** dans le pare-feu du serveur : Caddy en a besoin pour obtenir les certificats.
- **Facultatif :**
  - un compte SMTP, pour l'envoi des courriels de réinitialisation du mot de passe ;
  - un stockage S3, pour les photos.

## 2. Préparer le serveur

```bash
# Docker et Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se déconnecter et se reconnecter

# Pare-feu : SSH, HTTP, HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 3. Récupérer le projet

```bash
git clone https://github.com/Honorable45/changan.git
cd changan
```

Deux fichiers ne sont pas dans le dépôt, volontairement. Copiez-les à la main depuis votre ordinateur si vous les voulez en ligne :
- le visage d'Honorable, `jeu/client/public/game/humains/visage-honorable.png` (photo personnelle). Sans lui, Honorable garde le visage du modèle 3D :

  ```bash
  scp jeu/client/public/game/humains/visage-honorable.png utilisateur@serveur:changan/jeu/client/public/game/humains/
  ```

- le savoir de SMART AI déjà appris sur votre machine, `jeu/serveur/savoir.json`. En ligne, il repart de zéro et s'enrichit avec les joueurs.

## 4. Remplir la configuration

```bash
cp .env.production.example .env.production
nano .env.production
```

| Variable | Valeur |
| --- | --- |
| `SITE_DOMAIN` | `changan-togo.tg` (sans https://) |
| `ADMIN_DOMAIN` | `admin.changan-togo.tg` |
| `JEU_DOMAIN` | `jeu.changan-togo.tg` |
| `POSTGRES_PASSWORD` | un long mot de passe, lettres et chiffres uniquement |
| `SMTP_URL`, `SMTP_FROM` | facultatif, pour les courriels |
| `S3_*` | facultatif ; vide, les photos vont dans le volume Docker `media` |
| `JEU_INSTANCES` | nombre d'instances du serveur de jeu : 2 pour commencer |
| `JEU_MAX_JOUEURS` | joueurs par instance : 1500 |
| `JEU_CAPACITE_SALLE` | joueurs par salle de jeu : 60 |

Ne versionnez jamais ce fichier : il contient des secrets, et le dépôt est public.

## 5. Lancer

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

- **Première construction :** elle prend de 10 à 20 minutes. Caddy obtient les certificats HTTPS dans la minute qui suit le démarrage.
- **Si une image échoue :** les messages s'affichent dans le terminal. Relancez la même commande une fois le problème corrigé.

Ensuite, créez le compte administrateur :

```bash
docker compose --env-file .env.production exec \
  -e ADMIN_EMAIL=vous@exemple.tg -e ADMIN_PASSWORD='12 caractères minimum' \
  backend node_modules/.bin/tsx scripts/admin-create.ts
```

Pour une démonstration seulement, chargez les véhicules d'exemple :

```bash
docker compose --env-file .env.production exec backend node_modules/.bin/tsx prisma/seed.ts
```

## 6. Vérifier

| Vérification | Résultat attendu |
| --- | --- |
| `https://changan-togo.tg` | le site, avec un cadenas HTTPS |
| `https://changan-togo.tg/essai-virtuel`, bouton « Lancer le jeu » | ouvre `https://jeu.changan-togo.tg` |
| `https://admin.changan-togo.tg` | la page de connexion de l'administration |
| `https://jeu.changan-togo.tg/sante` | `{"ok":true,…}` |
| Dans le jeu, « Jouer en ligne » coché | la pastille verte « 1 en ligne » s'affiche |
| Deux navigateurs dans Lomé | chacun voit l'autre joueur |
| Conduite libre, bouton SMART AI | la voiture roule seule, les cadres apparaissent autour des piétons et objets |

En cas de souci, lisez les journaux du service concerné :

```bash
docker compose --env-file .env.production logs -f caddy
docker compose --env-file .env.production logs -f jeu-serveur
```

## 7. Mettre à jour

```bash
git pull
docker compose --env-file .env.production up -d --build
```

- **Joueurs en ligne :** chaque instance du jeu les prévient avant de s'arrêter, et ils se reconnectent d'eux-mêmes à une autre.
- **Changement de domaine :** changer `SITE_DOMAIN` ou `JEU_DOMAIN` impose de reconstruire les images, car les adresses y sont figées à la compilation. Relancez la commande ci-dessus.

## 8. Sauvegarder

Trois éléments sont à sauvegarder chaque jour, hors du serveur :

```bash
P=$(basename "$PWD" | tr -cd 'a-z0-9_-')
# La base : véhicules, contenus, demandes
docker compose --env-file .env.production exec -T db pg_dump -U changan changan | gzip > changan-$(date +%F).sql.gz
# Les photos (si S3 n'est pas utilisé)
docker run --rm -v "${P}_media:/m:ro" -v "$PWD:/out" alpine tar czf /out/medias-$(date +%F).tgz -C /m .
# Le savoir de SMART AI appris des joueurs
docker run --rm -v "${P}_savoir:/s:ro" -v "$PWD:/out" alpine cp /s/savoir.json /out/savoir-$(date +%F).json
```

Pour l'automatiser, placez ces lignes dans un script lancé chaque nuit par `cron`, puis copiez les fichiers produits ailleurs (autre serveur, stockage en ligne).

## 9. Accueillir plus de joueurs

**Ajouter des instances.** Une instance du serveur de jeu tient environ 1 500 joueurs, d'après un essai de charge sur la machine de développement. Pour plus de joueurs, augmentez `JEU_INSTANCES` puis relancez :

```bash
docker compose --env-file .env.production up -d
```

Caddy découvre les nouvelles instances en 10 secondes et envoie chaque nouveau joueur à la moins chargée.

**Ordres de grandeur** (estimés d'après cet essai, pas mesurés à cette échelle) :

| Joueurs simultanés | Instances | Serveur |
| --- | --- | --- |
| jusqu'à 2 000 | 2 | 2 processeurs, 4 Go |
| 5 000 | 4 | 4 processeurs, 8 Go |
| 10 000 | 8 | deux serveurs de 4 processeurs, ou un de 8 |

**Mesurer sur le vrai serveur :**

```bash
pnpm jeu:charge 1000 30 wss://jeu.changan-togo.tg/ws
```

**Alléger le serveur.** Le client du jeu est fait de fichiers statiques. On peut publier `jeu/client/dist/` sur un CDN (Cloudflare Pages, par exemple) et ne garder sur le serveur que `jeu-serveur`. Compilez alors le client avec :
- `VITE_SERVEUR_URL=wss://jeu.changan-togo.tg/ws` ;
- `VITE_SITE_URL=https://changan-togo.tg`.

## 10. Avant l'ouverture au public

- **Contenus :** après validation par CHANGAN Togo, renseignez les coordonnées, décochez « Mode démonstration » dans l'administration et supprimez les véhicules de démonstration. Voir [a-confirmer.md](a-confirmer.md).
- **Marques et images :** obtenez l'accord de CHANGAN pour l'usage de la marque et des photos, et celui des personnes dont le visage ou le nom apparaissent dans le jeu.
- **Secrets :** vérifiez que `.env.production` n'est jamais versionné (`git status` ne doit pas le montrer).

## Ce qui a été vérifié, et ce qui ne l'a pas été

- **Vérifié sur la machine de développement :**
  - la configuration Caddy est valide ;
  - l'image du serveur de jeu se construit et répond (`/sante`, `/savoir`) ;
  - tous les services tournent hors Docker et les 41 tests du jeu passent.
- **Non vérifié :**
  - les images du site, de l'administration, de l'API et du client du jeu n'ont pas été construites ici, faute de place sur le disque ; la première mise en ligne les construira, et il faut en surveiller la sortie ;
  - aucune mise en ligne réelle n'a encore eu lieu : nom de domaine, certificats et réseau sont à vérifier lors de la première, avec la liste de la partie 6.
