# Plan: un Inicio que muestra el gimnasio de un vistazo

Pedido del usuario (2026-10-02): que la pantalla de Inicio sea más impactante y visual, que se pueda armar eligiendo entre los mejores gráficos de la reportería, y que sea "inteligente". Es la pantalla que vende el sistema a un emprendedor que no es técnico: tiene que entenderse sola, sin explicarle reportes.

---

## 1. Qué hay hoy

`apps/web/src/app/dashboard/page.tsx` y `apps/api/src/modules/dashboard`:

- Acciones rápidas (en modo simple), "Lo que pasa hoy" (simple), "Por vencer" y "Primeros pasos".
- 4 tarjetas de números: clientes activos, asistencias hoy, próximos a vencer e ingresos de hoy. Son números sueltos, sin comparación ("¿es mucho o poco?").
- Un gráfico de líneas de los ingresos de los últimos 7 días y una torta del estado de los clientes.
- Nada se puede cambiar, y un gimnasio nuevo, sin datos, ve todo en cero.

Lo que ya existe y se reutiliza:
- **Reportería:** 8 plantillas con gráfico, reportes guardados, `POST /reporteria/reportes/:id/ejecutar` (todo en menos de 1 s con 200.000 ventas) y el componente `grafico-reporte.tsx` (barras, líneas y torta).
- **El catálogo de asistencias** tiene día de la semana y hora. Con la tabla cruzada sale un **mapa de calor** de las horas con más gente.
- **`organizaciones.configuracion`** (JSON) ya guarda el modo, los módulos y la guía de inicio, que trae el tipo de gimnasio, el tamaño del equipo y si da clases.

---

## 2. La idea

El Inicio pasa a ser un **tablero de tarjetas** con tres franjas:

1. **Indicadores** (arriba, siempre): pocos números grandes, cada uno con **comparación** y una **línea chica de tendencia**.
   - Ingresos del mes, en grande, con lo mismo del mes pasado ("+18 % que a esta altura del mes pasado") y cuánto proyecta cerrar el mes.
   - Ingresos de hoy contra ayer.
   - Clientes activos, con las altas del mes.
   - Asistencias de hoy, contra el promedio del mismo día de la semana.
   - Membresías que vencen en 7 días.
2. **"Lo que hay que saber hoy":** de 2 a 4 frases automáticas, cada una con su botón. Por ejemplo:
   - "3 clientes con membresía activa no vienen hace 30 días" → Ver y avisar.
   - "Los martes a las 19:00 es tu hora más llena".
   - "Te quedan 2 productos por reponer".
   - "La caja de ayer cerró con un faltante de Bs. 20".
   Salen de reglas claras sobre los datos (sección 4), no de adivinar.
3. **Tus gráficos:** tarjetas elegidas de una **galería**: las plantillas de la reportería, algunas nuevas pensadas para el Inicio y los reportes guardados que tengan gráfico. Cada una con su propio rango ("este mes", "últimos 30 días"…) y "Ver el reporte completo".

**Personalizar el Inicio** abre la galería con una vista previa real de cada tarjeta. Se puede agregar, quitar, ordenar (arrastrando o con botones) y elegir el tamaño (chica, mediana o ancha). "Volver al diseño sugerido" deja todo como al principio.

**Inteligente desde el primer día:** si nadie lo personalizó, el Inicio se arma solo según el tipo de gimnasio, los módulos encendidos y el rol. Un gimnasio con clases ve la ocupación; recepción ve lo del día; el dueño, el dinero.

**Un gimnasio nuevo no ve todo en cero:** con "Ver con datos de ejemplo" cada tarjeta se llena con números de muestra, marcados como **Ejemplo**, para que se vea cómo va a quedar. Se apaga solo cuando hay datos reales.

---

## 3. Galería de tarjetas

