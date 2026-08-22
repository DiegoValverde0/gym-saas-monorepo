# Gym Manager - SaaS Monorepo

Este es el monorepositorio para la plataforma Gym Manager, construido con una arquitectura moderna y escalable.

## 🛠️ Tecnologías Principales

- **Gestión de Paquetes:** [pnpm](https://pnpm.io/) y Workspaces.
- **Orquestador:** [Turborepo](https://turbo.build/).
- **Frontend (Vista):** [Next.js](https://nextjs.org/) (React) en `apps/web`.
- **Backend (API/Controlador):** [NestJS](https://nestjs.com/) en `apps/api`.
- **Base de Datos (Modelo):** PostgreSQL gestionado a través de [Prisma ORM](https://www.prisma.io/) en `packages/database`.
- **Caché:** Redis.
- **Infraestructura local:** Docker & Docker Compose.

---

## 🚀 Guía de Instalación Rápida

Sigue estos pasos para levantar el proyecto en tu máquina local.

### 1. Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu sistema:
- **[Node.js](https://nodejs.org/en/)** (Versión 18 o superior).
- **[pnpm](https://pnpm.io/installation)** (Gestor de paquetes). Puedes instalarlo globalmente con: `npm install -g pnpm`.
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Necesario para levantar la base de datos PostgreSQL y Redis fácilmente).
- **Git**.

### 2. Clonar el Repositorio

Abre tu terminal y clona el repositorio:

```bash
git clone <URL_DE_TU_REPOSITORIO>
cd Gym_Manager
```

*(Reemplaza `<URL_DE_TU_REPOSITORIO>` con la URL real de git).*

### 3. Configurar Variables de Entorno

El proyecto necesita variables de entorno para funcionar. Existe un archivo de ejemplo con los valores necesarios para desarrollo local.

1. Duplica el archivo `.env.example`.
2. Renómbralo a `.env`.

En Windows / Linux / Mac, puedes hacerlo desde la terminal:
```bash
cp .env.example .env
```
*No es necesario modificar los valores por defecto si vas a usar Docker Compose para desarrollo local.*

### 4. Levantar la Infraestructura (Base de Datos y Caché)

Utilizaremos Docker Compose para levantar PostgreSQL y Redis en segundo plano.

Ejecuta en la raíz del proyecto:
```bash
docker-compose up -d
```
*Espera un momento a que los contenedores se inicien. Puedes verificar que estén corriendo abriendo Docker Desktop o usando `docker ps`.*

### 5. Instalar Dependencias

Instala todas las dependencias del monorepositorio en la raíz (pnpm se encargará de enlazar todo mágicamente):

```bash
pnpm install
```

### 6. Configurar la Base de Datos (Prisma)

Ahora necesitamos generar el cliente de Prisma y empujar el esquema (crear las tablas) a nuestra base de datos PostgreSQL recién levantada.

Ejecuta los siguientes comandos en orden:

```bash
# 1. Genera el código del cliente de Prisma
pnpm run db:generate

# 2. Crea las tablas en la base de datos PostgreSQL
pnpm run db:push
```

### 7. Iniciar el Entorno de Desarrollo

¡Ya está todo listo! Ahora levantaremos tanto el Frontend como el Backend simultáneamente gracias a Turborepo.

Ejecuta en la raíz:
```bash
pnpm run dev
```

Esto iniciará:
- El servidor backend de **NestJS** (revisa la consola para ver en qué puerto está escuchando, usualmente `http://localhost:3001` o `3000`).
- El servidor frontend de **Next.js** (usualmente disponible en `http://localhost:3000` o `3001`).

---

## 📁 Estructura del Proyecto

- `apps/api`: Aplicación backend (NestJS).
- `apps/web`: Aplicación frontend web (Next.js).
- `packages/database`: Lógica central de acceso a datos (Prisma Schema y cliente).
- `docker-compose.yml`: Define los servicios de PostgreSQL y Redis.

## ❓ Solución de Problemas Comunes

- **Error al conectar a la base de datos:** Asegúrate de que Docker Desktop esté abierto y ejecutándose antes de correr `docker-compose up -d`.
- **Errores de Prisma al arrancar:** Asegúrate de haber ejecutado `pnpm run db:generate` después de cualquier cambio en dependencias o en el archivo `schema.prisma`.
- **La base de datos no carga, falla la conexión o ignora la configuración inicial (Problema del volumen "pgdata"):** 
  Si previamente ejecutaste Docker y se creó un volumen llamado `pgdata`, Docker **reutilizará esos datos antiguos**. Si los usuarios o contraseñas en tu `.env` cambiaron, o si necesitas que se vuelva a ejecutar algún script inicial, Docker fallará silenciosamente o denegará la conexión.
  **Solución:** Debes detener los contenedores y **destruir los volúmenes en caché** para forzar una instalación limpia desde cero. Ejecuta:
  ```bash
  docker-compose down -v
  ```
  Luego, vuelve a levantar la infraestructura con `docker-compose up -d`.
