# Plan: reportería (constructor de reportes tipo Salesforce)

Rama `reporteria`. Pedido del usuario (2026-09-28): un sistema de reportes completo, al estilo de Salesforce, en el que se elige **qué tipo de reporte**, **de qué módulos**, **qué columnas** y **qué filtros**, que se pueda **guardar para repetirlo**, que viva en un **módulo separado** y que se pueda **ver en pantalla y exportar**. Las fuentes son sobre todo las tablas de operación y transacciones. Quedan fuera `auditorias`, `notificaciones` y las tablas internas.

---

## 1. Qué tomamos de Salesforce y cómo se traduce

| Salesforce | Aquí | En una frase |
|---|---|---|
| Report Type (objeto principal + relacionados) | **Tipo de reporte** | "¿Qué quieres contar?" Cada tipo dice qué es una fila: "una fila por cada venta". |
| Fields / Columns | **Columnas** | Se eligen de un panel agrupado por origen (Venta, Cliente, Plan, Sucursal…), con buscador. |
| Tabular / Summary / Matrix | **Formato: Lista, Agrupado, Tabla cruzada** | Agrupado: hasta 3 niveles con subtotales. Tabla cruzada: filas × columnas. |
| Standard filters | **Filtros rápidos** | Fecha (con rangos relativos), sucursal y "solo míos / todos". |
| Field filters + filter logic | **Filtros por columna** y **lógica** | Operadores según el tipo de dato, y combinaciones como "1 Y (2 O 3)". |
| Cross filters (with / without) | **Filtros "con / sin"** | "Clientes **sin** asistencias en los últimos 30 días". |
| Bucket fields | **Grupos personalizados** | Rangos de monto, rangos de edad, agrupar planes en "Mensuales / Anuales". |
| Summary fields | **Totales** | Cantidad, suma, promedio, mínimo, máximo y cantidad de distintos, por columna. |
| Charts | **Gráfico del reporte** | Barras, líneas o torta sobre un reporte agrupado. |
| Folders + sharing | **Carpetas** | Privadas o compartidas con roles del gimnasio. |
| Export | **Exportar** | CSV y Excel con formato. Impresión limpia desde el navegador. |
| Subscriptions / Dashboards / Joined reports | **Para más adelante** | Ver la sección 9. |

Los rangos de fecha **relativos** ("este mes", "últimos 30 días") son lo que hace útil repetir un reporte guardado: "Ventas de este mes" da cada mes los datos del mes en curso.

---

## 2. Decisiones (aprobadas el 2026-09-28: todas las recomendaciones)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| R1 | ¿Dónde se guardan los reportes? | **CAMBIO DE BASE DE DATOS** (tablas nuevas) · JSON en `organizaciones.configuracion` | **Tablas nuevas** (DB-7, sección 5). El JSON no sirve para compartir por carpeta, saber quién creó cada reporte ni crecer a cientos de reportes. |
| R2 | ¿Quién arma reportes y quién solo los ve? | Por permiso y por modo | **Permiso nuevo `reportes`** (leer / crear / actualizar / eliminar). Dueño: todo. Recepción: ver y exportar los compartidos. Instructor: nada. **Por modo:** simple solo ve y exporta las plantillas; intermedio arma reportes Lista y Agrupado; experto tiene todo (tabla cruzada, filtros con/sin, lógica de filtros y grupos personalizados). |
| R3 | ¿Formatos de exportación? | CSV · Excel · PDF | **CSV y Excel** (Excel con encabezados, formato de moneda y fecha, y subtotales). PDF, más adelante; mientras tanto, la vista del reporte se imprime bien desde el navegador. |
| R4 | ¿Límites? | — | Pantalla: 2.000 filas en páginas de 50. Exportación: 50.000 filas. Cada consulta corta a los 15 segundos. Más de eso pide agrupar o filtrar. |
| R5 | ¿Qué pasa con las pestañas de Reportes de hoy? | Se quedan · Se reemplazan | **Se quedan** como "Tablero" (resúmenes rápidos). La reportería es una sección nueva y separada. Las pestañas se pueden convertir en plantillas más adelante, sin apuro. |

---

## 3. Arquitectura

### 3.1 Módulo separado

- **API:** módulo nuevo `apps/api/src/modules/reporteria/`, independiente de `modules/reportes` (el tablero actual). Rutas bajo `/reporteria/*`.
- **Web:** sección nueva **Reportería** en el menú (grupo Administración), rutas `/dashboard/reporteria/*`. No toca `/dashboard/reportes`.
- **Catálogo de tipos de reporte:** vive en código (`reporteria/catalogo/*.ts`), no en la base. Cada tipo declara:
  - clave, nombre, descripción en lenguaje simple y qué es una fila;
  - tabla principal y relaciones permitidas (los "objetos relacionados"), cada una con su camino de unión;
  - columnas: clave, nombre visible, origen, tipo de dato (texto, número, moneda, fecha, fecha y hora, sí/no, lista con nombres legibles), expresión SQL, si se puede sumar o agrupar, y si es sensible;
  - permiso y módulo del gimnasio que exige (por ejemplo, Ventas exige `transacciones:leer` y el módulo `puntoVenta`);
  - campo de fecha por defecto y campo de sucursal (para el alcance);
  - filtros "con / sin" disponibles.

