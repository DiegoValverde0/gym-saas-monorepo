# Arquitectura y Diseño de Gym Manager SaaS

Este documento describe a detalle la arquitectura, el flujo de datos y las decisiones de diseño del monorepositorio **Gym Manager**. Está pensado como una guía técnica profunda para que cualquier desarrollador (desde un Junior o Pasante hasta un Arquitecto) pueda entender cómo se comporta el sistema, desde la raíz del código hasta la persistencia de datos y las medidas de seguridad Multi-Tenant.

---

## 1. Topología del Monorepositorio (Turborepo)

El proyecto utiliza un enfoque de **Monorepositorio** gestionado por **Turborepo** y **pnpm workspaces**. Esto significa que múltiples aplicaciones y librerías coexisten en el mismo repositorio de Git, compartiendo dependencias y configuraciones de forma centralizada.

### Estructura Detallada del Repositorio

A continuación, se detalla para qué sirve cada carpeta y archivo crítico en la raíz del proyecto, y cómo se relacionan entre sí:

#### Archivos de Orquestación y Configuración (Raíz)
*   **`pnpm-workspace.yaml`**: Es el corazón del monorepositorio. Le dice al gestor de paquetes (`pnpm`) qué carpetas (`apps/*`, `packages/*`) forman parte de este ecosistema para que puedan compartir librerías sin descargarlas dos veces.
*   **`turbo.json`**: Es el "cerebro" de la ejecución paralela. Define el pipeline de comandos (ej. `dev`, `build`). Cuando ejecutas `pnpm run dev`, Turborepo lee este archivo y sabe que debe arrancar el Frontend y el Backend al mismo tiempo, manejando cachés para que todo sea ultrarrápido.
*   **`.env`**: Archivo maestro de secretos. Contiene la `DATABASE_URL` y variables sensibles de infraestructura. Es la única fuente de verdad para la configuración de seguridad. No se sube al control de versiones.
*   **`docker-compose.yml`**: Define la infraestructura de bases de datos de desarrollo (PostgreSQL y Redis). Evita instalaciones complejas en la computadora del desarrollador.

#### Aplicaciones (`apps/`)
*   **`apps/api/` (Backend - NestJS)**: Es el servidor y cerebro lógico de la aplicación (El Controlador central). Corre en el puerto `3001`. Recibe peticiones HTTP, verifica tokens de seguridad (JWT) y procesa las complejas reglas de negocio B2B.
*   **`apps/web/` (Frontend - Next.js)**: Es la interfaz gráfica Independiente (La Vista). Corre en el puerto `3000`. Se comunica con el API mediante REST y maneja la autenticación del lado del cliente.

#### Librerías Compartidas (`packages/`)
*   **`packages/database/` (El Modelo Global - Prisma)**: Es el puente centralizado de acceso a datos. Contiene `schema.prisma` que define todas las tablas (Modelos) relacionales. Además, hospeda el script `seed.ts` para inyectar datos de prueba seguros. Al ser un "paquete", garantiza que tanto `api` como `web` entiendan la base de datos de manera uniforme y con tipos de TypeScript auto-generados.

---

## 2. Paradigma MVC y Singleton en el Backend

El sistema descarta arquitecturas monolíticas en favor de una separación física y lógica utilizando patrones empresariales modernos (MVC, Singleton y Repositorio):

### La Vista (View) -> `apps/web`
*   **Responsabilidad:** Renderizar la interfaz de usuario. Completamente desacoplada y ajena al SQL.
*   **Conexión:** Se conecta vía HTTP Bearer Tokens (JWT).

### El Controlador (Controller) -> `apps/api/src/.../*.controller.ts`
*   **Responsabilidad:** Definir los *endpoints* REST. Recibe las peticiones de la Vista y las enruta a la lógica interna.
*   **Ejemplo:** `AuthController` recibe credenciales y delega la validación criptográfica al servicio.

