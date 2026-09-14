# Auditoría técnica — Gym Manager (SaaS multi-tenant)

**Fecha:** 2026-09-14
**Alcance:** `apps/api` (NestJS + Prisma + PostgreSQL + Redis), `apps/web` (Next.js), `packages/database` (schema Prisma).
**Objetivo declarado del sistema:** todo usuario debe estar anclado a una organización (y opcionalmente a una sucursal), excepto los `superadmin`, que deben poder operar sin organización vinculada, de forma global, sin que eso rompa el aislamiento del resto de tenants.

**Veredicto general:** el diseño es considerablemente más ambicioso y más sólido de lo que un vistazo superficial sugeriría — hay decisiones de arquitectura genuinamente buenas (FKs compuestas `[id, organizacionId]`, un motor de "RLS" de aplicación centralizado, superadmin implementado como caso de primera clase). Pero la ejecución es desigual: conviven módulos muy bien construidos (`transaccion`, `membresia`, `apertura-caja`) con un defecto crítico y concreto de aislamiento entre tenants, secretos con fallback inseguro, y un frontend construido a fuerza de copiar/pegar sin capa de red centralizada. No es "todo está mal", pero tampoco es "funciona por momentos": **la columna vertebral (autenticación, RBAC, aislamiento de datos) está bien pensada y en su mayoría bien implementada, con una fisura crítica puntual que hay que cerrar antes de producción.**

---

## 1. Arquitectura de aislamiento multi-tenant: cómo funciona hoy

1. **Login** (`auth.service.ts`) valida credenciales con `scrypt` + `timingSafeEqual`, y arma un JWT con `sub`, `organizacionId`, `sucursalId`, `is_superadmin`, tomados de la **primera** fila de `asignacionesAcceso` del usuario (sin `orderBy`, ver hallazgo §3.1).
2. **`JwtAuthGuard`** decodifica el token y escribe `organizacionId` / `sucursalId` / `is_superadmin` en un contexto `ClsService` (continuation-local storage) por request.
   - Si `is_superadmin && !organizacionId` (superadmin "puro"), lee el header `x-tenant-id`: `'all'` → sin organización (modo global), un UUID → impersona esa organización.
   - Si no es superadmin, exige `organizacionId` en el token o rechaza la request.
3. **`PrismaService.extendedClient`** es un Prisma Client Extension que, para cualquier modelo con campo `organizacionId`, intercepta **todas** las operaciones y:
   - Convierte `delete`/`deleteMany` en `update`/`updateMany` con `deletedAt = now()` (soft delete), *solo si el modelo tiene `deletedAt`*.
   - Filtra automáticamente registros con `deletedAt != null` en las lecturas.
   - Inyecta `organizacionId` (y `sucursalId` si aplica) en `create`.
   - Inyecta `where.organizacionId` (y `sucursalId`) en `find*`, `update`, `updateMany`.
   - Si `is_superadmin` y no hay `organizacionId` en el CLS (modo `'all'`), **no aplica ninguna restricción** — acceso global real.

Esto es, en esencia, un **RLS de aplicación** (no PostgreSQL RLS real vía `SET ROW LEVEL SECURITY` / políticas de sesión). Es una decisión de diseño válida — más simple de razonar que RLS a nivel de motor — pero tiene una propiedad peligrosa: **es opt-in por código**. Solo protege si el desarrollador llama a `this.prisma.extendedClient.X` en vez de `this.prisma.X`. No hay ninguna barrera que impida usar el cliente crudo por error.

### Hallazgo transversal más grave del sistema

