## Estado de implementación (2026-09-18)

Los 4 puntos están implementados en el working tree (sin commitear todavía). Backend y frontend compilan limpio (`tsc --noEmit`) y pasan lint en todos los archivos tocados. Con Docker ya levantado se aplicó el `db push` real y se probó todo end-to-end contra la base de datos (por API, sin navegador — ver detalle de cada punto abajo).

### Hallazgo adicional encontrado durante la prueba (no estaba en `hallazgos.md`)

Al probar la restauración desde la papelera se encontró que **`POST /:id/restore` devolvía 500 en absolutamente todos los módulos** (clientes, cajas, personal, roles, clases, turnos, planes, promociones, etc.), no solo en los 5 que tenían el bug de `queryKey`. Causa raíz: `apps/api/src/prisma/prisma.service.ts` (la extensión RLS/soft-delete de Prisma) inyecta `where.deletedAt = null` en **cualquier** `update`/`updateMany`, incluido el propio `update({ data: { deletedAt: null } })` que usa `restore()` — así que la condición nunca podía coincidir con el registro que sí tiene `deletedAt` seteado, y Prisma tiraba `P2025`. Es un bug introducido en el mismo commit que agregó la papelera (`5497c9c`), no algo que yo haya roto. Se corrigió en la propia extensión (`injectReadFiltersRecursively`): si el `update` está fijando `deletedAt: null` explícitamente, se trata igual que el modo "solo borrados" en vez de forzar `deletedAt: null` en el `where`. Verificado con `clientes` y con el nuevo `turnos-plantilla`; no afecta updates ni soft-deletes normales (probado explícitamente). Esto era, en la práctica, un bloqueante más grave que el bug de `queryKey` para el hallazgo #2: sin este fix, restaurar nunca funcionaba, F5 o no.

- **Punto 4 (correo/backend):** hecho y verificado por API. `create-cliente.dto.ts` usa `@ValidateIf` en vez de `@IsOptional()` para `correo`. Probado: crear cliente con `correo: ""` → 201 (antes fallaba); crear cliente con `correo` mal formado → sigue rechazado con 400, como debe ser.
- **Punto 2 (papelera/refresco):** hecho y verificado. `queryKey` corregido en los 5 módulos afectados, **más el bug de fondo de `restore()` de arriba**, que era el bloqueante real. Probado el ciclo completo eliminar → listar papelera → restaurar → listar normal en `clientes` y `turnos-plantilla`.
- **Punto 1 (superadmin):** hecho, con alcance revisado — no hacía falta un flujo de bootstrap nuevo (`crearOrganizacionConAdmin` ya existía). El bug real estaba en `tenant-required-button.tsx`, que abría el formulario igual aunque el superadmin estuviera impersonando un tenant. Corregido ahí + mensaje de error backend diferenciado. Verificado por API que un intento de escritura de tenant como superadmin devuelve 403 con mensaje claro, nunca 500. **Sigue pendiente que completes la frase cortada de `hallazgos.md` ("...tenemos ")** por si hay otra acción bloqueada que no quedó cubierta por este diagnóstico.
- **Punto 3:** refresco del calendario (3a) hecho. MVP de turnos/clases (3b) hecho y verificado por API de punta a punta: se creó una plantilla recurrente, se generaron 8 turnos proyectados con "Generar turnos ahora", se confirmó el endpoint de disponibilidad dentro/fuera de turno, se creó una clase fuera de turno con política no estricta (guarda con advertencia, `turnoId: null`) y con política estricta (bloquea con 400), y una clase dentro de turno con política estricta (guarda y vincula `turnoId` automáticamente). La vista de calendario consolidada (turnos + clases superpuestos) y el selector de entrenador con indicador de disponibilidad quedan fuera de este alcance — son la fase 4-5 del plan original, no implementadas.

**No verificado:** la experiencia visual en el navegador (formularios, toasts, el aviso en vivo de disponibilidad, los tabs de Turnos/Plantillas) — todo lo de arriba se probó contra la API directamente. Vale la pena una pasada manual en el navegador antes de dar esto por cerrado del todo.

---

# Plan de corrección — Hallazgos QA manual (2026-09-18, actualizado)

Revisión de `docs/hallazgos.md` (4 puntos) con causa raíz identificada en código y plan de solución priorizado.

