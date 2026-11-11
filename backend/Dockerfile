# À construire depuis la racine : docker build -f backend/Dockerfile .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY jeu/client/package.json jeu/client/
COPY jeu/serveur/package.json jeu/serveur/
# Prisma et tsx restent dans l'image : migrations, données de démonstration et création du compte s'y exécutent.
RUN pnpm install --frozen-lockfile --filter backend
COPY backend backend
RUN pnpm --filter backend exec prisma generate && pnpm --filter backend build
RUN mkdir -p /data/media && chown -R node:node /data
WORKDIR /app/backend
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 STORAGE_DIR=/data/media
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