| Tarjeta | Forma | De dónde sale |
|---|---|---|
| Ingresos por mes (este año contra el pasado) | Barras, el año actual destacado y el pasado en gris | Plantilla nueva (ventas por mes) |
| Ingresos por mes y sucursal | Líneas, una por sucursal | Plantilla existente |
| Ventas de este mes por plan | Barras horizontales, de mayor a menor | Plantilla existente |
| ¿A qué hora viene la gente? | **Mapa de calor** día × hora, un solo color de claro a oscuro | Plantilla nueva (asistencias, tabla cruzada) |
| Asistencias por día (últimos 30) | Área | Plantilla nueva |
| Clientes nuevos por mes | Barras | Plantilla nueva (clientes por mes de alta) |
| Estado de los clientes | Barra apilada horizontal: activos, por vencer, vencidos | La que hoy es torta |
| Ocupación de clases de la semana | Barras con la capacidad como referencia | Plantilla existente (si da clases) |
| Clientes que no vienen hace 30 días | Lista corta con "Avisar" por WhatsApp | Plantilla existente |
| Membresías por vencer en 7 días | Lista corta con "Avisar" | Lo que hoy es "Por vencer" |
| Productos bajo el punto de reorden | Lista corta | Plantilla existente (si vende productos) |
| Diferencias de caja del mes | Número + lista | Plantilla existente |
| Atrasos del equipo del mes | Barras horizontales por persona | Plantilla existente (si controla al personal) |
| Cualquier reporte guardado con gráfico | La del reporte | Reportería |

Las plantillas nuevas también quedan en la reportería, para abrirlas completas y exportarlas.

**Criterio visual** (guía de visualización de datos):
- Una sola escala por gráfico.
- La comparación como "destacado + gris", en vez de muchos colores.
- Magnitudes en un solo color, de claro a oscuro.
- Tortas solo para pocas partes de un todo. Para el estado de los clientes, una barra apilada se lee mejor.
- Paleta de categorías **validada para daltonismo** con el script de la guía, y que no use rojo ni ámbar, que quedan para avisos (faltante, por vencer). Hoy `grafico-reporte.tsx` usa rojo y ámbar como series: se corrige.
- Al pasar el mouse, cada punto muestra su valor.
- Modo oscuro con su propia paleta, también validada.
- Se ve bien en el celular.

---

## 4. "Lo que hay que saber hoy": las reglas

Cada regla mira los datos de hoy y, si se cumple, propone una frase con su botón. Se muestran las de mayor importancia, hasta 4. Algunos ejemplos:

| Regla | Cuándo | Frase y botón |
|---|---|---|
| Ritmo del mes | Ingresos del mes contra los mismos días del mes pasado, ±10 % o más | "Vas 18 % arriba del mes pasado" → Ver ingresos |
| Clientes en riesgo | Con membresía activa y sin venir hace 21 días o más | "5 clientes no vienen hace 3 semanas" → Ver y avisar |
| Por vencer | Membresías que vencen en 3 días | "4 membresías vencen esta semana" → Avisar |
| Hora pico | La franja con más ingresos de los últimos 30 días | "Tu hora más llena: martes 19:00" → Ver mapa |
| Caja | El último cierre con diferencia | "La caja de ayer cerró con un faltante de Bs. 20" → Ver cierre |
| Stock | Productos bajo el punto de reorden | "2 productos por reponer" → Ver |
| Clases | Una clase con más del 90 % o menos del 30 % de ocupación | "Funcional del lunes está llena" → Ver clases |

Cada frase respeta los permisos: recepción no ve la de la caja del dueño, y quien no vende productos no ve la de stock.

---

## 5. Decisiones (aprobadas el 2026-10-02: todas las recomendaciones)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| I1 | ¿Dónde se guarda el diseño del Inicio? | Uno por gimnasio, en `organizaciones.configuracion` · Uno por persona (**CAMBIO DE BASE DE DATOS**) | **Uno por gimnasio, sin cambio de base de datos:** lo arma el dueño y cada persona ve las tarjetas que su rol permite. El diseño por persona puede venir después. |
| I2 | ¿Qué se puede poner en el Inicio? | Plantillas y reportes guardados con gráfico · Solo plantillas | **Las dos cosas:** lo que el dueño arme en la reportería con un gráfico también puede ir al Inicio. En modo simple, solo plantillas. |
| I3 | ¿Cómo es lo "inteligente"? | Reglas claras · Inteligencia artificial | **Reglas claras:** son siempre ciertas, rápidas y sin costo, y no mandan datos del gimnasio afuera. La IA puede venir después. |
| I4 | ¿Datos de ejemplo para gimnasios sin datos? | Sí, marcados como Ejemplo · No | **Sí:** se encienden con un botón, cada tarjeta dice "Ejemplo" y se apagan solos cuando hay datos reales. Es lo que muestra a un posible cliente cómo va a quedar. |
| I5 | ¿Cómo se ordenan las tarjetas? | Arrastrar (con una librería chica, `@dnd-kit`) y botones · Solo botones | **Arrastrar y también botones** (subir / bajar), para el teclado y el celular. |
| I6 | ¿Qué pasa con la torta del estado de los clientes? | Barra apilada · Dejar la torta | **Barra apilada horizontal:** se compara mejor. La torta sigue disponible en la reportería. |
| I7 | ¿Y el modo simple? | El mismo tablero, con diseño sugerido y "Agregar / quitar" sencillo · Fijo | **El mismo tablero,** sin tamaños ni reportes guardados, y con las acciones rápidas arriba como hoy. La guía de 3 pasos se adapta. |

