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

### Fase 2: tarjetas de gráficos
- Componente de tarjeta (título, rango, "Ver el reporte completo", carga y vacío) que corre una plantilla o un reporte guardado.
- Formas nuevas en `grafico-reporte.tsx`: mapa de calor, área, barras horizontales y "destacado + gris".
- Plantillas nuevas: horas pico, asistencias por día, clientes nuevos por mes, ingresos este año contra el pasado y estado de los clientes.
- Diseño guardado en `configuracion.inicio`.
- **Listo cuando:** el Inicio muestra las tarjetas guardadas, cada una con su rango, y respeta los permisos de cada rol.

### Fase 3: personalizar
- "Personalizar el Inicio": galería con vista previa, agregar, quitar, arrastrar o mover con botones, tamaño, y "Volver al diseño sugerido".
- **Listo cuando:** el dueño arma su Inicio y recepción lo ve con sus tarjetas permitidas.

### Fase 4: inteligencia
- Diseño sugerido según el tipo de gimnasio, los módulos y el rol.
- "Lo que hay que saber hoy" (sección 4): endpoint con las reglas, con sus pruebas.
- Datos de ejemplo para gimnasios nuevos.
- **Listo cuando:** un gimnasio recién creado ve un Inicio completo (con ejemplos) y uno con datos ve frases ciertas, comparadas con SQL.

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