**Nota sobre el archivo fuente:** el punto 4 ya quedó completo en una revisión posterior (agrega contexto clave: el error 500 por validación de políticas fue el motivo original de un proyecto anterior y sigue causando problemas). El **punto 1 sigue cortado a media frase** ("...incluyendo todas las demás acciones, tenemos ") — no queda claro qué otras acciones concretas fallan además de crear usuarios. La sección 1 de este plan asume el caso más probable (bloqueo de escritura de tenant vía RLS); confirma o completa esa frase si hay acciones adicionales no cubiertas por esa causa raíz.

## Resumen ejecutivo

| # | Hallazgo | Causa raíz | Severidad | Esfuerzo |
|---|----------|-----------|-----------|----------|
| 1 | Superadmin no puede crear usuarios ni operar | Decisión de diseño (RLS) + permisos, no bug accidental | Alta (bloquea onboarding) | Media |
| 2 | Papelera/restauración no refresca sin F5 | `queryKey` inconsistente en 5 pantallas | Media | Baja |
| 3 | Calendario no refresca; turnos/clases desconectados y tediosos | Falta de polling + turnos sin plantillas recurrentes + sin vínculo turno↔clase | Alta (UX núcleo del producto) | Alta |
| 4 | Política de organización no se aplica 100% en backend | DTO de cliente valida `@IsEmail()` sobre string vacío antes de que se evalúe la política real de la organización | Crítica (patrón que ya causó el error 500 que originó este proyecto, según el reporte) | Baja |

Orden recomendado: **4 → 2 → 1 → 3**. El punto 4 sube a prioridad máxima porque el propio reporte lo vincula a un incidente recurrente (error 500 que motivó este proyecto), aunque el fix en sí sigue siendo pequeño y acotado. El punto 2 es igualmente un fix quirúrgico de bajo riesgo. El punto 1 requiere primero completar la frase cortada en `hallazgos.md` y una decisión de producto/seguridad antes de tocar código. El punto 3 es el rediseño más grande y se plantea como iniciativa aparte con historias propias.

---

## 1. Superadmin no puede crear usuarios / realizar acciones de tenant

**Causa raíz:** no es un bug, es una barrera de seguridad multi-tenant intencional:
- `packages/database/prisma/seed.ts:111-128` — el rol SUPERADMIN se siembra explícitamente solo con `leer` + `organizaciones:crear` + `roles:actualizar` + suspender/restaurar. El comentario del propio seed dice: *"Nunca crear/actualizar/eliminar datos internos de ningún tenant"*.
- `apps/api/src/prisma/prisma.service.ts:158-161` — a nivel de extensión de Prisma (RLS), **cualquier** operación de escritura sobre un modelo con `organizacionId`, hecha con `is_superadmin=true`, lanza un error explícito: *"El superadmin no puede escribir datos de tenant"*.

Es decir: el sistema ya decidió, a dos niveles, que el superadmin no debe tocar datos internos de un tenant (incluyendo crear usuarios de un gimnasio). Esto es buena práctica de seguridad en SaaS multi-tenant (evita que la cuenta de plataforma sea un vector de compromiso o de responsabilidad legal sobre datos de terceros) — pero deja un vacío de producto real: **¿cómo se crea el primer usuario/dueño de una organización nueva?**

**Decisión de producto recomendada:** mantener el bloqueo de RLS (no debilitarlo con una excepción genérica) y resolver el vacío con un flujo de *bootstrap* explícito y auditado, no con permisos CRUD amplios para superadmin.

