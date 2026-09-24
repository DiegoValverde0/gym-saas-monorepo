# Plan de simplificación de lógica y experiencia de usuario

Fecha: 2026-09-24 · Basado en `docs/hallazgos.md` (revisión del 2026-09-24) y en una revisión del código y la base de datos actuales.

> **Convención de este documento:** todo lo que obliga a **CAMBIAR LA ESTRUCTURA DE LA BASE DE DATOS** está escrito **EN MAYÚSCULAS**. Todo lo demás se resuelve con las tablas y columnas que ya existen (principalmente el campo JSON `Organizacion.configuracion`, `Sucursal.esPrincipal` y los estados que ya tienen los modelos).
>
> **Resultado:** las fases 0 a 5 de este plan **NO NECESITAN NINGÚN CAMBIO DE BASE DE DATOS**. Los únicos cambios de estructura aparecen como opciones del modo experto (fase 6) y cada uno tiene una alternativa sin cambio de base de datos.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Principios de diseño](#2-principios-de-diseño)
3. [Diagnóstico de los hallazgos](#3-diagnóstico-de-los-hallazgos)
4. [Concepto transversal: modos de uso Simple / Intermedio / Experto](#4-concepto-transversal-modos-de-uso)
5. [Concepto transversal: sucursal predeterminada](#5-concepto-transversal-sucursal-predeterminada)
6. [Equipo (Personal)](#6-equipo-personal)
7. [Turnos → "Jornadas del equipo": cómo funciona hoy y cómo debería funcionar](#7-turnos--jornadas-del-equipo)
8. [Clases: creación inteligente y control de acceso por membresía](#8-clases)
9. [Agenda](#9-agenda)
10. [Control de acceso](#10-control-de-acceso)
11. [Resto de módulos](#11-resto-de-módulos)
12. [Consistencia de la interfaz](#12-consistencia-de-la-interfaz)
13. [Bugs y deuda técnica detectados en esta revisión](#13-bugs-y-deuda-técnica-detectados)
14. [Cambios de base de datos: resumen](#14-cambios-de-base-de-datos-resumen)
15. [Hoja de ruta por fases](#15-hoja-de-ruta-por-fases)
16. [Escenarios Gherkin de los flujos principales](#16-escenarios-gherkin)
17. [Decisiones pendientes](#17-decisiones-pendientes)

---

## 1. Resumen ejecutivo

El sistema ya tiene casi todos los datos que necesita. El problema no es de estructura sino de **flujo**: pide la misma información en varios lugares, expone conceptos técnicos (plantillas, turnos, asignaciones de acceso) a personas que no los necesitan, y no se adapta al tamaño del gimnasio.

Las seis ideas que ordenan todo el plan:

1. **Modos de uso (Simple / Intermedio / Experto).** Un solo ajuste por organización decide cuántos campos, pantallas y reglas se muestran. Un emprendedor con un box de 30 alumnos ve 4 pantallas y formularios de 3 campos; una franquicia ve todo. Se guarda en `Organizacion.configuracion.modoUso`: **sin cambio de base de datos**.
2. **Una sucursal predeterminada que manda en todo el sistema.** Se elige una vez (o viene fija si el usuario está limitado a una sucursal) y todas las pantallas la usan por defecto. Solo se elige otra sucursal donde tiene sentido: al crear una clase en el módulo Clases o al vender en otra sede. Usa `Sucursal.esPrincipal`, que ya existe.
3. **Un dato, un lugar.** La sucursal de un empleado se define una vez; el horario de una persona se define en su ficha; las reglas de quién puede reservar una clase se definen en el plan o en la disciplina. Nada se pide dos veces.
4. **Crear una clase = elegir en una grilla.** Primero qué (disciplina, duración), después dónde y con quién, y por último **el sistema muestra los horarios libres de ese instructor** para marcarlos con clics. Recurrente por defecto.
5. **Accesos siempre al día.** El dueño de un gimnasio nuevo nace con acceso a todas sus sucursales, y cualquier cambio de rol o sucursal aplica en la siguiente acción **sin cerrar sesión** (hoy la sucursal queda "congelada" en el token hasta volver a entrar, que fue lo que causó el error de Gym Diego).
6. **Reglas que hoy faltan.** Reservar una clase no valida la membresía y no se detecta que un instructor tenga dos clases a la vez. Se corrigen antes de simplificar.

---

## 2. Principios de diseño

Estos principios sirven para decidir cualquier caso que el plan no cubra:

| # | Principio | En la práctica |
|---|-----------|----------------|
| P1 | **Lo simple primero, lo avanzado a pedido.** | Los campos avanzados se esconden detrás de "Más opciones" o solo aparecen en modo experto. Nunca un formulario de más de 6 campos visibles en modo simple. |
| P2 | **Valores por defecto inteligentes.** | Sucursal = la predeterminada; vigencia = desde hoy, sin fin; duración = 60 min; cupo = el último usado. El usuario corrige solo lo que cambia. |
| P3 | **Un dato, un lugar.** | Si un dato ya se conoce (sucursal del empleado, horario del instructor), no se vuelve a pedir: se muestra y se puede cambiar desde su lugar. |
| P4 | **Lenguaje del negocio, no del sistema.** | "Horario de trabajo" en vez de "plantilla de turno"; "Quién puede reservar" en vez de "política de acceso"; "Ausencia" en vez de "estado AUSENTE". |
| P5 | **El sistema explica y sugiere.** | Cada pantalla dice en una línea para qué sirve. Los errores dicen qué hacer ("Esta persona trabaja en Sur y tu acceso es solo Sede Central; pídele al administrador que…"). |
| P6 | **Prevenir antes que rechazar.** | Si un horario choca, se marca en la grilla antes de guardar; no se descubre con un 400 al final. |
| P7 | **Coherencia entre módulos.** | Mismas palabras, mismos botones, mismos flujos de "crear / editar / eliminar / deshacer" en todo el sistema. |
| P8 | **Mínimos cambios de base de datos.** | Preferir `Organizacion.configuracion` (JSON), columnas y estados existentes. Un cambio de estructura solo si no hay alternativa razonable. |

---

## 3. Diagnóstico de los hallazgos

### 3.1 Error "Esta persona no tiene acceso a la organización" al editar a alguien del equipo

**Causa raíz (confirmada con el caso real de Gym Diego).** Son dos bugs que se encadenan:

1. **Al crear una organización, su administrador queda limitado a la sucursal inicial.** `OrganizacionService.crearOrganizacionConAdmin` crea la asignación de acceso del administrador con `sucursalId` = la primera sucursal ("Sede Central"). Un dueño de gimnasio debería nacer con acceso a **todas** las sucursales. Afecta a toda organización creada desde la plataforma (ver 13.12).
2. **La sucursal y el nombre del rol viajan dentro del token de sesión (JWT) y no se refrescan.** `diego@diego.com` se editó a sí mismo para tener acceso a todas las sucursales y el cambio se guardó. Pero su sesión seguía diciendo "Sede Central" hasta cerrar sesión y volver a entrar. Los **permisos** sí se actualizan al instante (se leen de una caché en Redis que se invalida al cambiar el acceso); la **sucursal** y el **rol** no, porque salen del token. `/auth/me` también devuelve lo que dice el token (ver 13.2).

**Efecto:** con esa sesión "vieja", la extensión de Prisma que aísla los datos por tenant (`prisma.service.ts`) agrega un filtro por sucursal a las consultas. Al editar a un empleado de la sucursal "Sur", la búsqueda de su asignación de acceso queda filtrada por "Sede Central", no la encuentra y responde el mensaje del hallazgo. Reproducido en Gym Titan con un administrador limitado a una sucursal: mismo error, misma ruta (`PATCH /personal/:id/equipo`).

**Además, el hallazgo señala un problema de diseño:** el formulario pide la sucursal de acceso y, por separado, la sucursal donde trabaja, aunque casi siempre son la misma.

**Corrección (sin cambio de base de datos):**

1. **El administrador de una organización nueva nace con acceso a todas las sucursales**, más un script para corregir los administradores ya creados (13.12).
2. **Sesión siempre al día:** la sucursal y el rol dejan de leerse del token y se resuelven en el servidor en cada petición, desde la misma caché de Redis que ya usan los permisos. Un cambio de acceso aplica en la siguiente acción, **sin cerrar sesión**, incluso si la persona se edita a sí misma (13.2 y 6.6).
3. **Un solo campo "Sucursal"** en el alta del equipo (detalle en 6.3):
   - Si la persona trabaja en **una** sucursal → esa es a la vez su acceso y su lugar de trabajo. No aparece ningún segundo selector.
   - Solo si se marca **"Trabaja en todas las sucursales"** aparece "¿Dónde trabaja habitualmente?" para su horario.
   - El valor por defecto es la sucursal predeterminada (sección 5).
4. **Regla explícita para administradores limitados a una sucursal** (caso legítimo, por ejemplo un encargado de sede): solo ven y gestionan al personal de su sucursal o al que tiene acceso a todas. El listado se filtra igual que la edición, así que lo que se ve se puede editar.
5. **Mensaje claro** si igual ocurre: "Jose trabaja en la sucursal Sur y tu acceso está limitado a Sede Central. Pide a un administrador con acceso a todas las sucursales que haga este cambio."

### 3.2 Doble selección de sucursal (acceso vs. lugar de trabajo)

Hoy el formulario de 3 pasos pide:

- Paso 1: "Acceso a sucursales" (todas / solo X), que se guarda en `AsignacionAcceso.sucursalId`.
- Paso 3: "Sucursal donde trabaja", que se guarda en `TurnoPlantilla.sucursalId`.

Son el mismo concepto para el 95 % de los gimnasios. Se unifican como se describe en 3.1 y 6.3. El segundo selector solo existe si la persona tiene acceso a todas las sucursales, y aun así viene prellenado con la sucursal predeterminada.

### 3.3 "No entiendo para qué sirve el registro de turnos de trabajo"

Explicación completa del flujo actual en la sección 7.1 y rediseño en 7.2. En resumen: hoy "Turnos" es una lista técnica de filas día por día que casi nadie necesita mirar. Se convierte en **"Jornadas del equipo"**, una pantalla que responde tres preguntas: **¿quién debería estar hoy? ¿quién llegó? ¿quién falta?**, con un botón para registrar ausencias por rango de fechas (vacaciones, licencias). En modo simple directamente no existe.

### 3.4 Creación de clases incoherente y poco inteligente

Problemas confirmados en el código:

1. **El orden de los datos no sigue el razonamiento del usuario.** El formulario pide nombre, disciplina, sucursal, días, hora, duración, entrenador, cupos, vigencia y descripción en un solo bloque. El usuario piensa en otro orden: sucursal → instructor → cuándo puede ese instructor.
2. **No muestra los horarios disponibles.** El selector de entrenador avisa si hay turno, pero no ofrece los huecos libres.
3. **No detecta choques:** un instructor puede quedar con dos clases a la misma hora. No existe ninguna validación de solapamiento.
4. **Reservar una clase no valida la membresía.** `reserva-clase.service.ts` solo controla capacidad, fecha y estado de la clase: cualquier cliente puede reservar aunque no tenga membresía o su plan no incluya clases.
5. **No se puede decir quién puede reservar** (clase abierta, solo miembros, solo ciertos planes).
6. **Dos pestañas (Clases / Clases recurrentes)** obligan a entender la diferencia entre plantilla y ocurrencia.

Rediseño completo en la sección 8.

### 3.5 Sucursal predeterminada

Hoy cada pantalla resuelve la sucursal a su manera: Control de acceso y Agenda recuerdan una propia, Clases pide elegirla, Clientes usa `sucursalBaseId`, y los usuarios limitados la tienen fija. Se reemplaza por **una sola sucursal activa global** (sección 5).

### 3.6 Complejidad general: el sistema no se adapta al usuario

Un pequeño emprendedor ve lo mismo que una franquicia: plantillas, turnos, roles personalizados, políticas estrictas, arqueos de caja y promociones con fechas. Se resuelve con los modos de uso (sección 4).

---

## 4. Concepto transversal: modos de uso

### 4.1 Qué es un modo

Un ajuste de la organización que decide **cuánto detalle** muestra el sistema. No borra datos ni cambia reglas guardadas: si un gimnasio pasa de Experto a Simple, todo lo configurado sigue ahí, solo se oculta.

| Modo | Para quién | Idea central |
|------|------------|--------------|
| **Simple** | Emprendedor, un solo local, pocas personas, primera vez con un sistema. | "Registro clientes, vendo membresías, controlo quién entra." Todo con valores por defecto y sin configuración previa. |
| **Intermedio** | Gimnasio establecido, algunas personas de equipo, quizá 2 sucursales. | Horarios del equipo, clases con reservas, gastos, reportes básicos. |
| **Experto** | Franquicias, cadenas, gimnasios con administración formal. | Todas las reglas, validaciones estrictas, roles a medida, arqueos, auditoría, costos. |

### 4.2 Cómo se guarda (SIN cambio de base de datos)

En `Organizacion.configuracion` (JSON), junto a `modulos` y `requerimientosCliente`, que ya existen:

```json
{
  "modoUso": "simple",
  "modulos": { "puntoVenta": true, "clasesGrupales": true, "controlPersonal": false, "controlAcceso": true, "controlGastos": false, "reportesAvanzados": false },
  "requerimientosCliente": { "exigirDni": false, "exigirCorreo": false, "exigirTelefono": true },
  "requerimientosClase": { "exigirTurnoEntrenador": false },
  "accesoClases": { "...": "ver 8.4" },
  "jornadas": { "toleranciaAtrasoMinutos": 10 }
}
```

- Backend: `modoUso` se lee con una función similar a `moduloEstaActivo()` (`modo.util.ts`). **Por defecto: `intermedio`**, para que los gimnasios existentes no pierdan nada visible al desplegar.
- Frontend: hook `useModoUso()` (igual que `useModulosActivos()`) y un componente `<SoloEnModo minimo="intermedio">` para envolver campos y secciones.

### 4.3 Modos y módulos: cómo conviven

- Los **módulos** deciden **qué funcionalidades existen** (clases, personal, gastos…).
- El **modo** decide **cuánto detalle** tiene cada funcionalidad activa.
- Al elegir un modo, el sistema **sugiere** un conjunto de módulos (ver 4.5), pero el usuario puede ajustarlos.

### 4.4 Matriz de visibilidad por modo

Leyenda: ✅ visible · ➖ oculto · 🔧 visible bajo "Más opciones".

| Módulo / función | Simple | Intermedio | Experto |
|---|---|---|---|
| **Clientes**: nombre, teléfono, documento | ✅ | ✅ | ✅ |
| Clientes: contacto de emergencia, condiciones médicas, deslinde, foto | 🔧 | 🔧 | ✅ |
| Clientes: sucursal base | ➖ (usa la predeterminada) | ✅ si hay >1 sucursal | ✅ |
| **Planes**: tipo (mensual / por sesiones), precio, duración | ✅ | ✅ | ✅ |
| Planes: días permitidos, límite de días por semana, franja horaria | ➖ | 🔧 | ✅ |
| Planes: renovación automática | ➖ | 🔧 | ✅ |
| Planes: qué clases incluye | "Incluye todas las clases" sí/no | Por disciplina | Por disciplina + reglas por clase (fase 6) |
| **Venta de membresía**: cliente → plan → pago | 1 pantalla | 3 pasos | 3 pasos + promociones + pagos mixtos |
| **Promociones** | ➖ (descuento manual en la venta) | ✅ | ✅ |
| **Control de acceso**: buscar y registrar ingreso | ✅ | ✅ | ✅ |
| Control de acceso: visitantes / pase de día | ➖ | ✅ | ✅ |
| Control de acceso: forzar ingreso, múltiples ingresos por día | ➖ | ➖ | ✅ |
| Control de acceso: modo kiosco (tablet en la entrada) | ➖ | 🔧 | ✅ |
| **Equipo**: nombre, correo, rol simple | ✅ | ✅ | ✅ |
| Equipo: disciplinas que imparte | ➖ (si no hay clases) / ✅ | ✅ | ✅ |
| Equipo: horario semanal | ➖ ("sin horario fijo") | ✅ | ✅ |
| Equipo: contratación, costo por hora, comisión | ➖ | 🔧 | ✅ |
| **Jornadas del equipo** (ex Turnos) | ➖ | Hoy + ausencias | Hoy + ausencias + marcaje + atrasos + horas/costos |
| **Roles** | 3 roles fijos con explicación, sin pantalla de roles | Roles base editables (solo el superadmin, como hoy) | Roles propios de la organización |
| **Clases**: crear clase recurrente con el asistente | ✅ | ✅ | ✅ |
| Clases: quién puede reservar | "Cualquier miembro activo" fijo | Abierta / miembros / planes (por disciplina) | + reglas por clase (fase 6) |
| Clases: validación estricta de turno del instructor | ➖ | 🔧 | ✅ |
| Clases: excepciones por fecha, pausar serie, vigencia | ➖ | 🔧 | ✅ |
| **Agenda** | ➖ (en simple, el calendario de Clases alcanza) | ✅ | ✅ |
| **Cajas**: abrir/cerrar caja del día | Caja única automática por sucursal | ✅ | ✅ + varias cajas + arqueo detallado |
| **Productos**: vender productos | ✅ (sin stock) | ✅ + stock simple | ✅ + stock por sucursal, punto de reorden, bodega |
| **Gastos** | "Registrar gasto" (monto, concepto, fecha) | + proveedores + recurrentes | + categorías, comprobantes, reportes |
| **Reportes** | Resumen del día y del mes | + por plan, por clase, asistencia | + financieros, costos de personal, auditoría |
| **Configuración** | Mi gimnasio, módulos, modo | + reglas de clientes y clases | Todo |

### 4.5 Asistente de inicio (onboarding) y plantillas por tipo de gimnasio

Al crear una organización (o desde Configuración → "Cambiar modo"), el administrador responde 3 preguntas en lenguaje simple:

1. **¿Qué tipo de gimnasio es?** Musculación · Box / CrossFit · Estudio (yoga, pilates, danza) · Artes marciales / academia · Otro.
2. **¿Cuántas personas trabajan contigo?** Solo yo · 2 a 5 · Más de 5.
3. **¿Das clases grupales con horario?** Sí / No.

Con eso el sistema propone modo y módulos:

| Respuestas | Modo sugerido | Módulos sugeridos |
|---|---|---|
| Musculación + solo yo + sin clases | Simple | Clientes, venta de membresías, control de acceso, caja |
| Box/Estudio + 2 a 5 + con clases | Intermedio | + clases con reservas, equipo con horario, agenda |
| Cualquier tipo + más de 5 o varias sucursales | Experto (sugerido, no forzado) | Todos |

Además crea **datos de ejemplo opcionales** (un plan "Mensual", un plan "10 sesiones", una disciplina según el tipo de gimnasio) y muestra en el Dashboard una **lista de primeros pasos**: 1) revisa tu plan, 2) registra tu primer cliente, 3) vende su membresía, 4) registra su ingreso. Cada paso lleva a la pantalla correspondiente y se marca solo cuando se cumple.

Sin cambio de base de datos: las respuestas se guardan en `configuracion.onboarding`.

---

## 5. Concepto transversal: sucursal predeterminada

### 5.1 Reglas

1. **Usuario limitado a una sucursal** (su `AsignacionAcceso.sucursalId` no es nulo): esa es su sucursal, fija y sin selector. Todo el sistema trabaja en ella.
2. **Usuario con acceso a todas las sucursales:** hay un **selector de sucursal en la barra superior**, junto al selector de organización del superadmin.
   - Valor inicial: la sucursal marcada como **Sede Principal** (`Sucursal.esPrincipal`, que ya existe).
   - Si el usuario elige otra, se recuerda en su navegador.
3. **Una sola sucursal en la organización:** el selector no aparece nunca.
4. **Todas las pantallas usan la sucursal activa por defecto:** Control de acceso, Agenda, Clases (calendario), Jornadas, Caja, venta de membresías, stock de productos, alta de clientes y de equipo.
5. **Dónde sí se elige otra sucursal explícitamente** (y en ningún otro lugar):
   - **Crear o editar una clase desde el módulo Clases**: campo "Sucursal", prellenado con la activa. Desde la **Agenda** o el calendario **no** se cambia: se crea en la sucursal que se está viendo, como pide el hallazgo.
   - **Equipo** con "Trabaja en todas las sucursales": "¿Dónde trabaja habitualmente?".
   - **Reportes** en modo experto: filtro "Todas las sucursales".
6. **Listados con datos de varias sucursales** (clientes, membresías): muestran la sucursal activa por defecto y ofrecen el filtro "Todas" solo a quien tiene acceso total.

### 5.2 Implementación (SIN cambio de base de datos)

- Frontend: un store global `useSucursalActiva()` (Zustand, como `useTenantStore`) que resuelve la sucursal según las reglas de 5.1 y la guarda en `localStorage`. Reemplaza las lógicas sueltas de Control de acceso (`asistencias.sucursalId`) y Agenda (`agenda.sucursalId`).
- API client: enviar la sucursal activa en una cabecera (`x-sucursal-id`) **solo como preferencia** para valores por defecto. **Nunca** como permiso: el aislamiento real sigue saliendo de la asignación del usuario.
- Sucursales: al crear la primera sucursal se marca automáticamente como principal. Si se desactiva la principal, se pide elegir otra.

> **OPCIONAL, CAMBIO DE BASE DE DATOS (NO RECOMENDADO POR AHORA): COLUMNA `USUARIOS.SUCURSAL_PREFERIDA_ID`** para que la preferencia viaje entre dispositivos. La preferencia en el navegador más `esPrincipal` cubren el caso real; solo se justificaría si muchos administradores alternan de computadora.

---

## 6. Equipo (Personal)

### 6.1 Problemas actuales

- Doble selección de sucursal (3.2) y error al editar (3.1).
- Conceptos técnicos a la vista: "tipo de contratación", "costo por hora", "comisión %" aparecen para todos.
- La lista de roles del sistema (ADMIN_GYM, ENTRENADOR, RECEPCIONISTA) se muestra con su nombre técnico y sin explicar qué puede hacer cada uno.
- Existen dos pantallas para "personas que entran al sistema": **Usuarios** y **Personal**. Un mismo empleado puede aparecer en las dos y no queda claro cuál usar.

### 6.2 Modelo mental propuesto

> **"Equipo" es la única pantalla para las personas que trabajan en el gimnasio.** Cada persona tiene: quién es, qué puede hacer (rol), dónde trabaja y, si corresponde, qué clases da y su horario.

- **Usuarios** queda solo para el modo experto como "Accesos avanzados" (cuentas que no son empleados, por ejemplo un contador externo con acceso de lectura, o cuentas de clientes para el portal).
- **Roles con nombre y explicación humana** (sin cambiar los roles guardados):

| Rol guardado | Cómo se muestra | Explicación en el formulario |
|---|---|---|
| ADMIN_GYM | **Administrador** | Puede ver y cambiar todo en el gimnasio, incluido el equipo y la configuración. |
| RECEPCIONISTA | **Recepción** | Registra clientes, vende membresías, cobra y controla el ingreso. |
| ENTRENADOR | **Instructor** | Ve sus clases, sus alumnos y su horario; marca asistencia a sus clases. |
| (roles propios) | Su nombre | Solo en modo experto. |

### 6.3 Formulario de alta por modo

**Modo simple, una sola pantalla y 4 campos:**

1. Nombre completo
2. Correo o teléfono (para iniciar sesión)
3. Rol: Administrador / Recepción / Instructor, con la explicación de 6.2
4. Contraseña inicial, con un botón "Generar" que la muestra para copiarla o enviarla por WhatsApp

La sucursal se toma de la predeterminada. No hay horario: la persona queda "sin horario fijo".

**Modo intermedio, 3 pasos:**

1. **¿Quién es?** Nombre, correo, teléfono, contraseña (o "Generar").
2. **¿Qué hace y dónde?**
   - Rol (con explicación).
   - **Sucursal**: una sola lista, prellenada con la sucursal activa, más la opción "Todas las sucursales".
     - Si elige una sucursal: es su acceso **y** su lugar de trabajo. No aparece nada más.
     - Si elige "Todas": aparece "¿Dónde trabaja habitualmente?", prellenado con la sucursal activa, usado para su horario.
   - Disciplinas que imparte (solo si el rol es Instructor y el módulo de clases está activo).
3. **¿Cuándo trabaja?** "Tiene horario fijo" / "Sin horario fijo". Si tiene horario, se muestra la grilla semanal actual con **plantillas rápidas**: "Lunes a viernes 8 a 16", "Mañanas (6 a 14)", "Tardes (14 a 22)", "Personalizado".

**Modo experto:** lo mismo que el intermedio, más una sección "Contratación y pagos" (tipo de contratación, costo por hora, comisión) y **varios bloques por día** (turno partido 6-10 y 16-20). Ver 13.8: no necesita cambio de base de datos.

### 6.4 Reglas de negocio nuevas

1. **Administrador limitado a una sucursal**: solo ve y gestiona al equipo cuya sucursal es la suya o "Todas" (3.1). Su lista de sucursales en el formulario tiene una sola opción: la suya.
2. **El correo ya existe:**
   - Si ya es parte del equipo, se ofrece abrir su ficha.
   - Si tiene cuenta en otro gimnasio de la plataforma, se reutiliza y se avisa que usará su contraseña actual (ya implementado).
3. **Cambio de rol o de sucursal**: aplica en la siguiente acción de esa persona, sin cerrar su sesión (6.6 y 13.2).
4. **Quitar a alguien del equipo**: un solo botón "Dar de baja" que desactiva el perfil, **revoca su acceso** y cierra su sesión. Hoy eliminar el perfil de staff no quita el acceso del usuario. Sus clases futuras quedan "sin instructor" y aparecen en los huecos de cobertura de la Agenda.

### 6.5 Ficha de la persona (nueva vista, sin cambio de base de datos)

Al tocar a alguien del equipo se abre su ficha, no el formulario:

- Datos y rol, con el botón "Editar".
- **Esta semana**: horario, clases que da y ausencias.
- **Sus clases recurrentes** (enlace a cada una).
- En experto: **horas trabajadas del mes**, atrasos y costo estimado (a partir del marcaje y `costoPorHora`).

### 6.6 Gestión cómoda de accesos y sesiones (sin cambio de base de datos)

Objetivo: que un cambio de acceso nunca obligue a "cerrar sesión y volver a entrar", y que siempre sea evidente con qué acceso está trabajando cada persona.

**a) Acceso resuelto en el servidor en cada petición.** El token de sesión solo identifica a la persona y su organización. El rol y la sucursal se leen de la asignación vigente, con caché en Redis (la misma clave `rbac:<usuario>:<organización>` que ya usan los permisos, ampliada para guardar también rol y sucursal).
- Cualquier cambio de acceso (Equipo, Usuarios, edición de roles) invalida esa caché, como ya ocurre con los permisos. La siguiente petición usa el acceso nuevo.
- `/auth/me` devuelve el acceso vigente y no el del token. El frontend refresca `/auth/me` al volver a la pestaña y después de guardar cambios en el equipo, así el menú, la barra superior y la sucursal activa se actualizan solos.
- Se elimina la causa del bug: ya no hay dos fuentes de verdad (token y base de datos) para el mismo dato.

**b) Al editarse a sí mismo.** Si un administrador cambia su propio rol o sucursal, la pantalla se actualiza en el acto y muestra un aviso: "Tu acceso cambió: ahora trabajas con **todas las sucursales**". Nada de cerrar sesión.
- Protección: un administrador no puede quitarse a sí mismo el rol de Administrador si es el último de la organización ("Tiene que quedar al menos un administrador con acceso a todas las sucursales").

**c) Indicador de acceso en la barra superior.** Junto al selector de sucursal, una etiqueta con el alcance actual: "Todas las sucursales" o "Solo Sede Central (acceso limitado)". Al tocarla se explica qué significa y quién puede cambiarlo.

**d) Acciones de soporte en la ficha de una persona** (modo intermedio y experto):
- **"Cerrar sus sesiones"**: fuerza un nuevo inicio de sesión en todos sus dispositivos (celular perdido, cambio de contraseña, baja). Usa la revocación `isRevokedUser` que ya existe.
- **"Restablecer contraseña"**: genera una contraseña temporal para copiar o enviar por WhatsApp.
- **Última actividad**: cuándo usó el sistema por última vez (dato de sesión que ya se registra en Redis).

**e) Diagnóstico de acceso para el superadmin.** En la plataforma, al ver una organización: lista de administradores con su alcance y un aviso si alguno está limitado a una sola sucursal ("Este gimnasio no tiene ningún administrador con acceso a todas sus sucursales"). El botón "Dar acceso a todas las sucursales al administrador" es una **acción de plataforma acotada y auditada**, igual que el alta de organización con su administrador: el superadmin sigue sin poder escribir ningún otro dato del gimnasio.

---

## 7. Turnos → "Jornadas del equipo"

### 7.1 Cómo funciona hoy, paso a paso

Explicación pedida en el hallazgo del flujo **actual** completo:

```
┌──────────────────────────┐
│ 1. Horario semanal        │  Se define en Personal (paso 3 del formulario).
│    (TurnoPlantilla)       │  Ej.: Marta, lunes, miércoles y viernes de 6 a 14 en Sede Central.
└────────────┬─────────────┘
             │ al guardar el horario, y cada noche a la 1:00 (cron)
             ▼
┌──────────────────────────┐
│ 2. Turnos del día         │  El sistema crea una fila por persona y por día para las próximas
│    (TurnoTrabajo)         │  8 semanas, en estado PROGRAMADO. Es la "agenda laboral" concreta.
└────────────┬─────────────┘
             │ se usan para tres cosas
             ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 3a. Disponibilidad de instructores: al crear una clase se verifica si el     │
│     instructor tiene un turno que la cubra (aviso o bloqueo según la regla).  │
│ 3b. Marcaje real: el empleado pulsa "Marcar entrada / salida" (tarjeta "Mi    │
│     turno" en Control de acceso). Queda la hora real y el turno pasa a        │
│     COMPLETADO.                                                               │
│ 3c. Agenda: los turnos se dibujan como franjas y muestran huecos de cobertura. │
└────────────┬──────────────────────────────────────────────────────────────┘
             │ cuando algo cambia en un día puntual
             ▼
┌──────────────────────────┐
│ 4. Excepciones            │  En Turnos se marca un turno como AUSENTE o CANCELADO (vacaciones,
│    (pantalla Turnos)      │  enfermedad) o se agrega un turno extra. El cron no pisa esas filas.
└──────────────────────────┘
```

**Por qué confunde:** la pantalla Turnos muestra el **paso 2**, una tabla de cientos de filas técnicas, cuando lo que el usuario necesita es el **paso 4** (registrar una ausencia) y saber **qué pasa hoy**. Además, marcar una ausencia de dos semanas obliga a editar 10 filas una por una.

### 7.2 Rediseño: "Jornadas del equipo"

La pantalla cambia de nombre y de propósito. Tres vistas:

**a) Hoy (vista por defecto).** Una tarjeta por persona con turno hoy en la sucursal activa:

| Persona | Horario | Estado | Acción |
|---|---|---|---|
| Marta | 06:00 – 14:00 | 🟢 Llegó 05:55 | Marcar salida |
| Luis | 08:00 – 16:00 | 🟠 Atrasado 12 min (no marcó) | Marcar entrada · Registrar ausencia |
| Ana | 14:00 – 22:00 | ⚪ Aún no empieza | — |
| Pedro | — | 🔴 Ausente (vacaciones hasta el 30) | Ver |

Estados calculados, sin cambio de base de datos: PROGRAMADO + hora actual + `horaIngresoReal` + tolerancia (`configuracion.jornadas.toleranciaAtrasoMinutos`).

**b) Semana.** La misma grilla que la Agenda, filtrada a turnos: permite ver y editar un día puntual ("cambiar horario solo este día", "agregar turno extra").

**c) Ausencias.** Lista de ausencias futuras y pasadas con el botón **"Registrar ausencia"**:

- Persona · Desde · Hasta · Motivo (Vacaciones / Enfermedad / Permiso / Otro) · Nota.
- Al guardar, se marcan como AUSENTE todos los turnos de ese rango. Los días del rango que todavía no tienen turno generado se crean ya marcados como AUSENTE, así el cron no los vuelve a programar.
- Muestra el impacto antes de confirmar: "Pedro tiene 4 clases en ese rango: quedarán sin instructor. [Ver clases] [Asignar reemplazo]".

**Endpoint nuevo, sin cambio de base de datos:** `POST /turnos/ausencias { staffId, desde, hasta, motivo }` usa `EstadoTurno.AUSENTE` y `motivoAusencia`, que ya existen. La lista de ausencias se arma agrupando turnos AUSENTE consecutivos de la misma persona y motivo.

### 7.3 Por modo

| | Simple | Intermedio | Experto |
|---|---|---|---|
| Jornadas | Oculto. Nadie necesita cargar horarios. | Hoy + Ausencias. | Hoy + Semana + Ausencias + marcaje obligatorio + reporte de horas, atrasos y costo. |
| Marcaje de entrada/salida | — | Opcional ("Mi turno") | Obligatorio y visible en reportes |
| Validación de clases contra turnos | — | Aviso | Aviso o bloqueo (regla existente `exigirTurnoEntrenador`) |

### 7.4 Marcaje del equipo

Hoy la tarjeta "Mi turno" vive solo en Control de acceso. Propuesta:

- En la barra superior, un botón **"Marcar entrada"** / **"Marcar salida"** visible para cualquier persona del equipo con turno hoy.
- En modo kiosco (10.3), el empleado marca con su PIN en la misma tablet de la entrada. `MetodoValidacion.CODIGO_PIN` ya existe para clientes; para el equipo alcanza con un PIN guardado en `PerfilStaff`… **OJO: ESO SÍ SERÍA UNA COLUMNA NUEVA (`PERFILES_STAFF.PIN_HASH`)**. Alternativa sin cambio de base de datos: el empleado inicia sesión con su correo en el celular y marca desde ahí. **Recomendación: empezar con el celular; el PIN queda para la fase 6.**

---

## 8. Clases

### 8.1 Modelo mental propuesto

> **Una clase es algo que se repite cada semana** (Spinning, martes y jueves 18:00). Cada fecha concreta es una "sesión" de esa clase. Las clases sueltas (un taller único) son el caso especial.

- **Una sola pantalla "Clases"** con el calendario como vista principal. Se elimina la pestaña separada "Clases recurrentes".
- Al tocar una sesión en el calendario:
  - **"Solo esta sesión"**: cambiar la hora, cancelar esta fecha o asignar un reemplazo.
  - **"Toda la clase"**: editar la serie (ya existe `PUT /clases-plantilla/serie`).
  - Es el mismo modelo que Google Calendar, que casi todos los usuarios ya conocen.
- Lista lateral "Mis clases" (las series), con días, hora, instructor y ocupación promedio.

### 8.2 Asistente "Nueva clase", en el orden que pide el hallazgo

**Paso 1 · ¿Qué clase?**
- Disciplina (lista). Al elegirla se sugiere el nombre ("Spinning"), editable.
- **Duración**: botones 30 · 45 · 60 · 90 min · otra.
- **Cupo**: número, por defecto el último usado para esa disciplina.

**Paso 2 · ¿Dónde y con quién?**
- **Sucursal**: prellenada con la activa. Solo es editable si se crea desde el módulo Clases y el usuario tiene acceso a todas; desde la Agenda viene fija.
- **Instructor**: solo los que imparten esa disciplina y trabajan en esa sucursal, ordenados por disponibilidad. Opción "Sin instructor por ahora".

**Paso 3 · ¿Cuándo? (grilla inteligente)**

Una grilla semanal (lunes a domingo × horas del día) que muestra:

- 🟩 **Verde**: el instructor trabaja y está libre durante toda la duración elegida → se puede marcar.
- 🟨 **Amarillo**: está libre pero fuera de su horario de trabajo → se puede marcar con aviso (o no, si la regla estricta está activa).
- 🟥 **Rojo**: ya da otra clase o está ausente → no se puede marcar.
- Las otras clases de la sucursal aparecen en gris como referencia.

El usuario **hace clic en las celdas** para elegir día y hora de inicio. Cada clic crea un bloque del alto de la duración elegida, y puede marcar varios días a la vez. Debajo, un resumen en palabras: "Martes y jueves de 18:00 a 19:00".

- Casilla "Es una clase única" → en vez de la grilla semanal, un selector de fecha y hora.
- **Vigencia** 🔧: por defecto "desde hoy, sin fecha de fin".

**Paso 4 · ¿Quién puede reservar?** (8.4)
- ⚪ Cualquier cliente con membresía activa (por defecto)
- ⚪ Solo ciertos planes: casillas con los planes
- ⚪ Abierta a todos, incluso sin membresía (clase de prueba, evento)
- En experto: "Descuenta una sesión a planes por sesiones" sí/no.

**Paso 5 · Resumen y confirmar**
"Se programarán **16 sesiones** de Spinning en las próximas 8 semanas en Sede Central con Marta. Las siguientes se crearán automáticamente cada semana."

Por modo:
- **Simple**: pasos 1-3 en una sola pantalla. El paso 4 queda fijo en "cualquier miembro activo".
- **Intermedio**: los 5 pasos.
- **Experto**: los 5 pasos más "Más opciones" (vigencia, pausa, descuento de sesiones, regla estricta).

**Endpoint nuevo, sin cambio de base de datos:** `GET /clases/horarios-disponibles?sucursalId&entrenadorId&duracionMinutos&desde`. Devuelve, por día de la semana, los tramos donde el instructor está libre (horario semanal − clases de sus series − ausencias futuras) y los tramos ocupados por otras clases de la sucursal. Se construye con `TurnoPlantilla`, `ClasePlantilla` y `TurnoTrabajo`, que ya existen.

### 8.3 Choques de horario (regla nueva, sin cambio de base de datos)

- Al crear o editar una clase o serie: **error** si el instructor ya tiene otra clase que se solapa en esa fecha u horario. Mensaje: "Marta ya da Yoga los martes de 18:30 a 19:30".
- **Aviso** (no error) si la sucursal ya tiene otra clase a la misma hora. Puede ser válido si hay varias salas; ver 13.9 sobre salas.
- La grilla del paso 3 evita el caso antes de llegar al backend (P6).

### 8.4 Quién puede reservar: control de acceso por membresía

**Hoy no existe ninguna regla** y cualquier cliente reserva. Propuesta en dos niveles.

**Nivel A: por disciplina, desde el plan (SIN cambio de base de datos). Recomendado para empezar.**

Las reglas se guardan en `Organizacion.configuracion.accesoClases`:

```json
{
  "accesoClases": {
    "porDefecto": "MIEMBROS",
    "porDisciplina": {
      "<id disciplina Spinning>": { "modo": "PLANES", "planIds": ["<Plan Full>", "<Plan Premium>"] },
      "<id disciplina Clase de prueba>": { "modo": "ABIERTA" }
    }
  }
}
```

- **Dónde se edita:**
  - En el **plan** ("Este plan incluye: ☑ Spinning ☑ Yoga ☐ Pilates"). Es donde el dueño piensa: "el plan Full incluye clases".
  - En el **paso 4 del asistente de clase**, que muestra la regla de la disciplina con un enlace para cambiarla.
- **Modos:**
  - `ABIERTA`: cualquiera puede reservar, incluso sin membresía.
  - `MIEMBROS`: cualquier membresía activa.
  - `PLANES`: solo los planes listados.
- **Validación al reservar** (`reserva-clase.service.ts`): cliente con membresía ACTIVA en la fecha de la clase → plan permitido para la disciplina → si el plan es por sesiones, que le queden sesiones. Mensaje claro si no cumple: "El plan Mensual Básico de Juan no incluye Spinning". Recepción puede forzar, con el mismo permiso `asistencias:forzar`.
- **Clases sin disciplina:** usan `porDefecto`.

**Nivel B: por clase individual (CAMBIO DE BASE DE DATOS). Solo si el nivel A no alcanza.**

> **CAMBIO DE BASE DE DATOS (OPCIONAL, FASE 6): AGREGAR A `CLASES_PLANTILLA` Y A `CLASES_PROGRAMADAS` LA COLUMNA `ACCESO` (ENUM `ABIERTA` / `MIEMBROS` / `PLANES`) Y UNA TABLA NUEVA `CLASES_PLANTILLA_PLANES` (CLASE_PLANTILLA_ID, PLAN_ID).**
>
> Se justifica solo si un gimnasio necesita que **dos clases de la misma disciplina** tengan reglas distintas (por ejemplo, "Spinning 7:00 solo plan Mañanas" y "Spinning 19:00 para todos"). Para la mayoría de los gimnasios el nivel A es suficiente, y siempre se puede separar en dos disciplinas ("Spinning" y "Spinning Mañanas") sin tocar la base de datos.

**"Clase abierta para toda la organización":** ver decisión pendiente D2. Puede significar "sin exigir membresía" (modo `ABIERTA`) o "reservable por clientes de cualquier sucursal". Hoy las reservas no filtran por sucursal del cliente, así que lo segundo ya ocurre. Si se quiere restringir por sucursal, la regla va también en `accesoClases`, sin cambio de base de datos.

### 8.5 Reservas: mejoras de experiencia

- Desde la sesión: buscar cliente → el sistema muestra al instante si **puede** reservar (verde) o por qué no (rojo), igual que el semáforo de Control de acceso.
- Lista de espera cuando la clase está llena 🔧 experto. **OJO: UN ESTADO NUEVO `EN_ESPERA` EN `ESTADORESERVA` ES UN CAMBIO DE BASE DE DATOS (ENUM).** Alternativa sin cambio: guardar la lista de espera en `configuracion` no es razonable, así que la lista de espera queda como **opcional de fase 6**.
- Al cancelar una sesión (8.1 "Solo esta sesión → Cancelar"): avisar cuántos clientes tenían reserva y marcar esas reservas como CANCELADA automáticamente.

### 8.6 Generación automática: horizonte configurable

Hoy se generan 8 semanas fijas. Se hace configurable en `configuracion.clases.semanasProyeccion` (4 a 12) 🔧 experto. El hallazgo menciona "el próximo mes se generan solos": con 8 semanas ya se cumple, y el cron nocturno mantiene siempre esa ventana hacia adelante.

---

## 9. Agenda

- **Siempre en la sucursal activa** (5.1). El selector de sucursal propio desaparece; se cambia desde la barra superior.
- **Clic en un hueco → asistente de clase con la sucursal fija** y el paso 3 prellenado con ese día y hora.
- **Clic en un turno** → ficha de la persona con "Registrar ausencia" (7.2c).
- **Panel "Huecos de cobertura"** con acción directa: "Asignar instructor" abre un selector solo con los disponibles a esa hora.
- **Modo simple**: la Agenda no aparece. El calendario de Clases cubre ese caso.
- **Vista "Día"** en celular: la grilla semanal no entra en una pantalla chica. En celular se muestra una lista del día con los turnos y las clases en orden.

---

## 10. Control de acceso

### 10.1 Por modo

| | Simple | Intermedio | Experto |
|---|---|---|---|
| Buscar cliente y registrar ingreso | ✅ | ✅ | ✅ |
| Semáforo de validación (membresía, días, horario, sesiones) | ✅ | ✅ | ✅ |
| Visitantes / pase de día | ➖ | ✅ | ✅ |
| Forzar ingreso con motivo | ➖ | ➖ | ✅ |
| Registrar salida | Automática al día siguiente (cron existente) | Manual u automática | Manual obligatoria |
| Modo kiosco | ➖ | 🔧 | ✅ |

### 10.2 Mejoras

- **Venta rápida desde el semáforo rojo:** si el motivo es "sin membresía activa" o "vencida", el botón **"Vender / renovar membresía"** abre la venta con el cliente ya elegido. Es el flujo más común en recepción y hoy obliga a cambiar de pantalla.
- **Alta rápida:** si la búsqueda no encuentra al cliente, "Registrar cliente nuevo" con nombre y teléfono, y seguir con la venta.
- **Pase de día cobrado:** en modo intermedio, "Pase de día" con precio configurable que se cobra en la caja activa. Usa la transacción existente, sin cambio de base de datos.

### 10.3 Modo kiosco (sin cambio de base de datos)

Una pantalla a pantalla completa para una tablet en la entrada: el cliente escribe su documento, el sistema valida y muestra "Bienvenido, Juan" en verde o "Pasa por recepción" en rojo. Sale con un PIN del administrador (guardado en `configuracion.kiosco.pinHash`). Usa `MetodoValidacion.CODIGO_PIN` o `MANUAL`, que ya existen.

---

## 11. Resto de módulos

Para cada módulo: qué molesta hoy y qué cambia por modo. Ninguno necesita cambio de base de datos.

### 11.1 Clientes
- **Hoy:** formulario con 12+ campos visibles, estado "Moroso" manual y sucursal base a elegir.
- **Propuesta:**
  - Simple: nombre, teléfono y documento (según las reglas de la organización). El resto va bajo "Más datos".
  - Estado calculado automáticamente a partir de las membresías: Activo / Por vencer / Vencido / Sin membresía. Ya existe el cálculo de `segmento`; se usa en vez del estado manual.
  - Sucursal base = la sucursal activa, sin preguntar en modo simple.
  - **Ficha 360 del cliente:** membresía actual, días que le quedan, últimas asistencias, reservas próximas, pagos. Con botones "Renovar", "Registrar ingreso" y "Reservar clase".

### 11.2 Planes
- **Hoy:** asistente de 3 pasos con conceptos avanzados (límite de días, franja horaria, renovación automática) siempre visibles.
- **Propuesta:**
  - **Plantillas rápidas** al crear: "Mensual libre", "Trimestral", "3 veces por semana", "Paquete de 10 sesiones", "Horario mañana". Cada una prellena el formulario.
  - Simple: nombre, tipo, precio y duración. Intermedio/experto: el resto bajo "Reglas de acceso".
  - Nueva sección **"Incluye clases"** (8.4 nivel A).

### 11.3 Venta de membresías
- **Hoy:** asistente de 3 pasos (cliente, plan, pago) con promociones y pagos mixtos siempre visibles.
- **Propuesta:**
  - Simple: **una sola pantalla**: cliente (o alta rápida), plan en botones grandes, método de pago y "Cobrar".
  - **Renovar en un clic** desde la ficha del cliente o desde el semáforo de Control de acceso, con el mismo plan y método de pago.
  - Promociones y pagos mixtos solo en intermedio/experto.

### 11.4 Promociones
- Simple: no existe como pantalla. En la venta hay un campo "Descuento" (monto o %) con motivo.
- Intermedio/experto: campañas con fechas, como hoy.

### 11.5 Productos e inventario
- Simple: producto = nombre + precio. Se vende sin controlar stock.
- Intermedio: stock simple (cantidad) con aviso de stock bajo.
- Experto: stock por sucursal, punto de reorden y ubicación en bodega (ya existen los campos).

### 11.6 Cajas
- **Hoy:** hay que crear cajas, abrirlas con monto inicial y hacer arqueo en un asistente.
- **Propuesta:**
  - Simple: **una caja por sucursal creada automáticamente**. Al primer cobro del día se pregunta "¿Con cuánto efectivo empiezas?" y al final del día un botón "Cerrar el día" muestra lo esperado frente a lo contado.
  - Experto: varias cajas y arqueo por denominación, como hoy.

### 11.7 Transacciones, gastos y proveedores
- Simple: un botón **"Registrar gasto"**: monto, concepto (lista corta: alquiler, servicios, sueldos, insumos, otro), fecha y método de pago.
- Intermedio: proveedores y gastos recurrentes.
- Experto: categorías, comprobantes y reportes.

### 11.8 Reportes
- Simple: "Hoy" (ingresos, ventas, asistencias) y "Este mes" (comparado con el mes anterior).
- Intermedio: por plan, por clase (ocupación), asistencia por día y hora.
- Experto: financiero, costo del equipo (horas × costo por hora), auditoría y exportación.

### 11.9 Usuarios y Roles
- Ver 6.2: **Usuarios** pasa a "Accesos avanzados" (solo experto) y **Roles** se muestra con nombres y explicaciones humanas.
- El superadmin edita los roles globales (ya corregido). En experto, cada organización puede crear roles propios a partir de uno base ("Duplicar rol Recepción y ajustar").

### 11.10 Sucursales
- Marcar la sede principal = sucursal predeterminada (5.1).
- Al crear una sucursal nueva, ofrecer "¿Copiar los planes, clases y horarios de Sede Central?". Sin cambio de base de datos: crea registros con la nueva sucursal.

### 11.11 Disciplinas
- En modo simple no aparece como pantalla: se crean desde el asistente de clase ("Nueva disciplina: Spinning").
- En intermedio/experto, cada disciplina muestra sus instructores, clases y reglas de acceso (8.4).

### 11.12 Configuración
Se reorganiza en cuatro pestañas, en este orden:
1. **Mi gimnasio**: nombre, datos fiscales, moneda, zona horaria, sede principal.
2. **Modo y módulos**: el selector de modo (con la explicación de cada uno) y los interruptores de módulos.
3. **Reglas**: datos obligatorios de clientes, reglas de clases (turno del instructor, acceso por plan, choques), tolerancia de atrasos. Solo intermedio/experto.
4. **Avanzado**: kiosco, horizonte de generación, auditoría. Solo experto.

### 11.13 Dashboard
- La lista de primeros pasos (4.5) hasta completarla.
- KPIs según el modo y los módulos activos: en simple, "Ingresos hoy", "Membresías por vencer esta semana" (con botón para avisar por WhatsApp) y "Asistencias hoy".

---

## 12. Consistencia de la interfaz

### 12.1 Glosario único (se aplica en toda la interfaz)

| Hoy (mezclado) | Término único |
|---|---|
| Personal / Staff / Perfil de staff / Empleado | **Equipo** (pantalla) · **persona del equipo** |
| Entrenador / Instructor / Profe | **Instructor** |
| Plantilla de turno / Horario recurrente | **Horario de trabajo** |
| Turno de trabajo / Turno | **Jornada** |
| Plantilla de clase / Clase recurrente | **Clase** |
| Clase programada / ocurrencia | **Sesión** |
| Asignación de acceso | **Acceso** / **Sucursal** |
| Asistencias (clientes) | **Control de acceso** |
| Sede / Sucursal | **Sucursal** |

### 12.2 Patrones que se repiten en todas las pantallas
- **Encabezado:** título + una línea que explica para qué sirve la pantalla + acción principal a la derecha.
- **Estado vacío:** qué es, por qué conviene y botón para crear el primero.
- **Formularios:** máximo 6 campos visibles; los demás en "Más opciones". Los asistentes de pasos solo se usan cuando hay más de 6 campos obligatorios.
- **Eliminar:** siempre con "Deshacer" (ya existe `useSoftDelete`) y un aviso de impacto cuando aplica ("tiene 4 clases futuras").
- **Errores:** en lenguaje del negocio y con la acción sugerida (P5). Se reemplazan los mensajes genéricos del backend.
- **Celular:** todas las pantallas operativas (control de acceso, venta, marcaje, jornadas de hoy) funcionan en una pantalla de celular.

### 12.3 Ayuda contextual
- Un ícono "?" junto a cada concepto nuevo (horario de trabajo, sesión, quién puede reservar) con una explicación de dos líneas.
- En modo simple, al entrar por primera vez a cada pantalla, un recorrido de 3 pasos que se puede saltar.

---

## 13. Bugs y deuda técnica detectados

Todos se corrigen **sin cambio de base de datos**.

| # | Problema | Impacto | Corrección |
|---|---|---|---|
| 13.1 | **Un usuario limitado a una sucursal ve al equipo de otras sucursales pero no puede editarlo** (3.1): el filtro automático por sucursal oculta la asignación de acceso del empleado solo al guardar. | Medio: afecta a encargados de sede, que es un caso legítimo. | Filtrar también el listado según la regla 6.4.1, así lo que se ve se puede editar, y mostrar un mensaje claro si igual ocurre. |
| 13.2 | **La sucursal y el rol viajan en el token de sesión y no se actualizan hasta volver a iniciar sesión** (caso real de Gym Diego, 3.1). Los permisos sí se refrescan (caché de Redis), la sucursal y el rol no; `/auth/me` también devuelve los del token. | Alto: un cambio de acceso no aplica y produce filtros "fantasma", incluso al editarse a sí mismo. | Resolver rol y sucursal en el servidor en cada petición desde la caché de Redis, invalidada en cada cambio de acceso; refrescar `/auth/me` en el frontend (6.6). **No** se cierra la sesión del usuario. |
| 13.3 | **Reservar una clase no valida la membresía.** | Alto: clientes sin membresía o con planes que no incluyen clases reservan igual. | Validación de 8.4, nivel A. |
| 13.4 | **No se detecta que un instructor tenga dos clases a la vez.** | Medio | Regla de 8.3. |
| 13.5 | **Un administrador limitado a una sucursal ve al equipo de todas.** | Medio: lo ve pero no lo puede editar (13.1). | Regla 6.4.1. |
| 13.6 | **Eliminar a alguien del equipo no revoca su acceso** (su `AsignacionAcceso` sigue viva) ni cierra su sesión. | Medio: una persona dada de baja sigue entrando al sistema. | "Dar de baja" de 6.4.4. |
| 13.7 | **La generación de clases recurrentes calcula "hoy" en UTC** (`clase-plantilla.service.ts`, `generarParaOrganizacion`). En turnos ya se corrigió. | Bajo: de noche la ventana arranca un día tarde. | Usar la fecha local de la organización, igual que en turnos. |
| 13.8 | **El horario admite un solo bloque por día** (turno partido 6-10 / 16-20 no se puede cargar). `TurnoPlantilla` sí admite varias filas por día; lo que lo impide es la validación y la generación (un turno por persona y día). | Medio para gimnasios con turno partido. | Permitir varios bloques no solapados por día y generar un turno por bloque (clave persona + fecha + hora de entrada). **Sin cambio de base de datos.** |
| 13.9 | **No hay salas**, así que dos clases a la misma hora en la misma sucursal no se pueden distinguir. | Bajo en gimnasios chicos. | Solo aviso (8.3). **OPCIONAL, CAMBIO DE BASE DE DATOS (FASE 6): TABLA `SALAS` Y COLUMNA `SALA_ID` EN `CLASES_PLANTILLA` / `CLASES_PROGRAMADAS`.** Alternativa sin cambio: poner la sala en el nombre de la clase ("Spinning · Sala 2"). |
| 13.10 | **"Mi turno" solo existe en Control de acceso**, que ahora es un módulo aparte (`controlAcceso`). Un gimnasio con personal pero sin control de acceso no puede marcar. | Medio | Botón de marcaje en la barra superior (7.4). |
| 13.11 | **Las reservas de un cliente dado de baja o con membresía cancelada no se cancelan.** | Bajo | Al cancelar o vencer una membresía, avisar de las reservas futuras y ofrecer cancelarlas. |
| 13.12 | **El administrador de una organización nueva queda limitado a la sucursal inicial** (`crearOrganizacionConAdmin` guarda `sucursalId` = "Sede Central" en su asignación). Origen del caso de Gym Diego. | Alto: todo gimnasio creado desde la plataforma nace con un dueño que no ve sus otras sucursales. | Crear la asignación del administrador con `sucursalId = null` (todas). Script de datos `db:corregir-acceso-administradores`, igual que el de horas de clases: lista, sin modificar nada, los ADMIN_GYM limitados a una sucursal y, con `--aplicar`, les da acceso a todas. **Es una corrección de datos, no de estructura.** Estado actual en la base local: los dos administradores existentes ya tienen acceso a todas (Gym Diego corregido a mano, Gym Titan viene así del seed). |

---

## 14. Cambios de base de datos: resumen

**NINGUNA DE LAS FASES 0 A 5 REQUIERE CAMBIOS DE ESTRUCTURA.** Todo se apoya en lo existente:

| Necesidad | Cómo se resuelve sin cambio de base de datos |
|---|---|
| Modo de uso | `Organizacion.configuracion.modoUso` (JSON) |
| Sucursal predeterminada | `Sucursal.esPrincipal` + preferencia en el navegador |
| Quién puede reservar (por disciplina) | `Organizacion.configuracion.accesoClases` (JSON) |
| Ausencias por rango | `TurnoTrabajo.estado = AUSENTE` + `motivoAusencia` |
| Tolerancia de atrasos, horizonte de generación, kiosco | `Organizacion.configuracion` (JSON) |
| Turno partido | Varias filas `TurnoPlantilla` por día (ya admitido por la tabla) |
| Roles con nombre humano | Mapa de nombres en el frontend |
| Onboarding | `Organizacion.configuracion.onboarding` (JSON) |

**CAMBIOS DE BASE DE DATOS OPCIONALES (FASE 6, SOLO SI SE NECESITAN):**

| # | CAMBIO | CUÁNDO SE JUSTIFICA | ALTERNATIVA SIN CAMBIO |
|---|---|---|---|
| DB-1 | **COLUMNA `ACCESO` (ENUM ABIERTA/MIEMBROS/PLANES) EN `CLASES_PLANTILLA` Y `CLASES_PROGRAMADAS` + TABLA `CLASES_PLANTILLA_PLANES`** | Reglas distintas para dos clases de la misma disciplina. | Reglas por disciplina (nivel A) o separar la disciplina en dos. |
| DB-2 | **TABLA `SALAS` + COLUMNA `SALA_ID` EN `CLASES_PLANTILLA` Y `CLASES_PROGRAMADAS`** | Gimnasios con varias salas que necesitan detectar choques por sala. | Poner la sala en el nombre de la clase; solo aviso de choque por sucursal. |
| DB-3 | **VALOR NUEVO `EN_ESPERA` EN EL ENUM `ESTADORESERVA`** | Lista de espera en clases llenas. | Sin lista de espera; se muestra "clase llena". |
| DB-4 | **COLUMNA `PIN_HASH` EN `PERFILES_STAFF`** | Marcaje del equipo en la tablet de la entrada con PIN. | Marcar desde el celular con la sesión del empleado. |
| DB-5 | **COLUMNA `SUCURSAL_PREFERIDA_ID` EN `USUARIOS`** | La sucursal preferida debe viajar entre dispositivos. | Preferencia en el navegador + sede principal. |

Recomendación: **no hacer ninguno hasta que un cliente real lo pida.** Las alternativas cubren el caso de la gran mayoría de los gimnasios.

---

## 15. Hoja de ruta por fases

Cada fase se entrega sola, con su PR, y deja el sistema mejor que antes aunque no se haga la siguiente. Estimaciones en días de trabajo de una persona.

### Fase 0 · Bugs que bloquean y accesos siempre al día (2–3 días)
- 13.12 Administrador inicial con acceso a todas las sucursales + script de corrección de datos.
- 13.2 Rol y sucursal resueltos en el servidor en cada petición + `/auth/me` al día + refresco en el frontend (6.6 a y b).
- 13.1 / 13.5 Listado de equipo filtrado para usuarios limitados a una sucursal + mensaje claro.
- 13.6 "Dar de baja" revoca el acceso · 13.7 "Hoy" local en la generación de clases.
- 6.6 c) Indicador de alcance en la barra superior.
- **Criterio de aceptación:**
  - Una organización creada desde la plataforma tiene su administrador con acceso a todas las sucursales.
  - Si un administrador se da a sí mismo (o a otra persona) acceso a todas las sucursales, el cambio se ve en la siguiente acción **sin cerrar sesión**.
  - Un usuario limitado a una sucursal solo ve y edita al equipo que puede gestionar, sin errores.
- 6.6 d) y e) (acciones de soporte y diagnóstico del superadmin) pasan a la fase 1.

### Fase 1 · Sucursal predeterminada y alta del equipo sin duplicados (3–4 días)
- Sección 5 completa (store global, selector en la barra superior, sede principal, todas las pantallas).
- Formulario de equipo con un solo campo de sucursal (6.3), plantillas rápidas de horario y roles con nombres humanos (6.2).
- Acciones de soporte en la ficha de la persona y diagnóstico de acceso para el superadmin (6.6 d y e).
- **Criterio:** no hay ninguna pantalla donde el usuario tenga que elegir la sucursal que ya eligió en la barra superior, salvo las listadas en 5.1.5.

### Fase 2 · Modos de uso (4–5 días)
- `modoUso` en configuración, `useModoUso()`, `<SoloEnModo>`, selector en Configuración con explicación.
- Aplicar la matriz 4.4 en Clientes, Planes, Venta, Control de acceso, Equipo, Configuración y el menú.
- Asistente de inicio y lista de primeros pasos (4.5).
- **Criterio:** una organización nueva en modo simple puede registrar un cliente, venderle una membresía y registrar su ingreso sin haber configurado nada, con un máximo de 6 campos por formulario.

### Fase 3 · Clases inteligentes (6–8 días)
- Asistente "Nueva clase" de 5 pasos con la grilla de horarios disponibles (8.2) y endpoint `horarios-disponibles`.
- Choques de instructor (8.3).
- Quién puede reservar, nivel A (8.4), con validación en reservas y edición desde el plan.
- Una sola pantalla de Clases con "solo esta sesión / toda la clase" (8.1).
- **Criterio:** crear "Spinning martes y jueves 18:00 con Marta en Sede Central solo para plan Full" toma menos de un minuto y 5 clics de horario. Un cliente con plan Básico no puede reservarla y el mensaje explica por qué.

### Fase 4 · Jornadas del equipo (3–4 días)
- Vista Hoy, Semana y Ausencias (7.2), endpoint de ausencias por rango con aviso de clases afectadas, marcaje desde la barra superior (7.4), turno partido (13.8).
- **Criterio:** registrar dos semanas de vacaciones de una persona es un solo formulario, y el sistema avisa qué clases quedan sin instructor.

### Fase 5 · Simplificación del resto de módulos (6–8 días)
- Sección 11 completa: ficha 360 del cliente, plantillas de planes, venta en una pantalla y renovación en un clic, caja automática, gasto rápido, reportes por modo, reorganización de Configuración, Dashboard por modo.
- Sección 12: glosario aplicado, patrones de pantalla, ayuda contextual.
- **Criterio:** los flujos más frecuentes (vender, renovar, registrar ingreso, registrar gasto, cerrar el día) toman 3 pasos o menos en modo simple.

### Fase 6 · Experto avanzado (opcional, según demanda)
- Solo si hay clientes que lo piden: DB-1 a DB-5 (sección 14), lista de espera, salas, PIN de marcaje.

**Orden recomendado:** 0 → 1 → 2 → 3 → 4 → 5. Las fases 1 y 2 van primero porque todo lo demás (clases, jornadas, resto de módulos) se apoya en la sucursal predeterminada y en los modos.

---

## 16. Escenarios Gherkin

```gherkin
Feature: Alta de una persona del equipo sin elegir dos veces la sucursal

  Scenario: Persona que trabaja en una sola sucursal
    Given la sucursal activa es "Sur"
    When agrego a "Jose" como Instructor
    Then el campo Sucursal ya muestra "Sur"
    And no se me pide "¿Dónde trabaja habitualmente?"
    And Jose queda con acceso solo a "Sur" y su horario en "Sur"

  Scenario: Persona con acceso a todas las sucursales
    Given la sucursal activa es "Sede Central"
    When agrego a "Carla" y elijo "Todas las sucursales"
    Then aparece "¿Dónde trabaja habitualmente?" con "Sede Central" preseleccionada

  Scenario: Administrador limitado a una sucursal
    Given mi acceso está limitado a "Sede Central"
    When abro la pantalla Equipo
    Then solo veo a las personas de "Sede Central" y a las que tienen acceso a todas
    And puedo editar a cualquiera de ellas sin errores


Feature: Accesos siempre al día

  Scenario: Organización nueva
    Given el superadmin crea la organización "Gym Nuevo" con su administrador
    Then el administrador tiene acceso a todas las sucursales de "Gym Nuevo"

  Scenario: Un administrador se da acceso a todas las sucursales
    Given inicié sesión con acceso limitado a "Sede Central"
    When me edito y elijo "Todas las sucursales"
    Then la barra superior muestra "Todas las sucursales" sin que tenga que cerrar sesión
    And puedo editar al equipo de la sucursal "Sur" sin errores

  Scenario: Cambio de acceso de otra persona
    Given "Ana" tiene la sesión abierta con acceso limitado a "Sur"
    When un administrador le da acceso a todas las sucursales
    Then en su siguiente acción "Ana" ya trabaja con todas las sucursales
    And no tuvo que cerrar sesión

  Scenario: No quedarse sin administrador
    Given soy el único administrador con acceso a todas las sucursales
    When intento cambiarme el rol a Recepción
    Then el sistema no lo permite y me explica por qué


Feature: Registrar una ausencia por rango

  Scenario: Vacaciones de dos semanas
    Given "Pedro" trabaja de lunes a viernes y da Yoga los martes
    When registro una ausencia de "Pedro" del 13 al 24 por "Vacaciones"
    Then sus jornadas de esos días quedan como ausencia
    And el sistema me avisa que 2 clases de Yoga quedan sin instructor
    And me ofrece asignar un reemplazo


Feature: Crear una clase eligiendo en la grilla

  Scenario: Elegir horarios libres del instructor
    Given "Marta" imparte Spinning y trabaja martes y jueves de 17:00 a 21:00 en "Sede Central"
    And "Marta" ya da Yoga los martes de 19:00 a 20:00
    When creo una clase de Spinning de 60 minutos con "Marta" en "Sede Central"
    Then la grilla marca en verde martes y jueves de 17:00 a 20:00
    And marca en rojo el martes de 19:00 a 20:00
    When marco martes 18:00 y jueves 18:00
    Then el resumen dice "Martes y jueves de 18:00 a 19:00"

  Scenario: Choque de instructor
    Given "Marta" da Yoga los martes de 18:30 a 19:30
    When intento guardar Spinning los martes de 18:00 a 19:00 con "Marta"
    Then el sistema no lo permite
    And me dice "Marta ya da Yoga los martes de 18:30 a 19:30"


Feature: Quién puede reservar una clase

  Scenario: Clase solo para ciertos planes
    Given Spinning está incluido solo en los planes "Full" y "Premium"
    And "Juan" tiene una membresía activa del plan "Básico"
    When intento reservarle una clase de Spinning
    Then el sistema no lo permite
    And me dice "El plan Básico de Juan no incluye Spinning"

  Scenario: Clase abierta
    Given la disciplina "Clase de prueba" está abierta a todos
    And "Ana" no tiene membresía
    When le reservo una "Clase de prueba"
    Then la reserva se confirma


Feature: Modo simple

  Scenario: Primer uso de un emprendedor
    Given creo mi gimnasio y elijo "Musculación", "Solo yo" y "Sin clases"
    Then el sistema queda en modo simple
    And el menú muestra solo Inicio, Clientes, Vender, Control de acceso y Caja
    And el formulario de cliente pide solo nombre, teléfono y documento
```

---

## 17. Decisiones pendientes

Necesito tu respuesta en estas antes de empezar las fases indicadas:

| # | Decisión | Opciones | Recomendación | Afecta a |
|---|---|---|---|---|
| D1 | ¿El modo de uso es por organización o puede cambiar por usuario? | Por organización · Por usuario | **Por organización.** Por usuario confunde cuando dos personas hablan de la misma pantalla. | Fase 2 |
| D2 | ¿Qué significa "clase abierta para toda la organización"? | Sin exigir membresía · Reservable desde cualquier sucursal · Ambas | Confirmar. Hoy las reservas ya son válidas desde cualquier sucursal. | Fase 3 |
| D3 | ¿Reglas de reserva por disciplina (sin cambio de base de datos) o por clase (CAMBIO DE BASE DE DATOS DB-1)? | Nivel A · Nivel B | **Nivel A** y medir si alguien necesita el B. | Fase 3 |
| D4 | ¿Asistir a una clase descuenta una sesión a los planes por sesiones, o solo el ingreso al gimnasio? | Solo ingreso (hoy) · También clases · Configurable | **Configurable** en experto, "solo ingreso" por defecto. | Fase 3 |
| D5 | ¿La pantalla Usuarios pasa a "Accesos avanzados" (solo experto) o se elimina y todo va a Equipo? | Accesos avanzados · Eliminar | **Accesos avanzados**: sigue siendo el camino para cuentas que no son empleados (clientes con portal, contador). | Fase 1 |
| D6 | ¿Modo por defecto de las organizaciones existentes al desplegar? | Simple · Intermedio · Experto | **Intermedio**: nadie pierde de vista lo que ya usa. | Fase 2 |
| D7 | ¿Marcaje del equipo con PIN en la tablet (CAMBIO DE BASE DE DATOS DB-4) o desde el celular? | Celular · PIN | **Celular** primero. | Fase 4 |
