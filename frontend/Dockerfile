# À construire depuis la racine : docker build -f frontend/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY jeu/client/package.json jeu/client/
COPY jeu/serveur/package.json jeu/serveur/
RUN pnpm install --frozen-lockfile --filter frontend
COPY frontend frontend
# Ces deux valeurs sont figées dans l'image à la compilation.
ARG API_INTERNAL_URL=http://backend:3001
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_JEU_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_JEU_URL=$NEXT_PUBLIC_JEU_URL NEXT_OUTPUT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter frontend build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