**Plan:**
1. Al crear una organización (`organizaciones:crear`, ya permitido), el mismo formulario/endpoint debe capturar los datos del **owner inicial** y crear ese usuario en la misma transacción, mediante un método de servicio dedicado (`bootstrapOwner`) que sea la única excepción explícita al guard de RLS — no un bypass general, sino una ruta angosta, con `organizacionId` fijado por el propio flujo de creación y logueada en auditoría.
2. Alternativa complementaria (recomendada a mediano plazo): en vez de que superadmin fije una contraseña, enviar una **invitación por correo** al owner para que autoregistre su contraseña — así superadmin nunca maneja credenciales de tenant.
3. Revisar el resto de acciones que el hallazgo agrupa como "todas las demás acciones" — el texto de `hallazgos.md` queda cortado justo ahí ("...tenemos "), así que se necesita completar esa frase para saber si hay algo más allá del bloqueo de escritura de tenant. Mientras tanto, asumir que probablemente varias de esas acciones (gestión de clientes, clases, etc.) **no deberían** ser accesibles a superadmin, y que el hallazgo es en parte falta de claridad en la UI sobre qué rol puede hacer qué. Sugerencia: en el dashboard de superadmin, ocultar/deshabilitar con tooltip explicativo las acciones de escritura de tenant en vez de dejarlas visibles y fallar.
4. El mensaje de error ya está resuelto a nivel de infraestructura: `apps/api/src/common/filters/global-exception.filter.ts:32-35` intercepta cualquier excepción con `[Seguridad RLS]` en el mensaje y la traduce a un `403 Forbidden` con `"Acceso denegado: Faltan credenciales de inquilino (Tenant)."` — no llega como 500 crudo al usuario. Solo vale la pena afinar el copy del mensaje para que sea más específico ("Esta acción no está permitida para superadmin") en vez del genérico actual.

**Criterios de aceptación:**
- Crear una organización nueva deja lista una cuenta owner funcional sin tocar la BD manualmente.
- Ningún endpoint de escritura de tenant es alcanzable por superadmin fuera del flujo de bootstrap; los que lo eran hoy devuelven 403 claro, no 500.
- UI de superadmin no muestra botones de acciones que sabe que van a fallar.

---

## 2. Papelera y restauración no refrescan sin F5

**Causa raíz:** el hook `apps/web/src/hooks/use-soft-delete.tsx:20,42` sí invalida queries correctamente (`queryClient.invalidateQueries({queryKey})`), pero los `queryKey` que le pasan las pantallas **no coinciden** con el `queryKey` real usado por el `useQuery` de la lista, así que React Query no reconoce la invalidación como prefijo:

| Pantalla | Key real de la lista | Key pasada al hook | Línea |
|---|---|---|---|
| `clientes/page.tsx` | `['clientes', activeTenantId, showDeleted]` | `['clientes', showDeleted]` | :76 vs :133 |
| `cajas/page.tsx` | incluye `activeTenantId` | no lo incluye | :80 vs :157 |
| `personal/page.tsx` | incluye `activeTenantId` | no lo incluye | :97 vs :146 |
| `roles/page.tsx` | incluye `activeTenantId` | no lo incluye | :64 vs :109 |
| `clases/page.tsx` | incluye `activeTenantId` | no lo incluye | :127 vs :172 |

Como referencia de que el patrón correcto existe en el propio código: `turnos/page.tsx:129`, `productos/page.tsx:129`, `sucursales/page.tsx:99`, `planes/page.tsx:94`, `promociones/page.tsx:144` sí incluyen `activeTenantId` y no tienen el problema.

**Plan:**
1. Corregir los 5 `queryKey` para que coincidan exactamente con la key de la lista (incluir `activeTenantId`).
2. Para que la clase de bug no vuelva a aparecer: extraer un pequeño helper por módulo (o uno genérico `buildListQueryKey(entity, tenantId, showDeleted)`) usado tanto por el `useQuery` de la lista como por la llamada a `useSoftDelete`, en vez de escribir el array literal dos veces. Justificado porque ya se repitió el mismo error 5 veces de forma independiente.
3. QA manual: en cada uno de los 5 módulos, eliminar un registro y restaurarlo desde la papelera sin recargar la página, verificar que aparece/desaparece de la lista al instante.

**Esfuerzo:** ~1 punto de historia, un solo PR.

---

## 3. Calendario de clases no refresca + turnos/clases desconectados y poco prácticos

Este hallazgo mezcla dos problemas distintos: (a) un bug técnico de refresco, y (b) un problema de diseño de producto de fondo. Los trato por separado.

### 3a. Refresco del calendario (técnico, corto plazo)

**Causa raíz:** `apps/web/src/app/providers.tsx:24-26` configura React Query con `staleTime: 60000` y `refetchOnWindowFocus: false`, y no hay ningún mecanismo de refetch en segundo plano (ni polling, ni WebSocket/SSE). La invalidación local tras crear/editar una clase sí funciona (`clases/page.tsx:163`), pero cambios hechos por **otro usuario/pestaña** nunca llegan a una vista de calendario abierta.

