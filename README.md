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

`pnpm db:reset` **BORRA TODA LA BASE** y la deja como nueva: estructura, restricciones (`prisma/constraints.sql`) y datos iniciales (`prisma/seed.ts`: permisos, los 5 roles base, el superadmin y el gimnasio de ejemplo Gym Titan, con su dueño, una recepcionista, una caja, la cuenta "Efectivo del gimnasio", un plan y un cliente con su membresía activa ya cobrada). Las cuentas y claves de prueba están en `seed.ts`.

## Cambios en el esquema

El proyecto no usa migraciones. Después de cambiar `packages/database/prisma/schema.prisma`:

- `pnpm db:push`: aplica el esquema sin borrar datos.
- `pnpm db:reset`: si prefieres empezar de cero.