> ### 🔴 CRÍTICO — `delete`/`deleteMany` no reciben el filtro `where.organizacionId`
> **Archivo:** `apps/api/src/prisma/prisma.service.ts:107-148`
>
> El bloque "RESTRICCIONES DE SEGURIDAD" que inyecta `where.organizacionId` solo se ejecuta `if (isFind || operation === 'update' || operation === 'updateMany')`. Las operaciones `delete`/`deleteMany` **no están en esa lista**. Para modelos con `deletedAt`, esto no importa porque la extensión ya las reescribió como `update` más arriba (línea 32) y sí pasan por el filtro. Pero para modelos **tenant-scoped sin `deletedAt`** (`AsignacionAcceso`, `Pago`, `DetalleTransaccion`, `Comprobante`, `Inventario`, `Notificacion`, `StaffDisciplina`, `Auditoria`), un `delete`/`deleteMany` ejecutado vía `extendedClient` **se ejecuta sin ningún filtro de organización**, aunque el desarrollador haya usado correctamente el cliente "seguro".
>
> **Explotación real y concreta ya encontrada en el código:**
> `apps/api/src/modules/usuario/usuario.service.ts:108-112` (`removerEmpleado`):
> ```ts
> const asignacion = await this.prisma.extendedClient.asignacionAcceso.delete({
>   where: { id: asignacionId },
> });
> ```
> Cualquier usuario con el permiso `usuarios:eliminar` en **su propia organización** puede borrar la `AsignacionAcceso` de **cualquier organización** con solo enviar (o adivinar/enumerar) un UUID ajeno — revocando el acceso de un empleado o dueño de otro gimnasio. Es un IDOR cross-tenant real, no teórico, con impacto de integridad y disponibilidad (denegación de acceso dirigida a otro tenant).
>
> **Corrección recomendada:** incluir `delete`/`deleteMany` en la condición de inyección de `where` en `prisma.service.ts` (con el mismo tratamiento que `update`/`updateMany`), y auditar puntualmente cada `.delete()`/`.deleteMany()` existente en el código (se listan en §7) para confirmar que quedan cubiertos tras el fix.

---

## 2. El modelo de superadmin: ¿cumple el objetivo pedido?

**Sí, en su diseño, y es uno de los puntos mejor resueltos del sistema** — algo inusual, porque este patrón (usuario global + acceso condicional a tenant) suele hacerse mal.

- `Usuario.isSuperAdmin` es un flag global, independiente de `AsignacionAcceso` — un superadmin puede existir sin ninguna fila de acceso a ninguna organización (`AsignacionAcceso.organizacionId` es opcional explícitamente para este caso: `null = acceso global`).
- El header `x-tenant-id: all` vs. `x-tenant-id: <uuid>` permite dos modos de operación reales: **modo dios** (ver/editar todo, sin scoping) y **modo impersonación** (operar como si perteneciera a una organización concreta, con el mismo aislamiento que un usuario normal de esa org).
- El frontend implementa esto correctamente: hay un selector de tenant en el header del dashboard que setea `x-tenant-id`, con un componente (`TenantRequiredButton`) que bloquea crear datos "huérfanos" cuando el superadmin está en modo `'all'` — defensa en profundidad consistente entre frontend y backend, y evidencia de que el problema se pensó de punta a punta, no solo en el backend.
- `RolesGuard` hace bypass total de permisos si `user.is_superadmin` — correcto para el propósito ("puede tener acceso a todo").

### Grietas puntuales en este diseño

> ### 🟠 ALTO — Los endpoints "solo superadmin" se protegen por permiso, no por `is_superadmin`
> **Archivo:** `apps/api/src/modules/organizacion/organizacion.controller.ts:15-48`, `organizacion.service.ts:20-100`
>
> `GET/POST/PUT/DELETE /organizaciones` están comentados como "ENDPOINTS PARA SUPERADMIN", pero la única barrera real es `@RequirePermissions({accion, modulo: 'organizaciones'})` — un permiso del catálogo RBAC común, **no** una comprobación explícita de `user.is_superadmin`. El servicio, además, usa `this.prisma` crudo (no `extendedClient`) y ejecuta `update`/`delete` sobre **cualquier `id`** recibido por parámetro de ruta sin ninguna comprobación de pertenencia.
>
> Hoy esto no es explotable porque el seed excluye el módulo `organizaciones` de todos los roles no-superadmin (`permisosAdminGym = permisos donde modulo !== 'organizaciones'`). Pero **nada en el código impide** que un rol personalizado, creado desde `POST /roles` por un admin de gimnasio con permiso de gestión de roles, incluya un `permisoId` del módulo `organizaciones` (no hay validación de "qué módulos puede asignar un rol no-sistema" en `rol.service.ts`). Si eso ocurriera — por error de configuración o por un futuro endpoint de auto-gestión de roles —, ese tenant podría leer, modificar o **borrar cualquier organización del sistema**, no solo la propia. Es una vulnerabilidad de "defensa en profundidad ausente": el control correcto (`if (!user.is_superadmin) throw ForbiddenException`) es una línea, y hoy no existe en ningún punto de este controller/servicio.
>
> **Recomendación:** todo endpoint conceptualmente "solo superadmin" debe validar `req.user.is_superadmin === true` explícitamente además de (o en vez de) depender del catálogo de permisos.

