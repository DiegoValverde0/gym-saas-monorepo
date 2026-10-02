# Plan: menú lateral agrupado

Pedido del usuario (2026-10-02): pasar del esquema actual (grupos en el sidebar y sus pantallas en la barra de arriba) a un **menú lateral agrupado**, reorganizado según el uso. Lo más usado (clientes, membresías, asistencias) tiene que estar más a mano, y la reportería necesita su propio sector.

Sin cambios de base de datos ni de API: es solo el frontend (`apps/web`).

---

## 1. Qué hay hoy y qué falla

`apps/web/src/app/dashboard/layout.tsx`:

- El sidebar muestra **Dashboard** y 5 grupos (Operaciones, Comercial, Equipo, Finanzas, Administración). Cada grupo es un enlace a su primera pantalla.
- Las pantallas del grupo elegido aparecen **en la barra de arriba**, junto al gimnasio, la sucursal, el marcaje, los avisos y el usuario. En el celular, en cambio, se despliegan dentro del sidebar.
- La paleta de comandos (Ctrl+K, `components/ui/command-palette.tsx`) tiene **su propia lista escrita a mano**. Le faltan Membresías, Planes, Promociones, Productos, Agenda, Jornadas, Reportes, Reportería y otras, y no respeta los módulos apagados ni el modo de uso.

Problemas:

1. **Se mezcla lo global con lo local.** La barra de arriba es contexto fijo (gimnasio, sucursal, usuario), pero además cambia según el grupo.
2. **La ubicación está partida.** El grupo se marca a la izquierda y la pantalla arriba.
3. **Esconde casi todo.** Solo se ven las pantallas de un grupo y hay que adivinar dónde vive cada cosa. Por ejemplo, Reportería está en "Administración" y Clases en "Equipo".
4. **Siempre son dos clics**, incluso para lo de todos los días.
5. **Los nombres se repiten o no son claros.** El grupo "Equipo" tiene una pantalla "Equipo"; se usan a la vez "Reportes" y "Reportería"; el inicio se llama "Dashboard", en inglés.

---

## 2. Principios

- **Una sola navegación y un solo lugar para la ubicación:** el sidebar. Todas las pantallas visibles, agrupadas con títulos que no se clican.
- **Agrupar por tarea, no por tabla.** Primero lo que se hace todo el día (recepción), después la configuración del negocio y al final los ajustes.
- **Lo más usado, arriba y a un clic,** dentro de cada grupo y en el orden de los grupos.
- **La barra de arriba es solo para lo global:** buscar (Ctrl+K), gimnasio y sucursal, marcaje, avisos, tema y usuario.
- **Pestañas solo dentro de una página,** para vistas de una misma cosa (por ejemplo, los datos, las membresías y los pagos de un cliente). Nunca para saltar entre módulos.
- **Una sola definición del menú** para el sidebar, el menú del celular y la paleta de comandos. Las reglas de permiso, módulo y modo se escriben una vez.
- **Cada persona ve solo lo que puede usar.** Esto ya se hace: se ocultan las pantallas sin permiso, de módulos apagados o de otro modo, y los grupos que quedan vacíos.

---

## 3. El menú nuevo

| Grupo | Pantalla (nombre nuevo) | Ruta | Hoy se llama / está en |
|---|---|---|---|
| — | **Inicio** | `/dashboard` | "Dashboard" |
| **Día a día** | Asistencias | `/dashboard/asistencias` | "Control de acceso" (Operaciones) |
| | Clientes | `/dashboard/clientes` | Operaciones |
| | Membresías | `/dashboard/membresias` | Comercial |
| | Caja | `/dashboard/cajas` | "Cajas" (Finanzas) |
| **Clases** | Agenda | `/dashboard/agenda` | Equipo |
| | Clases | `/dashboard/clases` | Equipo |
| | Disciplinas | `/dashboard/disciplinas` | Equipo |
| **Lo que vendes** | Planes | `/dashboard/planes` | Comercial |
| | Promociones | `/dashboard/promociones` | Comercial |
| | Productos | `/dashboard/productos` | Comercial |
| **Finanzas** | Movimientos | `/dashboard/transacciones` | "Transacciones" |
| | Gastos | `/dashboard/gastos` | Finanzas |
| | Proveedores | `/dashboard/proveedores` | Finanzas |
| | Cuentas | `/dashboard/cuentas-bancarias` | Finanzas |
| **Equipo** | Personal | `/dashboard/personal` | "Equipo" (Equipo) |
| | Jornadas | `/dashboard/turnos` | Equipo |
| | Tablet de marcaje | `/dashboard/marcaje` | Equipo |
| **Reportes** | Resumen del negocio | `/dashboard/reportes` | "Reportes" (Finanzas) |
| | Reportería avanzada | `/dashboard/reporteria` | "Reportería" (Administración) |
| **Ajustes** (al fondo) | Sucursales | `/dashboard/sucursales` | Administración |
| | Roles y permisos | `/dashboard/roles` | "Roles" |
| | Accesos avanzados | `/dashboard/usuarios` | Administración |
| | Configuración | `/dashboard/configuracion` | Administración |