### La Lógica de Negocio (Service) -> `apps/api/src/.../*.service.ts`
*   **Responsabilidad:** Ejecutar las reglas operativas del negocio (ej. validaciones de pago, creación de dueños).
*   **Patrón Singleton & Inyección de Dependencias (DI):** En NestJS, los servicios se inyectan mediante constructores (`constructor(private prisma: PrismaService)`). Instancian una sola vez en la vida del servidor, optimizando drásticamente el uso de memoria (Singleton).

### El Modelo y Patrón Repositorio -> `PrismaService` y `packages/database`
*   **Responsabilidad:** El `PrismaClient` actúa como nuestro Patrón Repositorio universal. Toda consulta (INSERT, SELECT) de los servicios debe pasar por el `PrismaService` inyectado, nunca por instanciaciones crudas. Esto garantiza conexión segura y Pooling.

---

## 3. Arquitectura Multi-Tenant (Multi-inquilino) y RLS

El sistema es un **SaaS B2B** (Software as a Service Business-to-Business). Múltiples gimnasios usan la misma base de datos física, pero sus datos deben estar lógica y matemáticamente aislados.

### Estrategia de Aislamiento Estructural
1.  **En el Schema (`schema.prisma`):** Todas las tablas operativas (como `Cliente`, `Membresia`) poseen obligatoriamente un campo `organizacion_id`. Las únicas tablas globales son el login (`Usuario`) para permitir a un dueño administrar múltiples gimnasios sin tener múltiples cuentas.

### Row-Level Security (RLS) basado en Software (Prisma Extensions)
Para evitar que un programador junior olvide colocar un `WHERE organizacion_id = X` filtrando datos (generando fugas masivas), la arquitectura implementa RLS centralizado a nivel ORM:

1.  **Captura de Identidad:** Cuando un usuario autorizado hace una petición, el `JwtAuthGuard` valida el Token, y extrae la organización a la que pertenece guardándola en memoria de ejecución (`nestjs-cls` / Context Local Storage).
2.  **Proxy Dinámico (PrismaService Cacheado):** En `PrismaService`, existe una propiedad `extendedClient`. Al llamarse, utiliza la API de extensiones de Prisma (`$extends`) que intercepta **todas** las consultas de la aplicación.
3.  **Inyección Invisible:** Antes de que la consulta viaje a PostgreSQL, la extensión lee el Context Local Storage. Si el usuario pertenece al "Gym Titan" (ID: 1), la extensión le inyecta invisiblemente un `WHERE organizacion_id = 1` a los SELECT/UPDATE y un `organizacion_id: 1` a los INSERT.
4.  **Resultado de Seguridad:** El programador de Servicios simplemente ejecuta `this.prisma.extendedClient.cliente.findMany()`. El sistema confina los resultados de forma infalible, eliminando el riesgo de exposición de datos entre inquilinos cruzados.

---

## 4. Flujo de Ejecución B2B (El Viaje de los Datos)

El flujo típico (ej. consultar los clientes del gimnasio actual) es el siguiente:

1.  **Disparo:** Desde `localhost:3000` (Next.js), el usuario hace clic en "Clientes". Se dispara un `fetch('http://localhost:3001/clientes')` adjuntando el JWT en el Header.
2.  **Aduana de Seguridad:** En `localhost:3001` (NestJS), la petición choca con el `JwtAuthGuard`. El guardia verifica que el Token no esté hackeado ni expirado, lo desencripta y mete el ID del usuario y su organización en el CLS (`Context Local Storage`).
3.  **Enrutamiento MVC:** El guardia aprueba el paso. `ClientesController` recibe la petición y se la delega a `ClientesService` usando inyección de dependencias.
4.  **Capa de Repositorio:** `ClientesService` pide `this.prisma.extendedClient.cliente.findMany()`.
5.  **Capa de RLS:** La extensión de Prisma atrapa la orden, inyecta los filtros de Soft-Delete (`deleted_at: null`) y Multi-Tenant (`organizacion_id: X`), y ejecuta el SQL limpio en la base de datos PostgreSQL (Vía puerto TCP 5433 local).
6.  **Retorno de Vista:** Los datos regresan por las mismas capas (Prisma -> Servicio -> Controlador -> JSON -> Interfaz Web) aislando de forma impecable las responsabilidades.