> ### 🟡 MEDIO — Selección de organización activa en login es no determinista
> **Archivo:** `apps/api/src/modules/auth/auth.service.ts:46` — `const asignacionActiva = user.asignacionesAcceso?.[0];`
>
> El schema documenta explícitamente que un usuario puede pertenecer a varias organizaciones ("una persona puede trabajar, con su mismo login, en más de un gimnasio"). Pero el login toma la primera fila que devuelva Postgres, sin `orderBy` y sin permitir al usuario elegir con cuál organización iniciar sesión. Un usuario multi-organización queda atado, de forma no determinista request a request (bueno, por sesión/token), a una org que no eligió. No es un problema de seguridad, sí de producto: el caso de uso que el propio schema dice soportar no tiene forma de usarse desde el login.

---

## 3. Hallazgos por módulo

### 3.1 `usuario/`
- 🔴 **CRÍTICO** — `removerEmpleado` / IDOR cross-tenant vía `delete()`, ver §1.
- 🟡 **MEDIO** — `registrarEmpleado`/`updateAsignacion` reciben `@Body() data: any` sin DTO (`usuario.controller.ts:20,26`); el `ValidationPipe` global (`whitelist`/`forbidNonWhitelisted`) no protege parámetros tipados `any` — sin validación de formato de correo ni política de contraseña.
- 🟢 **POSITIVO** — hash `scrypt` + salt aleatorio + `timingSafeEqual`, consistente con `auth.service.ts`; transacciones correctas al crear usuario+asignación con rollback si el rol no existe.
- 🔵 **BAJO** — sin `usuario.service.spec.ts`.

### 3.2 `organizacion/`
- 🔴/🟠 Ver §2 (permiso genérico en vez de `is_superadmin`, `body: any` en `registrarOrganizacion`/`updateOrganizacionById`/`updateMiOrganizacion` → mass assignment: un tenant con permiso de actualizar podría, en teoría, enviar campos que no debería poder tocar).
- 🟢 **POSITIVO** — `crearOrganizacionConAdmin` crea Organización + Sucursal Central + Usuario admin + `AsignacionAcceso` en una única transacción: ninguna organización nueva queda huérfana sin administrador.
- 🟢 **POSITIVO** — `getMiOrganizacion`/`updateMiOrganizacion` sí acotan correctamente por `id` tomado del CLS (no del cliente), pese a usar `prisma` crudo.
- 🔵 **BAJO** — sin tests; sin validación de organización duplicada.

### 3.3 `rol/` y `permiso/`
- 🟢 **POSITIVO** — el mejor módulo de este grupo: protección explícita de roles `esSistema` (no se pueden editar/borrar salvo `is_superadmin`), uso consistente de `extendedClient`, manejo cuidadoso del caso especial en que un superadmin edita un rol de sistema (`organizacionId: null`) usando el cliente crudo justo en ese caso puntual — una solución correcta aunque frágil si alguien la toca sin entender por qué existe.
- 🟡 **MEDIO** — no hay validación de que los `permisosIds` enviados en `create`/`update` de rol pertenezcan a módulos que ese tenant debería poder asignar (ver §2, riesgo de escalación vía rol personalizado).
- 🔵 **BAJO** — no se valida que `permisosIds` existan antes de `createMany` (fallaría con error crudo de FK en vez de un 400 amigable).

### 3.4 `sucursal/`
- 🟢 **POSITIVO** — CRUD completo, `extendedClient` consistente, DTOs correctos con `class-validator`.
- 🔵 **BAJO** — no se impide tener dos sucursales `esPrincipal: true` en la misma organización, ni se protege que una organización quede sin sucursal principal.