Por qué está ordenado así:

- **Día a día** reúne lo que recepción hace en cada turno: registrar un ingreso, buscar o dar de alta un cliente, vender o renovar una membresía y abrir o cerrar la caja. Va primero y debajo de Inicio.
- **Clases** se separa de **Equipo**. Hoy están juntos, pero son tareas distintas: la grilla de clases es de cara al cliente y las jornadas son del personal. Agenda, que muestra clases y jornadas, queda en Clases porque es su uso principal.
- **Lo que vendes** es el catálogo: se arma de vez en cuando y no a diario. Por eso sale de "Comercial", y Membresías (que es diaria) pasa a Día a día.
- **Reportes** es un sector propio. "Resumen del negocio" es el tablero rápido de hoy. "Reportería avanzada" es el constructor, nombre que propusiste.
- **Ajustes** va separado y abajo del todo, como en la mayoría de los SaaS: se usa poco y no debe competir con lo diario.
- Las rutas no cambian, así que los enlaces guardados, los recorridos guiados y los avisos siguen funcionando.

Cuántas opciones ve cada uno (sin contar Inicio), con todos los módulos encendidos:

- **Dueño en modo experto:** 23 pantallas en 7 grupos. Es el máximo, y entra en el sidebar sin necesidad de plegar nada.
- **Dueño en modo simple:** 13. En ese modo se ocultan Promociones, Caja, Proveedores, Cuentas, Agenda, Disciplinas, Jornadas, Tablet de marcaje, Roles y Accesos avanzados.
- **Recepción** (intermedio o experto): 19. No ve Personal ni los Ajustes salvo Sucursales; lo que más usa queda arriba, en Día a día.

---

## 4. Decisiones (aprobadas el 2026-10-02: todas las recomendaciones)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| M1 | ¿"Asistencias" o "Control de acceso"? | Asistencias · Control de acceso | **Asistencias** en el menú: es la palabra del día a día. El título de la página puede seguir siendo "Control de acceso". |
| M2 | Nombre de la reportería en modo simple | "Reportería avanzada" en todos los modos · Otro nombre en simple | **"Reportes listos" en modo simple** (ahí solo hay plantillas) y "Reportería avanzada" en intermedio y experto. |
| M3 | ¿Grupos plegables? | Todos abiertos · Acordeón · Plegables a gusto | **Todos abiertos**, y el **sidebar entero se puede achicar a íconos** (con el nombre al pasar el mouse) para quien quiera más espacio. Con 23 pantallas, plegar grupos vuelve a esconder cosas. |
| M4 | Celular | Solo el menú lateral · Menú lateral y una barra inferior | **Menú lateral y una barra inferior** con Inicio, Asistencias, Clientes, Membresías y "Menú". Recepción usa el celular o la tablet sobre todo para eso. |
| M5 | Buscar en la barra de arriba | Solo Ctrl+K · Un botón "Buscar…" visible | **Botón "Buscar… Ctrl K" a la izquierda de la barra.** Abre la paleta, que hoy casi nadie descubre. |
| M6 | ¿Favoritos o pantallas fijadas? | Ahora · Más adelante | **Más adelante.** Con el orden por uso alcanza; los favoritos suman complejidad. |

---

## 5. Fases (un commit por fase, pruebas en cada una)

Rama sugerida: `menu-lateral`.