**Plan (corto plazo, antes del rediseño):**
- Activar `refetchOnWindowFocus: true` para las queries de `clases` y `turnos` (al volver a la pestaña, refresca).
- Agregar `refetchInterval` moderado (p. ej. 30s) solo en las vistas de calendario/programación, que son las que varias personas miran a la vez en tiempo real (recepción, coordinador).
- Dejar WebSocket/SSE para verdadero tiempo real como mejora futura, no bloqueante — solo se justifica si en producción hay ediciones concurrentes frecuentes.

### 3b. Rediseño de Turnos y Clases (producto, historia mayor)

**Diagnóstico del modelo actual** (`packages/database/prisma/schema.prisma`):
- `TurnoTrabajo` (líneas 449-473): `staffId`, `sucursalId`, `fecha`, `horaEntrada`, `horaSalida` — un registro por día, por persona, cargado a mano.
- `ClaseProgramada` (líneas 475-506): `entrenadorId`, `sucursalId`, `fechaHora`, `duracionMinutos` — totalmente independiente.
- **No existe ninguna relación** entre ambos modelos. Al programar una clase, el sistema no sabe si el entrenador tiene turno asignado en ese horario ni en esa sucursal. Esto confirma el hallazgo: cargar turnos día por día es tedioso y no aporta valor si las clases no lo usan para nada.

**Propuesta de rediseño (en dos capas, reusando el patrón de "políticas de organización" ya existente en `Organizacion.configuracion`):**

1. **Turnos recurrentes (plantillas)** — nuevo modelo `TurnoPlantilla` (día de la semana, hora entrada/salida, `staffId`, `sucursalId`, vigencia desde/hasta). Los `TurnoTrabajo` diarios se generan a partir de la plantilla (proyección automática, con opción de excepción puntual: vacaciones, cambio de horario un día específico). Esto resuelve directamente la queja de "tedioso registrar turno día por día".
2. **Vínculo turno↔clase, configurable por organización:**
   - Campo `turnoId` opcional en `ClaseProgramada`, para casos donde se quiera ligar explícitamente una clase a un turno concreto.
   - Validación al crear/editar una clase: si el entrenador **no** tiene cobertura de turno (real o proyectada desde plantilla) en ese horario/sucursal, mostrar una **advertencia no bloqueante** ("Este entrenador no tiene turno registrado en este horario") — salvo que la organización, vía su `configuracion` (mismo patrón que `requerimientosCliente`), marque esta validación como estricta (bloqueante). Esto da flexibilidad: un box pequeño puede ignorarlo, una franquicia puede exigirlo.
   - Al elegir entrenador en el formulario de clase, filtrar/resaltar primero a quienes sí tienen turno vigente en esa franja — reduce el tedio de "adivinar" disponibilidad.
3. **Vista consolidada de programación:** una sola grilla semanal por sucursal que muestre turnos y clases superpuestos (turnos como franja de fondo, clases como bloques encima), en vez de dos pantallas de formularios desconectadas.

**Escenarios Gherkin (para guiar el desarrollo y los casos de prueba):**