### 3.5 `clientes/`
- 🟢 **POSITIVO** — guards y permisos completos, `extendedClient` en todo el CRUD, manejo de `P2002` (documento duplicado) traducido a `ConflictException`.
- 🟡 **MEDIO** — `update()` castea `updateData as any` en el controller, perdiendo tipado justo antes de persistir.
- 🔵 **BAJO** — `findAll()` sin paginación ni filtros — un tenant con miles de clientes recibe todo en una respuesta.
- Test: solo casos felices de `create`/`findOne`; no cubre `update`/`remove` ni aislamiento multi-tenant.

### 3.6 `membresia/` — el módulo con más lógica de negocio real
- 🟢 **POSITIVO** — valida plan activo, promoción activa y vigente por fecha, calcula `montoFinal`/`descuentoAplicado`/`fechaFin`/`sesionesRestantes` correctamente; tests que prueban lógica real, no solo mocks.
- 🟢 **POSITIVO** — cron de cancelación automática de membresías `PENDIENTE_PAGO` vencidas.
- 🟠 **ALTO** — código muerto / feature a medias: se consulta `membresiasActivas` para "encolar" una membresía nueva detrás de una vigente, pero el resultado nunca se usa (admitido en comentario del propio código); el estado `EN_ESPERA` del enum nunca lo asigna nadie. La regla de negocio está documentada pero no implementada.
- 🟡 **MEDIO** — `UpdateMembresiaDto` permite cualquier transición de `estado` (ej. `CANCELADA → ACTIVA`) sin ninguna máquina de estados que lo valide.

### 3.7 `plan/` y `promocion/`
- 🟢 **POSITIVO** — CRUD correcto, guards/permisos completos, `extendedClient` consistente.
- 🟡 **MEDIO** (ambos) — sin validaciones de coherencia de negocio: `plan` no valida `horaInicioAcceso < horaFinAcceso` ni que los campos requeridos por `tipoPlan` estén presentes; `promocion` no valida `fechaInicio < fechaFin` ni rango 0-100 de `porcentajeDescuento`, y el schema permite `porcentajeDescuento` y `montoDescuentoFijo` simultáneos sin que nada lo impida (aunque `membresia.service.ts` solo usa uno de los dos en la práctica).

### 3.8 `asistencia/` — mejor intención de diseño, bug crítico de implementación
- 🔴 **CRÍTICO (funcional)** — `asistencia.service.ts` referencia `plan.franjaHorariaInicio`/`plan.franjaHorariaFin`, campos que **no existen** en el modelo `Plan` (el schema define `horaInicioAcceso`/`horaFinAcceso`). Como `PrismaService.extendedClient` está tipado `any` (ver §4), TypeScript no detecta el desajuste: la condición `if (plan.franjaHorariaInicio && ...)` nunca es verdadera y la restricción de horario de acceso de un plan **está completamente inactiva** en producción, pese a que la UI/DTO la contemplan.
- 🟢 **POSITIVO** — el resto de `validateAccess()` (día de semana, sesiones restantes, membresía activa) sí es correcto; `checkIn()` descuenta sesiones dentro de `$transaction` y marca `AGOTADA` correctamente.
- 🟡 **MEDIO** — la regla "1 ingreso por día" está condicionada a `user.rolNombre === 'RECEPCIONISTA'` (string hardcodeado), no a un permiso del sistema RBAC ya existente — si se renombra o duplica ese rol, la regla se desactiva en silencio.
- 🔵 **BAJO** — `forzarIngreso: true` no exige un permiso distinto al de check-in normal.
- Sin tests unitarios — el módulo con más lógica de negocio del bloque cliente es el único sin `.spec.ts`.

### 3.9 `caja-registradora/`
- 🟢 **POSITIVO** — servicio pequeño y correcto, `extendedClient` consistente, guards/permisos completos.
- 🔵 **BAJO** — registra su propio `JwtModule` con `expiresIn: '8h'`, distinto del `'1d'` global de `AuthModule` — configuración de JWT fragmentada entre módulos (ver también §4, secreto duplicado).

### 3.10 `apertura-caja/`
- 🟠 **ALTO** — condición de carrera (TOCTOU): `abrirCaja()` comprueba con `findFirst` que la caja no esté abierta y luego crea la apertura en una transacción separada, sin índice único parcial en BD que lo respalde — dos requests concurrentes pueden abrir la misma caja dos veces.
- 🟡 **MEDIO** — no valida que `dto.cajaId` pertenezca a la sucursal del usuario autenticado cuando este tiene `sucursalId` fijo; un empleado de la Sucursal A podría abrir una caja de la Sucursal B si conoce el ID.
- 🟢 **POSITIVO** — `cerrarCaja()`/`abrirCaja()` usan `$transaction` correctamente; tests con casos de negocio reales (caja ocupada, turno duplicado, ajuste de saldo al cierre).