### Fase 1: una sola definición del menú (HECHA)
- `apps/web/src/lib/navegacion.ts`: los grupos y las pantallas de la sección 3 como datos. Cada pantalla lleva su ruta, ícono, permiso, módulo del gimnasio, modo mínimo y, si hace falta, una regla especial. Las reglas especiales existen hoy: Agenda (clases **o** turnos), Accesos avanzados (experto **o** sin módulo de personal) y el nombre por modo de la decisión M2.
- Una función pura `menuVisible({ permisos, modulos, modo })` que devuelve solo lo que se ve. Reemplaza el filtro de `layout.tsx`, que hoy compara por **nombre** de pantalla (`['Cajas', 'Productos', ...].includes(item.name)`) y se rompería al cambiar los nombres.
- Pruebas de Vitest: qué ve el dueño en cada modo, qué ve recepción y qué pasa con cada módulo apagado.
- **Listo cuando:** las pruebas cubren los casos y el menú actual (todavía con sus pantallas en la barra de arriba) lee la definición nueva.
- Hecho así: `lib/navegacion.ts` (`GRUPOS_MENU`, `menuVisible`, `esPantallaActual`) y `navegacion.test.ts` (8 pruebas: dueño en los tres modos, recepción, instructor, módulos apagados). El layout ya usa los grupos y nombres nuevos; el sidebar agrupado llega en la fase 2.

### Fase 2: el sidebar agrupado (HECHA)
- El sidebar muestra todos los grupos abiertos, con títulos que no se clican y la pantalla actual marcada (`aria-current="page"`). Ajustes va abajo del todo.
- Se quita la fila de pantallas de la barra de arriba. En su lugar va el botón "Buscar… Ctrl K" (M5).
- El menú del celular usa el mismo sidebar, sin el desglose especial que tiene hoy.
- Los nombres nuevos: Inicio, Asistencias, Personal, Movimientos, Caja, Roles y permisos, Resumen del negocio y Reportería avanzada (o "Reportes listos" en simple).
- **Listo cuando:** dueño, recepción e instructor ven su menú, en los tres modos, en claro y oscuro, y cada pantalla queda a un clic.
- Además: la paleta de comandos se caía al abrirse (a `CommandDialog` le faltaba la raíz `Command` de cmdk; pasaba también con Ctrl+K). El sidebar ya no se vuelve a montar en cada render: conserva su scroll y trae a la vista la pantalla actual.

### Fase 3: sidebar achicable y paleta de comandos
- Botón para achicar el sidebar a íconos, con el nombre al pasar el mouse. Se recuerda por persona en el navegador.
- La paleta de comandos lee la misma definición: tiene todas las pantallas, respeta permisos, módulos y modo, y busca también por nombres viejos ("transacciones", "control de acceso", "roles") para quien ya los conoce.
- Acciones rápidas en la paleta ("Nuevo cliente", "Vender membresía", "Registrar ingreso", "Registrar gasto"). En esta fase se revisa cuáles pueden abrir el formulario directo y cuáles llevan a la página.
- **Listo cuando:** la paleta tiene lo mismo que el menú de cada persona.

### Fase 4: celular
- Barra inferior (M4) con Inicio, Asistencias, Clientes, Membresías y "Menú", que abre el sidebar completo. Solo aparece en pantallas chicas, y cada acceso solo si la persona lo puede usar.
- Revisar que ninguna pantalla quede tapada por la barra (márgenes inferiores, botones fijos, modo kiosco y tablet de marcaje, que no deben mostrarla).
- **Listo cuando:** en 390 px se llega a todo, no hay desbordes y la barra no tapa nada.

### Fase 5: recorrido completo y cierre
- Recorrido en el navegador con dueño (simple, intermedio y experto), recepción e instructor; claro y oscuro; escritorio, tablet y celular.
- Revisar los textos que nombran el menú viejo. Por ejemplo, `personal/PinDialog.tsx` dice "Jornadas → Tablet de marcaje", y la guía de inicio nombra los módulos.
- Actualizar la documentación de la interfaz (`docs/Guia_Arquitectura_Frontend.md`).
- **Listo cuando:** `pnpm test` pasa y el recorrido no deja pantallas huérfanas ni textos viejos.

---

## 6. Para más adelante (fuera de este plan)

- Favoritos o pantallas fijadas por persona (M6).
- Contadores en el menú (por ejemplo, membresías por vencer hoy), si se ve que hacen falta.
- Ordenar el menú según lo que más usa cada persona.
