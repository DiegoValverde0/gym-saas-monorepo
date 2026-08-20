FROM node:18-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app

FROM base AS dev
# Entorno de desarrollo montando volúmenes
EXPOSE 3000 3001

FROM base AS builder
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runner
# Aquí se configuraría la ejecución en producción dependiendo si es web o api.
