# À construire depuis la racine : docker build -f admin/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY jeu/client/package.json jeu/client/
COPY jeu/serveur/package.json jeu/serveur/
RUN pnpm install --frozen-lockfile --filter admin
COPY admin admin
# Ces deux valeurs sont figées dans l'image à la compilation.
ARG API_INTERNAL_URL=http://backend:3001
ARG NEXT_PUBLIC_SITE_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_OUTPUT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter admin build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3002 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/admin/.next/static admin/.next/static
COPY --from=build --chown=node:node /app/admin/public admin/public
USER node
EXPOSE 3002
CMD ["node", "admin/server.js"]
