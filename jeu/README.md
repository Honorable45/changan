# Lomé en jeu

Le jeu en 3D de CHANGAN Togo, à part du site : la Nevo Q05 et d'autres véhicules dans le quartier administratif de Lomé, Honorable à pied, l'IAI-Togo, le supermarché Le Champion, l'hélicoptère, et les autres joueurs en ligne.

- `client/` : le jeu dans le navigateur (port 3004 en local).
- `serveur/` : le serveur en ligne (port 3005 en local).
- `partage/` : le protocole réseau commun.
- `tests/` : les tests.

Architecture, montée en charge, sécurité et limites : [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
pnpm jeu:build && pnpm jeu:start   # puis http://localhost:3004
pnpm test:jeu
```