```gherkin
Feature: Turnos recurrentes mediante plantillas
  Como coordinador de un gimnasio mediano
  Quiero definir el horario semanal habitual de un entrenador una sola vez
  Para no tener que cargar el turno día por día

  Scenario: Crear una plantilla de turno semanal
    Given soy coordinador de la sucursal "Centro"
    And el entrenador "Marta" trabaja Lunes, Miércoles y Viernes de 06:00 a 14:00
    When creo una plantilla de turno para "Marta" con esos días y horario
    Then el sistema genera automáticamente los turnos de "Marta" para las próximas semanas
    And no tengo que volver a registrar el turno manualmente cada semana

  Scenario: Excepción puntual sobre una plantilla
    Given "Marta" tiene una plantilla de turno Lunes a Viernes 06:00-14:00
    When registro que el próximo Lunes "Marta" no trabaja por vacaciones
    Then el turno proyectado de ese Lunes se marca como excepción
    And el resto de los turnos generados por la plantilla no se ven afectados


Feature: Validación de disponibilidad de entrenador al programar una clase
  Como coordinador
  Quiero que el sistema me avise si programo una clase fuera del turno de un entrenador
  Para evitar clases sin entrenador realmente disponible

  Scenario: Advertencia no bloqueante en un gimnasio mediano
    Given la organización "Box Central" no exige validación estricta de turnos
    And el entrenador "Luis" no tiene turno registrado el Martes a las 19:00
    When intento programar una clase con "Luis" el Martes a las 19:00
    Then el sistema muestra una advertencia "Luis no tiene turno en este horario"
    But me permite guardar la clase de todas formas

  Scenario: Bloqueo estricto en una franquicia
    Given la organización "Franquicia FitPro" exige validación estricta de turnos
    And el entrenador "Luis" no tiene turno registrado el Martes a las 19:00
    When intento programar una clase con "Luis" el Martes a las 19:00
    Then el sistema rechaza el guardado
    And me indica que debo asignar un turno a "Luis" primero, o elegir otro entrenador

  Scenario: Selección asistida de entrenador disponible
    Given quiero programar una clase el Miércoles de 08:00 a 09:00 en la sucursal "Norte"
    When abro el selector de entrenador
    Then los entrenadores con turno vigente en ese horario aparecen primero, marcados como "Disponible"
    And los que no tienen turno aparecen marcados como "Sin turno registrado"


Feature: Vista consolidada de programación (escala franquicia)
  Como administrador de una franquicia con varias sucursales
  Quiero ver turnos y clases juntos por sucursal
  Para detectar huecos de cobertura sin cruzar pantallas distintas

  Scenario: Ver la grilla semanal de una sucursal
    Given selecciono la sucursal "Norte" y la semana actual
    When abro la vista de programación
    Then veo los turnos del personal como franjas de fondo
    And veo las clases programadas superpuestas sobre esas franjas
    And puedo identificar a simple vista los horarios con clases pero sin turno de entrenador

  Scenario: Cambiar de sucursal dentro de la misma franquicia
    Given administro varias sucursales de "Franquicia FitPro"
    When cambio el selector de sucursal de "Norte" a "Sur"
    Then la grilla de turnos y clases se actualiza para "Sur"
    And las plantillas de turno y políticas de validación son independientes por sucursal/organización
```

**Plan de implementación sugerido (en fases, no todo junto):**
1. Fix de refresco (3a) — habilitable ya, independiente del resto.
2. Modelo `TurnoPlantilla` + generación de `TurnoTrabajo` proyectados — reemplaza la carga manual día a día.
3. Advertencia de disponibilidad al crear clase (no bloqueante por defecto) + flag de política estricta en `configuracion` de organización.
4. Selector de entrenador con indicador de disponibilidad.
5. Vista consolidada de calendario (turnos + clases).

**Criterios de aceptación (fase mínima viable — pasos 1 a 3):**
- Un coordinador crea una plantilla de turno una vez y dejan de generarse manualmente turnos día por día.
- Al programar una clase con un entrenador sin turno, aparece advertencia; si la organización tiene política estricta, el guardado se bloquea.
- El calendario de clases refleja cambios de otros usuarios sin necesitar F5, dentro de ~30s.

---

## 4. Políticas de organización no aplicadas de forma consistente en backend

**Contexto agregado en la revisión más reciente de `hallazgos.md`:** el reporte ahora aclara que este tipo de falla (política de organización que no se valida bien en backend) es la causa del **error 500 que motivó este proyecto** y que sigue generando problemas — es decir, no es una preocupación abstracta, es un patrón que ya causó daño antes. Por eso lo tratamos como crítico, no como un detalle cosmético del formulario de clientes.

**Buena noticia tras revisar la infraestructura de errores del backend:** el problema **no es sistémico** a nivel de manejo de excepciones — ya existe una base sólida:
- `apps/api/src/common/filters/global-exception.filter.ts` (registrado globalmente en `main.ts:43`) captura cualquier excepción no controlada y responde con JSON consistente (`statusCode`, `message`, `errors`) en vez de un 500 crudo sin estructura.
- `apps/api/src/common/filters/prisma-client-exception.filter.ts` traduce los errores más comunes de Prisma (`P2002` duplicado, `P2025` no encontrado, `P2003` referencia inválida) a códigos HTTP y mensajes de negocio legibles.
- El bloqueo de RLS al superadmin (punto 1) también pasa por este mismo filtro y ya devuelve 403, no 500.

