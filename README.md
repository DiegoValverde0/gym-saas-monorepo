# Gym Manager

Monorepo con la API (`apps/api`, NestJS), la web (`apps/web`, Next.js) y la base de datos (`packages/database`, Prisma + PostgreSQL).

## Instalación desde cero

```bash
cp .env.example .env          # completar las variables
docker-compose up -d db redis # PostgreSQL en :5433 y Redis en :6380
pnpm install
pnpm db:reset                 # crea todas las tablas y carga los datos iniciales
pnpm dev                      # API en :3001 y web en :3000
```

`pnpm db:reset` **BORRA TODA LA BASE** y la deja como nueva: aplica las migraciones (`prisma/migrations`) y carga los datos de prueba (`prisma/seed.ts`: permisos, los 5 roles base, el superadmin y el gimnasio de ejemplo Gym Titan, con su dueño, una recepcionista, una caja, la cuenta "Efectivo del gimnasio", un plan y un cliente con su membresía activa ya cobrada). Las cuentas y claves de prueba están en `packages/database/prisma/cuentas-prueba.ts`. Por seguridad, `db:reset` y el seed solo corren contra una base de esta computadora (nunca con `NODE_ENV=production`): ver `prisma/solo-pruebas.ts`.

## Cambios en el esquema

La base se maneja con migraciones de Prisma (`packages/database/prisma/migrations`). Después de cambiar `schema.prisma`:

```bash
pnpm db:migrate --name descripcion-corta   # crea la migración y la aplica en tu base local
```

Sube la carpeta nueva de `migrations/` junto con el cambio: en producción se aplica sola al desplegar.

- `pnpm db:deploy`: aplica las migraciones pendientes sin borrar datos (lo que corre en producción).
- `pnpm db:inicial`: carga permisos y roles base y crea el superadmin si no existe (no toca datos de gimnasios).
- `pnpm db:reset`: empezar de cero en local.

## Producción

Un servidor con Docker: `docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build` levanta la base, Redis, la API, la web, HTTPS automático y respaldos diarios. Los pasos completos están en [docs/despliegue.md](docs/despliegue.md).

## Pruebas

```bash
pnpm test        # pruebas de la API y la web (Vitest, sin base de datos)
```

Las pruebas van junto al código (`*.spec.ts` en la API, `*.test.ts` en la web). En cada cambio a `main` y en cada pull request, GitHub Actions (`.github/workflows/ci.yml`) revisa tipos, lint y pruebas.