### 3.11 `transaccion/` — el módulo mejor construido de todo el backend
- 🟢 **POSITIVO fuerte** — valida matemáticamente `montoTotal == Σdetalles == Σpagos` (tolerancia 0.01) antes de escribir; toda la operación (cabecera + detalles + pagos + activación de membresía + `increment`/`decrement` de saldos) ocurre en un único `$transaction`, evitando el race condition de leer-modificar-escribir sobre `saldoActual`/`saldo`.
- 🟢 **POSITIVO** — cuando el usuario tiene `sucursalId` fijo en el JWT, el RLS sobrescribe el `sucursalId` del insert sin importar lo que mande el DTO.
- 🟡 **MEDIO** — no valida que `dto.sucursalId` coincida con la sucursal real de la `aperturaCaja` usada — se puede desalinear el reporte de caja física vs. sucursal reportada.
- 🟡 **MEDIO** — `findAll()` del controller reconstruye manualmente el filtro de `organizacionId` desde el header `x-tenant-id`, duplicando la fuente de verdad que ya provee el RLS de `PrismaService` — funciona hoy, pero es un segundo lugar que mantener sincronizado.
- Tests: cubren descuadre de montos y activación diferida de membresía (`EN_ESPERA`) — de los más útiles del repositorio.

### 3.12 `cuenta-bancaria/`
- 🟡 **MEDIO** — es el modelo tenant-scoped con menos "cinturones y tirantes": no tiene `sucursalId` ni un padre con FK compuesta, así que su aislamiento depende al 100% de que el RLS de `PrismaService.extendedClient` se use correctamente (hoy se usa bien, pero no hay ninguna red de seguridad adicional si algún día alguien usa `this.prisma` crudo aquí).
- 🔵 **BAJO** — sin tests; módulo no declara explícitamente sus dependencias de `PrismaModule`/`JwtModule` (funciona por ser globales, pero es una dependencia implícita).

### 3.13 `dashboard/`
- 🟢 **POSITIVO** — no expone ningún parámetro de organización/sucursal controlable por el cliente (usa `req.user.sucursalId` del JWT), superficie de ataque mínima.
- 🟡 **MEDIO** — `getRevenueChart` hace 7 `aggregate` secuenciales (un loop por día) en vez de una consulta agrupada — ineficiente a escala, no incorrecto.
- Comportamiento a documentar (no bug): en modo superadmin `x-tenant-id: all`, los KPIs mezclan datos de **todas** las organizaciones en un solo número, sin desglose — coherente con el diseño pero puede confundir si el frontend no lo advierte.
- Sin tests.

### 3.14 `health/`
- Único controller sin guards — correcto y esperable para un endpoint de healthcheck.

---

## 4. Hallazgos transversales de infraestructura

> ### 🔴 CRÍTICO — Secreto JWT con fallback hardcodeado, duplicado en 6 archivos
> `jwt-auth.guard.ts`, `auth.module.ts`, `caja-registradora.module.ts`, `rol.module.ts`, `permiso.module.ts`, `sucursal.module.ts` — todos usan `process.env.JWT_SECRET || 'gym_saas_super_secret_jwt_key_2026'`.
>
> Si `JWT_SECRET` no está seteado en el entorno de despliegue (típico error de configuración), **cualquiera que lea el código fuente público de este mismo repositorio** puede forjar un JWT válido, incluyendo `is_superadmin: true` y cualquier `organizacionId` — control total del sistema. Esto no es hipotético: es un secreto conocido, versionado en el historial de git.
> **Recomendación:** eliminar el fallback por completo (que la app falle al arrancar si `JWT_SECRET` no está definido), y centralizar la configuración de `JwtModule` en un único módulo global en vez de repetirla en 5+ módulos distintos.