Es decir: la infraestructura general para evitar 500 "crudos" ya existe y funciona. El punto débil real, confirmado en código, es específico y acotado: **`class-validator` corta la ejecución antes de que la lógica de política de la organización (`assertRequerimientosCliente`) se ejecute**, así que un DTO mal configurado (como `correo`) puede producir un error de validación que ignora por completo lo que la organización configuró. Ese es el patrón exacto que hay que blindar en todos los DTOs, no el manejo de errores en general.

**Causa raíz confirmada:** el mecanismo de políticas **sí** está bien implementado en general —
- `apps/api/src/modules/clientes/clientes.service.ts:23-44` (`assertRequerimientosCliente`) lee `Organizacion.configuracion.requerimientosCliente` y valida `exigirDni/exigirCorreo/exigirTelefono` tanto en `create` como en `update`.
- El frontend (`apps/web/src/app/dashboard/clientes/page.tsx:146-159`) lee la misma configuración para marcar campos como requeridos.

El bug puntual reportado es específico del campo `correo`:
- `apps/api/src/modules/clientes/dto/create-cliente.dto.ts:13-15` (heredado también por `update-cliente.dto.ts` vía `PartialType`) tiene `@IsEmail() @IsOptional() correo?: string`.
- `@IsOptional()` de `class-validator` solo omite la validación si el valor es `null`/`undefined` — **no** si es `''` (string vacío).
- El frontend inicializa/resetea `correo: ''` y nunca lo limpia antes de enviarlo (a diferencia de `sucursalBaseId`, que sí se borra explícitamente cuando está vacío, líneas 95-97/115-116).
- Resultado: aunque la organización no exija correo, cualquier cliente sin correo llega al backend como `correo: ""`, y `@IsEmail()` lo rechaza incondicionalmente con `"correo must be an email"` — un error que además nunca pasa por la política real de la organización, porque `class-validator` corta antes de llegar a `assertRequerimientosCliente`.

Esto explica por qué se ve "parcial": `numeroDocumento`/`telefono` usan `@IsString()` (acepta `''` sin problema), solo `correo` rompe.

**Plan:**
1. **Fix inmediato (backend):** cambiar la validación de `correo` para que no dispare con string vacío. Opción más simple y explícita:
   ```ts
   @ValidateIf((o) => !!o.correo)
   @IsEmail()
   correo?: string;
   ```
   (reemplaza `@IsOptional()` para este campo específico).
2. **Fix defensivo (frontend):** al igual que ya se hace con `sucursalBaseId`, no enviar `correo` cuando está vacío (`delete payload.correo` o `correo: correo || undefined`) antes del `apiPost`/`apiPatch` en `clientes/page.tsx`.
3. **Auditoría de alcance:** hay 3 DTOs más con `@IsEmail()` que revisar por el mismo patrón: `apps/api/src/modules/auth/dto/sign-in.dto.ts`, `apps/api/src/modules/usuario/dto/create-empleado.dto.ts`, `apps/api/src/modules/organizacion/dto/crear-organizacion.dto.ts`. En `sign-in` probablemente el correo es obligatorio (no aplica el bug); en los otros dos, confirmar si el campo es opcional y, si lo es, aplicar el mismo fix.
4. **Regla general hacia adelante (la que realmente cierra el riesgo que menciona el reporte):** cualquier campo `@IsOptional()` combinado con un validador de formato (`@IsEmail`, `@IsUrl`, `@Matches`, etc.) debe usar `@ValidateIf` en lugar de `@IsOptional`, para que un string vacío no dispare el validador de formato antes de que la política de la organización tenga oportunidad de evaluarse. Documentar esto como convención del equipo (p. ej. en `CLAUDE.md` o guía de contribución) y, si el tiempo lo permite, agregar un test de contrato que cree un cliente con todos los campos opcionales vacíos y organización sin requerimientos, para detectar regresiones de este tipo automáticamente.

**Criterios de aceptación:**
- Crear/editar un cliente sin correo, en una organización que no lo exige, guarda sin error.
- Crear/editar un cliente con correo mal formado (p. ej. `"abc"`) sigue rechazándose con `@IsEmail()`.
- Los 3 DTOs adicionales quedan revisados y, si aplica, corregidos con el mismo patrón.

**Esfuerzo:** ~1 punto de historia, un solo PR (más pequeño de todo el plan, y el que más rápido desbloquea uso real del sistema).
