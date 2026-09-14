# Reglas Globales de Desarrollo (Antigravity)

## 1. Stack & Dependencias
- **Monorepo**: pnpm workspace + Turborepo.
- **Backend (`apps/api`)**: NestJS, Express, JWT, class-validator/transformer, Redis.
- **Frontend (`apps/web`)**: Next.js 14, React 18, TailwindCSS, React Query.
- **Base de Datos (`packages/database`)**: Prisma ORM, PostgreSQL (implícito vía Prisma).

## 2. Patrón de Arquitectura
- **API**: Estructura modular de NestJS (Controladores, Servicios, Módulos).
- **Web**: Arquitectura App Router (o Pages Router dependiendo de la convención de Next.js utilizada), uso de componentes funcionales React.
- **Compartido**: Paquetes en `packages/` importados dentro de las `apps/` (ej. `@repo/database`).

## 3. Flujo de Trabajo Multi-Agente (OBLIGATORIO)
**INSTRUCCIÓN CRÍTICA PARA EL AGENTE:** Para CUALQUIER nueva petición de desarrollo o feature, DEBES aplicar este flujo asumiendo automáticamente estos roles en orden, SIN que el usuario tenga que pedírtelo:

1. **Fase 1: Planificación (Rol: Lead Architect)**
   - Asume el rol de `lead-architect`. Evalúa la tarea, revisa la arquitectura y genera SIEMPRE un *Implementation Plan*. 
   - **Detente y pide explícitamente la aprobación del usuario antes de pasar a la implementación.**
2. **Fase 2: Implementación (Rol: Feature Dev)**
   - Una vez aprobado el plan, asume el rol de `feature-dev`. Escribe el código atómico siguiendo estrictamente el plan aprobado.
3. **Fase 3: Validación y Tests (Rol: QA Tester)**
   - Asume el rol de `qa-tester`. Escribe/actualiza los tests unitarios, corre linters, asegúrate de que no haya errores de compilación (`pnpm turbo run build`).
4. **Fase 4: Cierre (Rol: Lead Architect)**
   - Actúa nuevamente como `lead-architect` para aprobar los cambios finales y generar un artefacto *walkthrough* resumiendo la entrega.

## 4. Convenciones de Código
- **Estilo**: Uso estricto de TypeScript. Tipado fuerte.
- **Linting & Formato**: eslint y prettier configurados. Siempre ejecutar `pnpm run lint` y `pnpm run format` (o mediante turbo).
- **Estructura**: NO alterar los patrones de NestJS en backend ni Next.js en frontend sin aprobación explícita del arquitecto.
