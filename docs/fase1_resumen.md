# Resumen Maestro - Fase 1 (Configuración y Arquitectura)

Este documento centraliza y consolida la documentación de las decisiones de diseño, la topología del monorepositorio y las políticas de seguridad de **Gym Manager SaaS**. Sustituye a documentos temporales de diseño y avances anteriores.

---

## 1. Topología del Monorepositorio

El ecosistema utiliza **Turborepo** y **pnpm workspaces** para garantizar ejecución paralela y control de caché, dividiéndose estructuralmente en:

- **`apps/api` (Backend)**: Aplicación NestJS que actúa como orquestador lógico y de seguridad (Controlador). Corre en el puerto `3001`.
- **`apps/web` (Frontend)**: Aplicación Next.js (App Router) equipada con React 18, Tailwind CSS v4, **Shadcn UI** (para componentes de diseño de alto nivel) y TanStack Query v5 para el manejo asíncrono y la cache del lado del cliente. Corre en el puerto `3000`.
- **`packages/database` (Persistencia)**: Librería aislada compartida que encapsula el ORM (Prisma), el esquema de base de datos (`schema.prisma`) y los scripts de inicialización (`seed.ts`).

## 2. Pila Tecnológica y Patrones

- **Patrón MVC y Repositorio**: La lógica de servidor (NestJS) respeta la separación de responsabilidades: los Controladores manejan la capa HTTP, los Servicios ejecutan la lógica de negocio, y Prisma actúa como Repositorio Universal.
- **Inyección de Dependencias (DI)**: Servicios como la conexión a Redis o a PostgreSQL se gestionan centralmente a través de Módulos globales (`RedisModule`, `PrismaModule`), optimizando uso de memoria bajo el patrón Singleton.
- **Validación Fuerte**: Se implementa `class-validator` y `class-transformer` mediante un Global Pipe en el servidor para rechazar payloads malformados, inyectando seguridad en DTOs.

## 3. Seguridad a Nivel de Fila (RLS Multi-Tenant)

Gym Manager es un entorno Multi-Inquilino (B2B). Las reglas inquebrantables de aislamiento de datos son:

1. **Aislamiento Estructural**: Toda tabla con información de un inquilino contiene el identificador `organizacionId`.
2. **Inyección Dinámica de Identidad**: A través de interceptores (`JwtAuthGuard`), cuando se recibe un token JWT válido, el ID de la organización se extrae y se inyecta en el *Context Local Storage* (CLS) de la petición usando `nestjs-cls`.
3. **Prisma Client Extensions**: `PrismaService` posee una propiedad `extendedClient` que captura cualquier consulta saliente hacia PostgreSQL y le inyecta una condición restrictiva (Ej: `WHERE organizacionId = ...`). Esto elimina el riesgo de fuga de datos entre inquilinos.
4. **Hashing Criptográfico**: Las contraseñas de las entidades `Usuario` nunca se guardan planas. Se genera un salto aleatorio y se aseguran utilizando el algoritmo nativo `crypto.scryptSync`.

## 4. Credenciales de Desarrollo (Seed)

Para facilitar el desarrollo local, tras ejecutar `pnpm run db:seed`, se establecen las siguientes entidades de prueba interconectadas y aseguradas (Ej. Rol y AsignacionAcceso):

- **Correo**: `admin@gymmanager.com`
- **Contraseña**: `admin123`
- **Organizaciones Vinculadas**: Gym Titan, CrossFit Alpha.

## 5. Prácticas de Desarrollo

- Todo código introducido debe pasar el `lint` (ESLint) y ser estrictamente tipado en TypeScript.
- Modificaciones en la topología de la base de datos se despliegan utilizando `pnpm turbo run db:push` / `db:generate`.
- Se requiere mantener dependencias minimalistas y siempre usar la versión orientada a módulos ES o utilidades nativas donde sea posible (como `crypto` nativo en lugar de paquetes externos heredados).
