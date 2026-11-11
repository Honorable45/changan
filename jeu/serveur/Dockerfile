# Serveur du jeu en ligne. À construire depuis la racine : docker build -f jeu/serveur/Dockerfile .
# Node 24 exécute le TypeScript directement : pas d'étape de compilation.
FROM node:24-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY jeu/client/package.json jeu/client/
COPY jeu/serveur/package.json jeu/serveur/
RUN pnpm install --frozen-lockfile --prod --filter jeu-serveur
COPY jeu/partage jeu/partage
COPY jeu/serveur/src jeu/serveur/src
ENV NODE_ENV=production PORT=3005 TRUST_PROXY=1 SAVOIR_FICHIER=/data/savoir.json
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3005
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3005/sante').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Arrêt propre : le serveur prévient les joueurs, qui se reconnectent sur une autre instance.
STOPSIGNAL SIGTERM
CMD ["node", "jeu/serveur/src/index.ts"]
