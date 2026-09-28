# syntax=docker/dockerfile:1
# Imágenes de la API y la web. En producción se usan con docker-compose.prod.yml
# (ver docs/despliegue.md); el target "dev" lo usa docker-compose.yml.

FROM node:24-alpine AS base
# Prisma necesita OpenSSL para elegir y usar sus motores.
RUN apk add --no-cache openssl
RUN npm install -g pnpm@9.0.0
WORKDIR /usr/src/app

# ---------------------------------------------------------------------------
# Desarrollo: el código se monta como volumen (docker-compose.yml).
FROM base AS dev
EXPOSE 3000 3001

# ---------------------------------------------------------------------------
# Compilación de todo el monorepo.
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @repo/database exec prisma generate
# La web llama a la API en el mismo dominio (Caddy manda /api/* a la API), así
# la imagen sirve para cualquier dominio y la cookie de sesión es del mismo sitio.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter api build && pnpm --filter web build

# ---------------------------------------------------------------------------
# API. También corre las migraciones y la carga inicial (servicio "migrar").
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/apps/api
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------
# Web: servidor mínimo de Next (output: 'standalone').
FROM node:24-alpine AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /usr/src/app
COPY --from=build --chown=node:node /usr/src/app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /usr/src/app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