---

## 6. Fases (un commit por fase, con pruebas e2e)

Rama sugerida: `inicio`.

### Fase 1: indicadores con comparación (HECHA)
- API: `/dashboard/kpis` suma comparaciones (mes pasado a la misma altura, ayer, promedio del mismo día de la semana), la proyección del mes y la serie chica de cada indicador.
- Web: tarjetas de indicador (número grande, cambio con flecha y texto, línea de tendencia), con los ingresos del mes en grande.
- Paleta de gráficos validada (clara y oscura) y aplicada también a la reportería.
- **Listo cuando:** los números coinciden con SQL y se ven bien en claro, oscuro y celular.
- Hecho así:
  - API: `dashboard/indicadores.ts` (rangos "a la misma altura" en la hora del gimnasio, variación, proyección desde el día 3 y promedio de asistencias del mismo día de la semana hasta la misma hora; 6 pruebas) y `dashboard/series-diarias.ts` (sumas por día agrupadas en la base). `/dashboard/kpis` devuelve `ingresos` (o `null` sin `transacciones:leer`: antes los recibía también el instructor), `asistencias`, `clientes` y `membresiasPorVencer`. Antes "hoy" y "este mes" eran los del servidor y se contaba la fecha de carga de la venta.
  - Rendimiento: con 200.000 ventas y 500.000 asistencias responde en unos 65 ms (la primera versión, sumando en la API, tardaba 1,7 s). Los diez números comparados con SQL a mano coinciden.
  - Web: `components/inicio/indicadores.tsx` (los ingresos del mes en grande con su tendencia de 30 días, y tarjetas de ingresos de hoy, asistencias, clientes activos y vencimientos, cada una con su comparación). Son lo primero del Inicio. Las tendencias terminan ayer: hoy va a medias y parecía una caída.
  - Paleta: `lib/colores-graficos.ts`, validada con la guía de visualización de datos (claro y oscuro), aplicada a `grafico-reporte.tsx` (que usaba rojo y ámbar como series). Máximo 6 series; el resto, "Otros", en gris.
  - `RolesGuard` deja `request.permisos` para lo que se muestra según el rol.
  - Prueba e2e `inicio.spec.ts`: el dueño ve los ingresos y el instructor no, ni en la pantalla ni en la respuesta de la API.

