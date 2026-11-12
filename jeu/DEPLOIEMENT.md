# Mettre le jeu en ligne gratuitement

Le jeu se déploie en deux morceaux, tous deux gratuits sur [Render](https://render.com) :

| Morceau | Dossier | Service Render | Rôle |
| --- | --- | --- | --- |
| Le jeu | `jeu/client` (compilé dans `jeu/client/dist`) | site statique `lome-jeu` | ce que le joueur ouvre dans son navigateur |
| Le serveur du jeu | `jeu/serveur` (avec `jeu/partage`) | service web Docker `lome-jeu-serveur` | jeu en ligne (WebSocket `/ws`) et savoir partagé de SMART AI (`/savoir`) |

Le fichier `render.yaml`, à la racine du dépôt, décrit les deux services : Render les crée et les relie tout seul.

## Étapes

**1. Pousser le dépôt sur GitHub.** Le commit existe sur votre ordinateur ; il reste à l'envoyer :

```bash
git push origin main
```

Render lit le code sur GitHub. Le dépôt est public, mais votre photo et le savoir appris restent exclus (`.gitignore`).

**2. Créer un compte Render**, gratuit, en vous connectant avec GitHub : https://dashboard.render.com.

**3. Créer les deux services d'un coup** : **New → Blueprint**, puis choisissez le dépôt `Honorable45/changan` et validez.

Render lit `render.yaml` et construit :
- `lome-jeu-serveur`, à partir de `jeu/serveur/Dockerfile` (quelques minutes) ;
- puis `lome-jeu`, compilé avec l'adresse du serveur.

Il demande une seule valeur, `VITE_SITE_URL` : l'adresse du site de la concession s'il est en ligne, sinon laissez-la vide.

**4. Ouvrir le jeu.** L'adresse est affichée sur la page du service `lome-jeu`, du type `https://lome-jeu.onrender.com`. Pour vérifier :

| Où | Ce que vous devez voir |
| --- | --- |
| `https://lome-jeu-serveur.onrender.com/sante` | `{"ok":true,…}` |
| Le jeu, « Jouer en ligne » coché | la pastille verte « 1 en ligne » |
| Deux navigateurs | chacun voit l'autre joueur |
| Conduite libre, bouton SMART AI | la voiture roule seule, avec ses cadres de détection |

**5. Mises à jour.** Chaque `git push` sur `main` redéploie automatiquement les deux services.

## Changer l'adresse du serveur sans recompiler

Le jeu lit, au démarrage, un fichier `config.json` posé à côté de lui :

```json
{ "serveur": "wss://lome-jeu-serveur.onrender.com/ws", "site": "https://changan-togo.tg" }
```

Vide (`{}`), il garde les adresses données à la compilation. `"serveur": "off"` fait un jeu seul, sans serveur.

## Autre hébergeur pour le jeu (Netlify, Cloudflare Pages)

Le jeu compilé est un simple dossier de fichiers :
1. Compilez-le : `pnpm --filter jeu-client build`.
2. Écrivez l'adresse du serveur dans `jeu/client/dist/config.json`.
3. Déposez le dossier `jeu/client/dist` sur https://app.netlify.com/drop (glisser-déposer) ou sur Cloudflare Pages.

Le visage d'Honorable n'est jamais dans `dist` : la compilation le retire (vérifié par un test). Les en-têtes de sécurité, eux, ne sont pas dans `dist` : sur Netlify ou Cloudflare Pages, recopiez ceux de `render.yaml` dans leur fichier `_headers`.

Le serveur reste sur Render.

## Limites des offres gratuites

- **Mise en veille du serveur :** il s'endort après 15 minutes sans joueur. La première connexion qui suit le réveille, en 30 à 60 secondes : le jeu affiche « Connexion… », puis le mode en ligne arrive tout seul. Le jeu reste jouable seul pendant ce temps.
- **Savoir de SMART AI non conservé :** sur l'offre gratuite, ce qui a été appris des joueurs est perdu à chaque redémarrage ou redéploiement du serveur, faute de disque permanent. Chaque navigateur garde toutefois son propre savoir, qui est renvoyé au serveur à la prochaine partie. Pour un savoir permanent, il faut un disque payant Render (`SAVOIR_FICHIER=/data/savoir.json`) ou un VPS (voir `docs/deploiement.md`).
- **Capacité :** une instance gratuite est petite. Elle convient pour une démonstration et quelques dizaines de joueurs simultanés. Pour des milliers de joueurs, voir `jeu/ARCHITECTURE.md` et un serveur payant.
- **Visage d'Honorable :** absent du dépôt public et retiré de chaque compilation, donc jamais en ligne. Honorable y garde le visage du modèle 3D.
- **Micro :** « Parler » ne fonctionne qu'en https, ce qui est le cas sur Render.

## Ce qui a été vérifié, et ce qui ne l'a pas été

- **Vérifié sur la machine de développement :**
  - l'image Docker du serveur se construit et répond (`/sante`, `/savoir`) ;
  - le jeu compilé fonctionne, et ses 46 tests passent.
- **Non vérifié :**
  - `render.yaml` n'a pas pu être essayé sans compte Render : si Render signale une erreur à l'étape 3, le message dira quel champ corriger ;
  - aucune mise en ligne réelle n'a encore eu lieu.
