# Arquitectura y Diseño de Gym Manager SaaS

Este documento describe a detalle la arquitectura, el flujo de datos y las decisiones de diseño del monorepositorio **Gym Manager**. Está pensado como una guía técnica profunda para que cualquier desarrollador pueda entender cómo se comporta el sistema desde la raíz del código hasta la persistencia de datos.

---

## 1. Topología del Monorepositorio (Turborepo)

El proyecto utiliza un enfoque de **Monorepositorio** gestionado por **Turborepo** y **pnpm workspaces**. Esto significa que múltiples aplicaciones y librerías coexisten en el mismo repositorio de Git, compartiendo dependencias y configuraciones.

### Estructura Detallada del Repositorio

A continuación, se detalla para qué sirve cada carpeta y archivo crítico en la raíz del proyecto, y cómo se relacionan entre sí:

#### Archivos de Orquestación y Configuración (Raíz)
*   **`pnpm-workspace.yaml`**: Es el corazón del monorepositorio. Le dice al gestor de paquetes (`pnpm`) qué carpetas (`apps/*`, `packages/*`) forman parte de este ecosistema para que puedan compartir librerías sin descargarlas dos veces.
*   **`turbo.json`**: Es el "cerebro" de la ejecución paralela. Define el pipeline de comandos (ej. `dev`, `build`). Cuando ejecutas `pnpm run dev`, Turborepo lee este archivo y sabe que debe arrancar el Frontend y el Backend al mismo tiempo, manejando cachés para que todo sea ultrarrápido.
*   **`.env`**: Archivo maestro de secretos. Contiene la `DATABASE_URL`, el `JWT_SECRET` y contraseñas de Docker. Es la única fuente de verdad para la seguridad del entorno local.
*   **`docker-compose.yml`**: Define la infraestructura de la base de datos (PostgreSQL) y caché (Redis). Es utilizado exclusivamente para levantar los motores subyacentes sin ensuciar la computadora del desarrollador con instalaciones pesadas.
*   **`Dockerfile`**: Plantilla para empaquetar el código cuando se vaya a subir a Producción (la nube).
*   **`scripts/init-db.sql`**: Un script de arranque que Docker lee la primera vez que se crea la base de datos. Se asegura de instalar extensiones vitales en PostgreSQL como `"uuid-ossp"` (para generar IDs únicos) y `"pgcrypto"` (para encriptación a nivel BD).

#### Aplicaciones (`apps/`)
*   **`apps/api/` (Backend - NestJS)**: Es el servidor y cerebro lógico de la aplicación (El Controlador). Corre en el puerto `3001`. Recibe peticiones HTTP, verifica tokens de seguridad y procesa las reglas del negocio de los gimnasios.
*   **`apps/web/` (Frontend - Next.js)**: Es la interfaz gráfica (La Vista). Corre en el puerto `3000`. Consume el API y renderiza las pantallas (Login, Dashboard) usando React y Tailwind CSS v4.

#### Librerías Compartidas (`packages/`)
*   **`packages/database/` (El Modelo - Prisma)**: Es el puente centralizado de datos. Contiene el archivo `schema.prisma` que define todas las tablas (clientes, membresías, etc.) y el `seed.ts` para inyectar datos de prueba. Tanto el `api` como el `web` importan código de esta carpeta, lo que garantiza que si la base de datos cambia, todo el repositorio se entera instantáneamente.

---

## 2. Paradigma MVC en un Entorno Moderno

En lugar de tener el Modelo, la Vista y el Controlador en una sola carpeta, este proyecto los separa físicamente para mayor escalabilidad:

### La Vista (View) -> `apps/web`
*   **Responsabilidad:** Renderizar la interfaz de usuario (UI). No tiene conexión directa a la base de datos.
*   **Cómo se relaciona:** Se comunica exclusivamente con el Controlador (`apps/api`) a través de peticiones HTTP, enviando tokens JWT en las cabeceras para probar su identidad.

### El Controlador (Controller) -> `apps/api/src/.../*.controller.ts`
*   **Responsabilidad:** Recibir las peticiones HTTP de la Vista, validar los datos (que un correo sea válido, que no falten campos) y enrutar la petición hacia el Servicio.

### La Lógica de Negocio (Service) -> `apps/api/src/.../*.service.ts`
*   **Responsabilidad:** Ejecutar las reglas del negocio.
*   **Cómo se relaciona:** Toma los datos del Controlador, le pide información al Modelo (Prisma), aplica la lógica (ej. crear un cliente) y devuelve la respuesta.

### El Modelo (Model) -> `packages/database`
*   **Responsabilidad:** Definir la estructura SQL y garantizar la integridad de los datos. Es la única capa con permiso para hablar con PostgreSQL.

---

## 3. Arquitectura Multi-Tenant y Seguridad RLS

El sistema es un **SaaS B2B** (Software as a Service Business-to-Business). Esto significa que múltiples gimnasios (Inquilinos/Tenants) usan la misma base de datos, pero sus datos deben estar estrictamente aislados.

### Estrategia de Aislamiento
1.  **En el Schema (`schema.prisma`):** Todas las tablas transaccionales (como `Cliente`, `Membresia`, `Transaccion`) tienen un campo obligatorio `organizacion_id`. Las únicas tablas globales (sin este campo) son `Usuario` y `Permiso`, porque un dueño puede administrar varios gimnasios a la vez.

### Row-Level Security (RLS) Automatizado
Para evitar fugas de datos por errores humanos (ej. olvidar filtrar por gimnasio), se implementó una **Extensión de Prisma (Prisma Client Extension)** inteligente en `apps/api/src/prisma/prisma.service.ts`:

1.  Cuando un usuario envía una petición HTTP, el interceptor `JwtAuthGuard` en NestJS lee el Token y guarda el ID del gimnasio en un hilo de memoria seguro llamado `ClsService` (Context Local Storage).
2.  Si el código ejecuta `this.prisma.cliente.findMany()`, Prisma intercepta la consulta milisegundos antes de ir a PostgreSQL.
3.  Lee el hilo de memoria (`ClsService`), detecta que el usuario pertenece al "Gym Titan" (ID: 123), y **reescribe invisiblemente la consulta** agregando `WHERE organizacion_id = '123'`.
4.  **Resultado:** Aislamiento perfecto. El programador no tiene que preocuparse por filtrar datos; el sistema RLS lo hace de fondo.

---

## 4. Flujo de Ejecución (El Viaje de los Datos)

Para entender cómo se relaciona todo, este es el viaje paso a paso cuando un gimnasio pide su lista de clientes:

1.  **Interacción (`apps/web`):** El usuario entra al Dashboard en `localhost:3000`. React dispara `fetch('http://localhost:3001/clientes')` adjuntando el JWT.
2.  **Validación y Contexto (`apps/api`):** NestJS recibe la petición en `localhost:3001`. El `JwtAuthGuard` valida el token criptográficamente y mete el `organizacion_id` en la memoria del hilo (`ClsService`).
3.  **Enrutamiento:** `ClientesController` recibe la orden y llama al `ClientesService`.
4.  **Invocación del Modelo:** El servicio llama a `this.prisma.extendedClient.cliente.findMany()`.
5.  **Magia RLS (`packages/database` & PrismaService):** La extensión de Prisma intercepta, inyecta `organizacion_id` a la consulta, y dispara el SQL hacia PostgreSQL (conectándose al contenedor Docker en el puerto `5433` usando el `.env`).
6.  **Retorno:** Los datos viajan de vuelta por toda la cadena hasta llegar a React, que los dibuja en la pantalla con los estilos de Tailwind CSS.