### 3.2 Motor de consultas

- La **definición** de un reporte es un JSON versionado: tipo, formato, columnas, agrupaciones, totales, filtros, lógica, orden, límite, grupos personalizados y gráfico. Se valida contra el catálogo en cada ejecución: si una columna ya no existe, el reporte lo avisa en lugar de fallar.
- El **compilador** convierte la definición en **SQL parametrizado** (`Prisma.sql`, `Prisma.join`):
  - Los nombres de tablas y columnas salen **solo del catálogo** (lista blanca). Lo que escribe el usuario entra siempre como **parámetro**, nunca pegado al SQL.
  - Agrega siempre `organizacion_id = $org` y `deleted_at IS NULL` en cada tabla unida, y la sucursal si quien lo corre está limitado a una. Esto reemplaza al filtro automático (RLS) de Prisma, que no aplica a SQL crudo. Por eso el archivo va a `excludedFiles` del lint, con una prueba que exige que **toda** consulta generada lleve el filtro de organización.
  - Agrupa con `GROUP BY` / `GROUPING SETS` en la base: los totales no se calculan en memoria.
  - Fechas en la hora del gimnasio: `AT TIME ZONE zona_horaria`, tanto para filtrar "hoy" o "este mes" como para agrupar por día, semana o mes.
  - Corre en una transacción de solo lectura con `SET LOCAL statement_timeout`.
- **Por qué SQL generado y no Prisma:** Prisma no puede agrupar por columnas de tablas unidas, ni hacer subtotales o tablas cruzadas en la base. Traer todo y agrupar en memoria no escala con años de ventas.

### 3.3 Seguridad

- Permiso `reportes:*` para usar la sección, **más** el permiso del módulo de cada tipo: quien no tiene `transacciones:leer` no ve el tipo Ventas, ni en el constructor ni en un reporte compartido.
- Columnas **sensibles** fuera del catálogo: contraseñas, PIN, condiciones médicas y datos de contacto de emergencia.
- Las cuentas del portal del cliente ya quedan fuera por el cierre de `JwtAuthGuard`.
- Auditoría: exportar un reporte y compartir una carpeta se anotan con `registrarAuditoria`.

---

## 4. Tipos de reporte (catálogo)

| Tipo | Una fila por… | Relacionados | Columnas calculadas | Exige |
|---|---|---|---|---|
| **Clientes** | cliente | sucursal base; membresía vigente (resumen) | edad, días desde la última visita, antigüedad | `clientes:leer` |
| **Membresías** | membresía vendida | cliente, plan, promoción, sucursal, quién la vendió | días restantes, duración, % de descuento | `membresias:leer` |
| **Ventas (detalle)** | línea de venta | venta, cliente, plan/membresía, producto, sucursal, caja, cajero | margen (si hay costo), mes, semana y día | `transacciones:leer`, módulo `puntoVenta` |
| **Pagos** | pago recibido | venta, cuenta, sucursal | — | `pagos:leer` |
| **Gastos** | línea de gasto | proveedor, gasto recurrente, cuenta, sucursal | — | `transacciones:leer`, módulo `controlGastos` |
| **Asistencias** | ingreso al gimnasio | cliente, membresía, plan, sucursal, quién lo registró | tiempo de permanencia, hora del día, día de la semana | `asistencias:leer`, módulo `controlAcceso` |
| **Sesiones de clase** | sesión | disciplina, instructor, sala, sucursal | reservas, asistentes, % de ocupación, lista de espera | `clases:leer`, módulo `clasesGrupales` |
| **Reservas** | reserva | sesión, disciplina, cliente | anticipación de la reserva | `reservas:leer`, módulo `clasesGrupales` |
| **Cierres de caja** | apertura de caja | caja, sucursal, quién la abrió | diferencia (real − esperado), duración del turno | `aperturas_caja:leer` |
| **Inventario** | producto por sucursal | producto, sucursal | bajo el punto de reorden (sí/no), valor del stock | `inventarios:leer` |
| **Jornadas del equipo** | jornada | persona, sucursal | horas trabajadas, minutos de atraso, ausencias | `turnos:leer`, módulo `controlPersonal` |

**Filtros "con / sin" iniciales:** clientes con/sin membresía vigente, con/sin asistencias en un periodo y con/sin reservas; membresías con/sin asistencias.