### Fase 2: tarjetas de gráficos (HECHA)
- Componente de tarjeta (título, rango, "Ver el reporte completo", carga y vacío) que corre una plantilla o un reporte guardado.
- Formas nuevas en `grafico-reporte.tsx`: mapa de calor, área, barras horizontales y "destacado + gris".
- Plantillas nuevas: horas pico, asistencias por día, clientes nuevos por mes, ingresos este año contra el pasado y estado de los clientes.
- Diseño guardado en `configuracion.tablero`.
- **Listo cuando:** el Inicio muestra las tarjetas guardadas, cada una con su rango, y respeta los permisos de cada rol.
- Hecho así:
  - Reportería: tipos de gráfico `area`, `barrasH` (solo agrupado) y `calor` (solo tabla cruzada), y `destacar` (tabla cruzada en barras o líneas: la última fila en el color principal y las demás en gris). Columna nueva "Mes del año" en ventas. Cuatro plantillas nuevas: ingresos por mes de este año y los anteriores, ¿a qué hora viene la gente?, asistencias por día y clientes nuevos por mes (12 en total). El constructor ofrece cada forma solo donde sirve. La lista de reportes trae `clavePlantilla`.
  - El estado de los clientes no es una plantilla: es una tarjeta propia (barra apilada con Al día, Por empezar, Vencida y Sin membresía, decisión I6) sobre `/dashboard/segmentacion-clientes`. Se quitó `/dashboard/charts` y los dos gráficos viejos del Inicio.
  - Diseño: `organizaciones.configuracion.tablero.tarjetas` (sin cambios en la base), validado en `TarjetaTableroDto` (id de plantilla, reporte o tarjeta propia; tamaño chica, mediana o ancha; período sin "personalizado"; hasta 16). Sin diseño guardado se usa `DISENO_SUGERIDO` (`lib/tablero.ts`).
  - Web: `components/inicio/tablero.tsx`. Cada tarjeta corre su reporte con 6 filas, se le cambia el período ahí mismo, y lleva a "Ver completo". Se muestra según el permiso: `reportes:leer` para las de reportería, `clientes:leer` y `membresias:leer` para las propias. La lista de vencimientos muestra 8 y "Ver las N".
  - Lo que se corrigió al mirarlo con 200.000 ventas: comparando años, los meses sin datos (y los que no llegaron) quedan vacíos en vez de caer a 0, y el mes en curso va punteado; lo mismo con hoy en las curvas por día. Las descripciones de las plantillas no nombran el período (se puede cambiar en la tarjeta).
  - Mirado en claro y oscuro, como dueño, recepción (ve todo: tiene reportes y movimientos) e instructor (solo asistencias, clientes y el estado de los clientes). El mapa de calor se desliza de lado en el celular.
  - e2e: `inicio.spec.ts` suma las tarjetas del dueño (y el cambio de período) y lo que no ve el instructor. 30 pruebas.

### Fase 3: personalizar (HECHA)
- "Personalizar el Inicio": galería con vista previa, agregar, quitar, arrastrar o mover con botones, tamaño, y "Volver al diseño sugerido".
- **Listo cuando:** el dueño arma su Inicio y recepción lo ve con sus tarjetas permitidas.
- Hecho así:
  - "Personalizar el Inicio" (con `organizaciones:actualizar`) pasa el mismo Inicio a modo edición, con una barra fija arriba: Agregar tarjeta, Volver al diseño sugerido, Cancelar y Guardar. Cada tarjeta lleva su barra: los puntitos para arrastrar, mover antes y después, tamaño, período (las de reportería; "El del reporte" deja el suyo) y quitar. Mientras se edita, la tarjeta se ve pero no se toca.
  - Arrastrar con `@dnd-kit` (core, sortable, utilities), con el mouse o el dedo. Con el teclado se usan las flechas de cada tarjeta: el modo teclado de dnd-kit empezaba a arrastrar pero no movía tarjetas tan altas dentro del panel que se desliza, y dejaba la tarjeta "tomada"; se sacó. Los avisos para lectores de pantalla, en español.
  - Galería (`components/inicio/galeria.tsx`): las propias del Inicio, las plantillas y los reportes guardados con gráfico, con buscador. La elegida se ve de verdad, con los datos del gimnasio, antes de agregarla; las que ya están se marcan. Tamaño sugerido: ancha para el mapa de calor y las comparaciones de tabla cruzada. La lista de reportes trae `grafico` (su forma) para esto.
  - "Volver al diseño sugerido" guarda `tablero.tarjetas = null`: el Inicio vuelve a armarse solo (en la fase 4, según el gimnasio). La auditoría lo anota como "tarjetas del Inicio".
  - Mirado en claro y oscuro: agregar, quitar, mover con flechas y arrastrando, tamaño, período, cancelar y volver al sugerido, comparando con lo que guarda la API.
  - e2e: el dueño quita, mueve, agrega desde la galería y guarda; queda al recargar; recepción ve ese Inicio sin el botón; y vuelve al sugerido. El instructor tampoco ve el botón. 31 pruebas.

