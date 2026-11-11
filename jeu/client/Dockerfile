# Client du jeu : compilé par Vite, servi par Caddy. À construire depuis la racine : docker build -f jeu/client/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY jeu/client/package.json jeu/client/
COPY jeu/serveur/package.json jeu/serveur/
RUN pnpm install --frozen-lockfile --filter jeu-client
COPY jeu/partage jeu/partage
COPY jeu/client jeu/client
# Adresses figées à la compilation : site de la concession et serveur du jeu (wss://…/ws).
ARG VITE_SITE_URL
ARG VITE_SERVEUR_URL
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_SERVEUR_URL=$VITE_SERVEUR_URL
RUN pnpm --filter jeu-client build

FROM docker.io/library/caddy:2-alpine
COPY jeu/client/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/jeu/client/dist /srv
EXPOSE 80