**Fuera del catálogo:** `auditorias`, `notificaciones`, `api_keys`, `permisos`, `roles_permisos` y las columnas sensibles de `usuarios` y `perfiles_staff`.

---

## 5. CAMBIOS DE BASE DE DATOS

**DB-7: TABLAS NUEVAS `carpetas_reportes` Y `reportes`** (decisión R1). Una migración `2_reporteria`:

```
carpetas_reportes
  id, organizacion_id, nombre, descripcion
  visibilidad      PRIVADA | COMPARTIDA
  roles_ids        uuid[]   -- vacío + COMPARTIDA = todo el equipo con reportes:leer
  creado_por_id, created_at, updated_at, deleted_at
  -- el nombre no es único en la base (chocaría con las carpetas de la
  -- papelera): lo valida el servicio entre las no eliminadas

reportes
  id, organizacion_id, carpeta_id (NULL = "Mis reportes", privado)
  nombre, descripcion
  tipo_reporte     varchar  -- clave del catálogo
  formato          LISTA | AGRUPADO | TABLA_CRUZADA
  definicion       jsonb    -- columnas, filtros, agrupaciones... (con "version")
  es_plantilla     boolean  -- plantillas del sistema, de solo lectura
  creado_por_id, ultima_ejecucion, veces_ejecutado
  created_at, updated_at, deleted_at
```

- Se borran con papelera (`deleted_at`), como el resto.
- **Alternativa sin cambio de BD:** guardar los reportes en `organizaciones.configuracion`. No se recomienda: sin dueño por reporte, sin carpetas compartidas por rol y con un JSON que crece sin límite en cada lectura de la organización.

**DB-8 (solo si hace falta, fase 8): ÍNDICES.** Se agregan solo los que muestre `EXPLAIN` con datos de prueba grandes, por ejemplo `membresias (organizacion_id, fecha_fin)` y `registros_asistencia (organizacion_id, cliente_id, fecha_hora_ingreso)`. No cambian datos ni columnas.

**Sin cambio de estructura:** el permiso nuevo `reportes` es un dato del catálogo de permisos (`base.ts`).

---

## 6. La interfaz

- **Inicio de Reportería:** buscador, pestañas **Recientes · Mis reportes · Compartidos · Plantillas** y carpetas. Botón **Nuevo reporte**.
- **Nuevo reporte, paso 1:** "¿Qué quieres ver?", con las tarjetas de los tipos a los que la persona tiene acceso ("Ventas: una fila por cada venta").
- **Constructor** (estilo Salesforce, pantalla completa):
  - **Izquierda:** panel de columnas agrupadas por origen, con buscador. Se agregan con clic o arrastrando.
  - **Arriba:** pestañas **Columnas · Filtros · Agrupar · Gráfico**, y el selector de formato.
  - **Centro:** vista previa en vivo con las primeras 50 filas, que se actualiza al cambiar algo. En cada encabezado: ordenar, agrupar por esta columna, total (suma, promedio…) y quitar.
  - **Filtros:** los rápidos siempre visibles (fecha con rangos relativos, sucursal y "solo míos"). Debajo, "Agregar filtro" con operadores según el tipo de dato, y en experto la lógica "1 Y (2 O 3)" y los filtros con/sin.
  - **Guardar / Guardar como:** nombre, descripción y carpeta.
- **Vista del reporte:** los filtros rápidos se pueden cambiar sin editar el reporte. Muestra el gráfico (si tiene), la tabla con subtotales y el total general, paginada. Acciones: **Exportar (CSV / Excel), Editar, Duplicar, Imprimir** y "Actualizado hace 2 minutos".
- Funciona en celular: en pantallas chicas, la vista del reporte y la exportación; el constructor pide pantalla grande y lo dice.

---

## 7. API

| Ruta | Para qué |
|---|---|
| `GET /reporteria/tipos` | Catálogo filtrado por permisos, módulos y modo: tipos, columnas, operadores y filtros con/sin. |
| `POST /reporteria/vista-previa` | Ejecuta una definición sin guardarla (máximo 50 filas). |
| `POST /reporteria/ejecutar` | Ejecuta una definición o un reporte guardado, paginado, con subtotales. |
| `GET/POST/PUT/DELETE /reporteria/reportes` | Reportes guardados: crear, editar, borrar a papelera y restaurar. Además `POST …/:id/duplicar`. |
| `GET/POST/PUT/DELETE /reporteria/carpetas` | Carpetas y con quién se comparten. |
| `POST /reporteria/reportes/:id/exportar?formato=csv|xlsx` | Exportación completa, en archivo, hasta 50.000 filas. |

Dependencia nueva: **`exceljs`** en la API, para el Excel con formato. El CSV se genera sin librerías.

