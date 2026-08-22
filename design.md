# Presentación: Arquitectura y Diseño de Gym Manager SaaS
*Instrucciones para la IA de presentaciones: Utiliza la siguiente estructura para generar diapositivas claras, modernas y técnicas. Usa iconos minimalistas y diagramas conceptuales donde sea posible.*

---

## Slide 1: Título
**Título:** Gym Manager SaaS
**Subtítulo:** Arquitectura Empresarial, Multi-Tenancy y Diseño Monorepo
**Notas del orador:** Bienvenidos a la presentación de la arquitectura de Gym Manager. Hoy exploraremos cómo hemos diseñado un SaaS B2B escalable, seguro y moderno utilizando tecnologías de vanguardia.

---

## Slide 2: Topología del Proyecto (Monorepositorio)
**Título:** Ecosistema Unificado: El Monorepositorio
**Puntos clave:**
*   Todo el código coexiste en un solo repositorio Git.
*   **Gestor:** `pnpm workspaces` para compartir librerías sin duplicar dependencias.
*   **Orquestador:** `Turborepo` gestiona la ejecución paralela y el cacheo inteligente.
*   **Ventaja:** Permite compilar y ejecutar el Frontend y Backend simultáneamente con un solo comando (`pnpm run dev`).
**Notas del orador:** En lugar de tener repositorios fragmentados, usamos un Monorepositorio. Esto garantiza que el Frontend y el Backend siempre estén sincronizados y compartan las mismas reglas de negocio y tipados.

---

## Slide 3: Estructura de Componentes Clave
**Título:** Anatomía del Repositorio
**Puntos clave:**
*   **`apps/api/` (Backend):** Servidor NestJS (Puerto 3001). Cerebro lógico y seguridad.
*   **`apps/web/` (Frontend):** Interfaz en Next.js y Tailwind CSS (Puerto 3000).
*   **`packages/database/`:** Capa del Modelo con Prisma ORM. Única fuente de verdad de la BD.
*   **Raíz del proyecto:** Contiene la orquestación (`turbo.json`, `pnpm-workspace.yaml`), variables secretas (`.env`) e infraestructura (`docker-compose.yml`).
**Notas del orador:** Esta separación física pero integración lógica nos permite escalar equipos. Los desarrolladores frontend trabajan en `apps/web` y los backend en `apps/api`, unidos por la base de datos central en `packages/database`.

---

## Slide 4: Paradigma MVC en Entorno Moderno
**Título:** MVC Distribuido
**Puntos clave:**
*   **La Vista (View):** `apps/web`. No toca la base de datos, solo consume el API mediante HTTP/REST.
*   **El Controlador (Controller):** Controladores en NestJS. Validan peticiones y enrutan el tráfico.
*   **Lógica (Service):** Servicios en NestJS. Ejecutan reglas de negocio pesadas.
*   **El Modelo (Model):** Prisma ORM. Se encarga de la integridad referencial y las consultas a PostgreSQL.
**Notas del orador:** Mantenemos la filosofía clásica del MVC, pero adaptada a la nube. La Vista vive en un servidor Node separado del Controlador y el Modelo.

---

## Slide 5: El Desafío del SaaS (Multi-Tenancy)
**Título:** Arquitectura Multi-Tenant (B2B)
**Puntos clave:**
*   Múltiples gimnasios (inquilinos) comparten la misma base de datos física.
*   **Aislamiento Lógico:** Todas las tablas operativas (clientes, pagos, membresías) incluyen un `organizacion_id` obligatorio.
*   **Tablas Globales:** Solo `Usuario` y `Permiso` son globales, permitiendo a dueños gestionar varias sucursales.
**Notas del orador:** En un SaaS B2B, el mayor riesgo es que un cliente vea los datos de otro. Nuestro esquema de base de datos exige un identificador de organización en cada registro transaccional para garantizar el aislamiento.

---

## Slide 6: Seguridad a Nivel de Fila (RLS)
**Título:** Row-Level Security (RLS) Automatizado
**Puntos clave:**
*   Evita fugas de datos por errores humanos.
*   **Guardián (JwtAuthGuard):** Extrae el ID de la organización del token JWT y lo guarda en memoria segura (`ClsService`).
*   **Interceptor Prisma:** Lee la memoria e inyecta dinámicamente `WHERE organizacion_id = 'X'` en todas las consultas.
*   **Resultado:** El desarrollador no necesita filtrar datos manualmente; el sistema lo hace de forma invisible.
**Notas del orador:** Esta es la joya de la corona de nuestra arquitectura. Gracias a la extensión de Prisma y el Context Local Storage, logramos seguridad RLS a nivel de aplicación de manera 100% automatizada y transparente.

---

## Slide 7: El Viaje de los Datos (Flujo de Ejecución)
**Título:** Flujo de Ejecución HTTP a BD
**Puntos clave:**
1.  **Frontend:** Usuario entra al Dashboard. React dispara petición `fetch` con token JWT.
2.  **Seguridad:** NestJS recibe la petición. Valida el token y guarda el Tenant ID en memoria.
3.  **Lógica:** El Controlador llama al Servicio.
4.  **Inyección:** Prisma intercepta la consulta, inyecta el Tenant ID y va a PostgreSQL.
5.  **Renderizado:** Los datos retornan a Next.js para dibujarse en pantalla.
**Notas del orador:** Para resumir, este es el viaje milisegundo a milisegundo de los datos, demostrando cómo cada capa (Vista, Controlador, Modelo) interactúa de forma segura.

---

## Slide 8: Gestión de Entornos
**Título:** Infraestructura y Despliegue
**Puntos clave:**
*   **Desarrollo Local:** `pnpm run dev` orquesta todo con máxima velocidad y *hot-reload*.
*   **Docker Compose:** Usado localmente solo para bases de datos (PostgreSQL, Redis), manteniendo las computadoras limpias.
*   **Scripts de Arranque:** Automatizan extensiones de base de datos como UUID y encriptación (`init-db.sql`).
**Notas del orador:** Finalmente, nuestra infraestructura está pensada para la experiencia del desarrollador, usando Docker para aislar la base de datos pero ejecutando el código nativamente para iterar rápidamente.