> ### 🟠 ALTO — `PrismaService.extendedClient` está tipado `any`
> `apps/api/src/prisma/prisma.service.ts:11-13`. Todo el código que usa `this.prisma.extendedClient.X` (que es prácticamente todo el backend) pierde el autocompletado y el chequeo de tipos de Prisma. Esto ya causó el bug real de `asistencia.service.ts` (§3.8): TypeScript no pudo avisar sobre un campo inexistente porque el tipo es `any`. Recomendado: tipar `extendedClient` con el tipo de retorno real de `$extends(...)` (Prisma lo infiere automáticamente si no se fuerza `any` en la declaración del getter).

> ### 🟡 MEDIO — CORS abierto sin configuración
> `apps/api/src/main.ts:17` — `app.enableCors()` sin opciones acepta cualquier origen. Con autenticación por header `Authorization` (no cookies) el riesgo práctico es menor que con cookies de sesión, pero sigue sin ser una postura explícita para un SaaS — se recomienda restringir a la(s) URL(s) reales del frontend por entorno.

> ### 🔵 BAJO — Higiene de repositorio
> Scripts de un solo uso committeados en la raíz y en `packages/database/` (`fix-interceptors.js`, `fix-superadmin.ts`, `query-admin.ts`) — el primero en particular es un script que reescribe con regex el manejo de respuestas HTTP en todo el frontend (`res.json()` → desenvolver `.data`), evidencia de que el contrato de respuesta cambió (por el `ResponseInterceptor` global) y se corrigió con un parche masivo en vez de una actualización deliberada del cliente HTTP. Funciona, pero es frágil y no debería vivir en el repo como artefacto permanente.

> ### 🔵 BAJO — Inconsistencia de formato en el catálogo de permisos expuesto al frontend
> `roles.guard.ts` construye y compara permisos como `` `${accion}:${modulo}` ``; `auth.service.ts#getPermisos` (usado por `GET /auth/permisos`, que el frontend consulta para pintar el menú) devuelve `` `${modulo}:${accion}` `` — orden invertido. No afecta la seguridad real (la aplican por separado), pero si el frontend compara literalmente contra el permiso reportado por `/auth/permisos` para decidir qué mostrar, el formato no calza con lo que `RolesGuard` realmente exige.

### Cobertura de tests (backend)
18 `*.service.ts`, 11 `*.service.spec.ts`. Sin test: `usuario`, `organizacion` (ambos con hallazgos de severidad alta/crítica), `asistencia` (con el bug crítico de esta auditoría), `caja-registradora`, `cuenta-bancaria`, `dashboard`, `permiso`, `sucursal`. Los tests existentes (`membresia`, `transaccion`, `apertura-caja`, `plan`) sí prueban lógica de negocio real, no son triviales — el patrón de calidad existe, simplemente no se aplicó a todos los módulos.

---

## 5. Frontend (`apps/web`)

- 🔴 **CRÍTICO** — JWT guardado en `localStorage` (`login/page.tsx`) y leído crudo en todas las páginas; cualquier XSS futuro expone el token completo (incluye `is_superadmin`).
- 🔴 **CRÍTICO** — sin `middleware.ts`; toda protección de rutas es un `useEffect` cliente que corre después del primer render — la página protegida siempre llega a montarse brevemente antes del redirect.
- 🔴 **CRÍTICO** — URL del API (`http://localhost:3001`) hardcodeada, repetida literalmente en decenas de archivos — el frontend, tal como está, no puede desplegarse fuera de localhost sin una edición masiva.
- 🟠 **ALTO** — no existe cliente HTTP centralizado: el patrón fetch + headers + desenvolver `.data` está copiado en cada página, sin interceptor ni manejo uniforme de errores; el manejo de 401 es inconsistente entre páginas (`clientes` limpia sesión y redirige, `organizaciones` no).
- 🟠 **ALTO** — sin refresh token ni expiración proactiva; `usePermissions` colapsa a "sin permisos para nada" ante cualquier error de red, indistinguible de una restricción real.
- 🟡 **MEDIO** — decodificación de JWT duplicada e inconsistente (`atob` simple en unas páginas vs. decodificación UTF-8 correcta en `dashboard/layout.tsx`) — nombres con tildes/ñ se corrompen en algunas pantallas; `useTenantStore` no se limpia en logout; uso extensivo de `any` en toda la capa de datos.
- 🟢 **POSITIVO destacado** — el problema de "superadmin sin organización" está resuelto con una UX coherente: selector de tenant global (`'all'` vs. organización específica) que se traduce 1:1 al header `x-tenant-id`, con un guard de UI (`TenantRequiredButton`) que impide crear datos huérfanos en modo global — refleja el mismo cuidado que el backend le puso al mismo problema.
- 🟢 **POSITIVO** — componentes reutilizables genuinamente buenos (`Protect` para gating por permiso, `GlobalFormModal`, `GlobalConfirmDialog`, `useSoftDelete`); formularios con Zod + react-hook-form consistentes; pruebas e2e con Playwright cubriendo al menos el flujo de login y un flujo de recepcionista.