---

## 8. Fases (un commit por fase, pruebas en cada una)

### Fase 1: base de datos y permisos (HECHA)
- Migración **DB-7** (tablas `carpetas_reportes` y `reportes`, y enums).
- Permiso `reportes` en `base.ts` y en los roles base según la decisión R2.
- **Listo cuando:** `pnpm db:reset` crea todo; los roles tienen el permiso esperado.

### Fase 2: motor de consultas (núcleo) (HECHA)
- Estructura del catálogo y los **3 primeros tipos**: Ventas (detalle), Membresías y Asistencias.
- Compilador de la definición a SQL: formato **Lista** y **Agrupado** (hasta 3 niveles con subtotales), totales (cantidad, suma, promedio, mínimo, máximo), orden y límite.
- Filtros: rápidos (fecha con rangos relativos en la hora del gimnasio, sucursal, solo míos) y por columna con operadores por tipo de dato.
- Validación de la definición contra el catálogo.
- `GET /reporteria/tipos`, `POST /reporteria/vista-previa` y `POST /reporteria/ejecutar`.
- **Pruebas:**
  - toda consulta lleva `organizacion_id` y `deleted_at`;
  - un valor como `'; DROP TABLE` llega como parámetro;
  - los rangos relativos se calculan en La Paz con el servidor en UTC;
  - los subtotales cuadran con el total;
  - quien está limitado a una sucursal no ve otra.

### Fase 3: reportes guardados y carpetas (HECHA)
- CRUD de reportes y carpetas, duplicar, papelera, compartir por rol, `ultima_ejecucion` y `veces_ejecutado`.
- Un reporte compartido solo se abre si la persona también tiene el permiso del tipo.
- **Listo cuando:** el dueño guarda un reporte en una carpeta compartida con Recepción, Ana lo ve y lo corre, y un instructor no.

### Fase 4: constructor en la interfaz
- Inicio de Reportería, paso "¿Qué quieres ver?", constructor con panel de columnas, pestañas, vista previa en vivo, filtros y guardar.
- Formatos Lista y Agrupado.
- **Listo cuando:** se arma "Ventas de este mes por plan, con total" en menos de un minuto, sin escribir nada técnico. Se prueba en el navegador.

### Fase 5: vista del reporte y exportación
- Vista con paginación, subtotales, total general y filtros rápidos editables.
- Exportación **CSV** y **Excel** (`exceljs`: encabezado, formatos de moneda y fecha, subtotales y fila de total); impresión limpia.
- Auditoría de exportaciones.
- **Listo cuando:** el Excel abre sin avisos y los totales coinciden con la pantalla.

### Fase 6: el resto del catálogo y funciones avanzadas
- Tipos: Clientes, Pagos, Gastos, Sesiones de clase, Reservas, Cierres de caja, Inventario y Jornadas.
- **Tabla cruzada**, **filtros con/sin**, **lógica de filtros** ("1 Y (2 O 3)", con un analizador propio, nunca `eval`) y **grupos personalizados** (rangos y agrupaciones de valores).
- **Listo cuando:** "Clientes sin asistencias en los últimos 30 días con membresía vigente" y "Ingresos por mes × sucursal" dan lo mismo que una consulta hecha a mano.

### Fase 7: gráficos y plantillas
- Gráfico por reporte (barras, líneas o torta, con `recharts`, que ya está en el proyecto).
- **Plantillas del sistema** (`es_plantilla`), de solo lectura; se pueden duplicar para modificarlas:
  - Ventas de este mes por plan
  - Ingresos por mes y sucursal
  - Clientes que no vienen hace 30 días
  - Membresías por vencer en 7 días
  - Ocupación de clases de la semana
  - Diferencias de caja del mes
  - Productos bajo el punto de reorden
  - Atrasos del equipo del mes
- Visibilidad por modo (decisión R2).

### Fase 8: rendimiento, pruebas completas y cierre
- Datos de prueba grandes (un script con unas 200.000 ventas y 500.000 asistencias en la base local), `EXPLAIN` de los reportes más pesados e índices **DB-8** solo si hacen falta.
- Recorrido completo en el navegador (dueño, recepción e instructor; claro y oscuro; celular para ver y exportar), `pnpm db:reset` y documentación de cómo agregar un tipo de reporte nuevo al catálogo.

---

## 9. Para más adelante (fuera de este plan)

- **Envío programado** ("mándame este reporte cada lunes"): necesita un canal de correo, que hoy no existe (ver `plan-avisos-automaticos.md`).
- **Paneles** (dashboards) armados con varios reportes guardados.
- **Reportes unidos** (Joined reports): dos tipos lado a lado.
- **Fórmulas por fila y de resumen** escritas por el usuario (por ejemplo, "% del total").
- Exportar a **PDF** con formato.