### Fase 4: inteligencia (HECHA)
- Diseño sugerido según el tipo de gimnasio, los módulos y el rol.
- "Lo que hay que saber hoy" (sección 4): endpoint con las reglas, con sus pruebas.
- Datos de ejemplo para gimnasios nuevos.
- **Listo cuando:** un gimnasio recién creado ve un Inicio completo (con ejemplos) y uno con datos ve frases ciertas, comparadas con SQL.
- Hecho así:
  - Diseño sugerido (`disenoSugerido` en `lib/tablero.ts`, con pruebas): quien administra ve primero el dinero (ingresos por año y ventas por plan); recepción e instructores, lo del día (vencimientos y quién no viene). Las de asistencias solo con control de acceso, la ocupación de clases con clases grupales (arriba si el asistente dijo box, estudio o artes marciales) y los atrasos con control del personal. Una mediana que queda sola entre dos anchas se agranda, para no dejar huecos. Se arma para quien mira mientras el gimnasio no guarde su diseño.
  - La galería ya escondía las plantillas de módulos apagados: la API no lista los reportes de tipos sin su módulo.
  - "Lo que hay que saber hoy": `GET /dashboard/para-saber`, reglas puras en `dashboard/para-saber.ts` (7 pruebas) y consultas en `getParaSaber`. Las que cuentan lo mismo que una tarjeta corren su plantilla (`ReporteriaService.correrPlantilla`), así el número coincide al hacer clic. Hasta 4, lo urgente primero:
    - Caja: el último cierre de ayer o de hoy con faltante (o sobrante, más abajo).
    - Clientes que no vienen: 30 días, no 21 como decía la sección 4, para que sea la misma lista de la plantilla. Solo si el gimnasio registra ingresos.
    - Vencen en 3 días (sin contar a quien ya renovó).
    - Ritmo del mes: ±10 % contra los mismos días del mes pasado, desde el día 3.
    - Stock en su punto de reorden.
    - Clases de los próximos 7 días: una llena (90 % o más) o, si no, la más vacía de hoy o mañana (30 % o menos, con 5 lugares o más).
    - Hora pico de los últimos 30 días, con cuántos por semana (con 50 ingresos o más).
  - El ritmo del mes y la caja son para quien administra (`organizaciones:actualizar`). Sin la reportería, el botón lleva a la pantalla de siempre (clientes, asistencias, productos, cajas).
  - Comparado con SQL con 200.000 ventas y 500.000 asistencias: clientes sin venir (201), vencen en 3 días (200) y la hora pico (jueves 2 h, 142; empata con las 15 h y gana la más temprana) coinciden. La caja, el stock y las clases, con casos armados en la base de pruebas (faltante de Bs. 20, 2 productos, Funcional con 18 de 20). Responde en unos 100 a 200 ms.
  - Datos de ejemplo (`lib/ejemplos.ts`, con pruebas): `/dashboard/kpis` dice `conDatos` (alguna venta o algún ingreso). Sin datos, los indicadores y las tarjetas con gráfico se llenan con números creíbles armados sobre el resultado real (vacío) de cada una, y cada una dice "Ejemplo". Las listas no llevan ejemplo (serían personas inventadas). "Ocultar los ejemplos" se recuerda en el navegador y "Ver con datos de ejemplo" los vuelve a mostrar. Con la primera venta o el primer ingreso se apagan solos.
  - Mirado en el navegador con un gimnasio recién creado (tipo box, con clases), en claro y oscuro, y con el de datos grandes.
  - e2e: las frases del dueño se ven, el instructor no recibe las del dinero ni botones a la reportería; un gimnasio sin datos (simulado cambiando `conDatos`) ve ejemplos, los oculta y los vuelve a mostrar; con datos no hay ejemplos. 34 pruebas.

### Fase 5: pulido y cierre
- Recorrido en el navegador: dueño, recepción e instructor; los tres modos; claro y oscuro; celular.
- Pruebas e2e del Inicio (personalizar, permisos, rangos).
- La guía de 3 pasos del modo simple adaptada.
- Documentación.

---

## 7. Para más adelante

- Diseño del Inicio por persona.
- Frases con inteligencia artificial.
- Metas del mes ("llegar a Bs. 30.000") con medidor.
- Pantalla para dejar en un televisor de recepción.