---

## 6. Qué está genuinamente bien hecho (para no perder de vista lo positivo)

1. **Modelo de datos**: uso sistemático de FKs compuestas `[id, organizacionId]` para que Postgres rechace a nivel de motor cualquier fila que mezcle entidades de dos tenants — defensa real, no solo convención de aplicación. Decisión de diseño poco común y bien ejecutada en el schema.
2. **`transaccion.service.ts`**: validación matemática de montos, atomicidad completa con `$transaction`, incrementos atómicos de saldo — es el estándar al que el resto de módulos financieros debería aspirar.
3. **Modelo de superadmin**: identidad global vs. pertenencia por `AsignacionAcceso`, con impersonación de tenant vía header — bien pensado y bien implementado de punta a punta (backend + frontend).
4. **`rol.service.ts`**: protección cuidadosa de roles de sistema (`esSistema`), incluyendo el caso límite de un superadmin editando un rol global.
5. **`membresia.service.ts`** y **`apertura-caja.service.ts`**: los módulos con lógica de negocio real acompañada de tests que la ejercitan de verdad.
6. **Guards y permisos a nivel de controller**: pese a que la arquitectura de guards no es "segura por defecto" (ver §7), la disciplina real de aplicarlos está bien seguida — prácticamente todos los endpoints de negocio tienen `@UseGuards(JwtAuthGuard, RolesGuard)` + `@RequirePermissions` explícito.

---

## 7. Priorización recomendada

| # | Hallazgo | Severidad | Esfuerzo estimado |
|---|---|---|---|
| 1 | `delete`/`deleteMany` sin filtro de tenant en `PrismaService` (IDOR cross-tenant real vía `removerEmpleado`) | 🔴 Crítico | Bajo — una condición en `prisma.service.ts` + revisar los ~10 `.delete()` existentes |
| 2 | Fallback de `JWT_SECRET` hardcodeado, duplicado en 6 archivos | 🔴 Crítico | Bajo — fallar al arrancar si falta la env var; centralizar `JwtModule` |
| 3 | `asistencia.service.ts`: campo inexistente `franjaHorariaInicio/Fin` → restricción horaria muerta | 🔴 Crítico (funcional) | Bajo — corregir nombre de campo + agregar test |
| 4 | Endpoints "solo superadmin" sin chequeo explícito de `is_superadmin` (`organizacion.controller.ts`) | 🟠 Alto | Medio |
| 5 | Frontend: JWT en `localStorage`, sin `middleware.ts`, URL de API hardcodeada | 🟠 Alto (crítico si se despliega fuera de localhost tal cual) | Medio-Alto |
| 6 | Tipar `extendedClient` (hoy `any`) | 🟠 Alto | Bajo |
| 7 | Condición de carrera en apertura de caja | 🟠 Alto | Medio (índice único parcial en BD) |
| 8 | Cobertura de tests en `usuario`, `organizacion`, `asistencia`, `caja-registradora`, `cuenta-bancaria`, `dashboard` | 🟡 Medio | Medio |
| 9 | Reglas de negocio ausentes en `plan`/`promocion` (fechas, rangos) y máquina de estados de `Membresia` | 🟡 Medio | Medio |
| 10 | Cliente HTTP centralizado en el frontend (elimina duplicación y maneja 401 de forma uniforme) | 🟡 Medio | Medio |

---

*Auditoría generada con asistencia de Claude (Sonnet 5) mediante lectura exhaustiva del código fuente actual del repositorio. No se ejecutó la aplicación ni se realizaron pruebas de penetración activas; los hallazgos de seguridad se basan en análisis estático del código y su lógica.*
