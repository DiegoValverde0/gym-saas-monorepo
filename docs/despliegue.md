# Despliegue en un servidor (VPS) con Docker

Todo corre con un solo comando de Docker Compose (`docker-compose.prod.yml`):

| Servicio    | Qué hace |
|-------------|----------|
| `db`        | PostgreSQL 15. Sin puerto público; los datos quedan en el volumen `pgdata`. |
| `redis`     | Redis 7 (sesiones de caja y caché). |
| `migrar`    | Aplica las migraciones pendientes y la carga inicial (permisos, roles y el superadmin si no existe). Corre en cada despliegue y termina. |
| `api`       | La API (NestJS). Arranca solo si `migrar` terminó bien. |
| `web`       | La web (Next.js). |
| `caddy`     | Entrada única por los puertos 80 y 443 con HTTPS automático (Let's Encrypt). `https://DOMINIO/api/...` va a la API y lo demás a la web. |
| `respaldos` | Un `pg_dump` al arrancar y cada 24 horas en la carpeta `./respaldos`; borra los de más de `DIAS_RESPALDO` días. |

## Requisitos

- Un servidor Linux (Ubuntu 22.04/24.04 o similar) con al menos **2 GB de RAM** (la compilación de la web usa bastante memoria; con 1 GB agrega swap).
- Un dominio o subdominio con un registro **A** apuntando a la IP del servidor.
- Los puertos 80 y 443 abiertos en el firewall.

## Primera instalación

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Código
git clone https://github.com/DiegoValverde0/gym-saas-monorepo.git gym
cd gym

# 3. Configuración (completar cada valor)
cp .env.produccion.example .env.produccion
nano .env.produccion

# 4. Levantar todo
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build
```

En unos minutos la aplicación está en `https://DOMINIO`. Entra con `SUPERADMIN_CORREO` y `SUPERADMIN_CONTRASENA` y crea el primer gimnasio desde el panel de la plataforma. Esas dos variables solo se usan la primera vez; después puedes borrarlas del archivo.

Para ahorrar escribir, puedes crear un alias en el servidor:

```bash
echo "alias gym='docker compose -f docker-compose.prod.yml --env-file .env.produccion'" >> ~/.bashrc && source ~/.bashrc
```

Con eso, los comandos de abajo quedan como `gym ps`, `gym logs -f api`, etc.

## Actualizar a una versión nueva

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build
```

`migrar` vuelve a correr y aplica solo las migraciones nuevas; los datos no se tocan. Antes de actualizar conviene hacer un respaldo manual (ver abajo).

## Ver el estado y los registros

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion ps
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs migrar respaldos
```

## Respaldos

Los respaldos diarios quedan en `./respaldos/gym-AAAA-MM-DD_HHMM.dump`. Cópialos también fuera del servidor de vez en cuando (por ejemplo con `scp`), porque si se pierde el servidor se pierden con él.

Respaldo manual en cualquier momento:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion restart respaldos
```

### Restaurar un respaldo

**Reemplaza todos los datos actuales** por los del respaldo:

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.produccion"
$C stop api web
$C exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < respaldos/gym-2026-09-27_0300.dump
$C start api web
```

## Cambiar el esquema de la base

En desarrollo, después de cambiar `schema.prisma`, crea la migración con `pnpm db:migrate --name descripcion-corta` y súbela al repositorio. Al desplegar, `migrar` la aplica sola. Nunca se edita una migración que ya está en producción: se crea otra nueva.
