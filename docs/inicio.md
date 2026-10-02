# El Inicio: cómo funciona y cómo agregar una tarjeta o una frase

Guía para quien mantiene la pantalla de Inicio. El plan con las decisiones y las fases está en [plan-inicio.md](plan-inicio.md).

## Qué tiene, de arriba abajo

1. **Acciones rápidas** (solo en modo simple va arriba de todo; en los otros modos, después de los primeros pasos).
2. **Aviso de ejemplos**, si el gimnasio todavía no tiene ventas ni ingresos.
3. **Indicadores:** los ingresos del mes en grande, los de hoy, las asistencias, los clientes activos y lo que vence en 7 días, cada uno con su comparación y su tendencia.
4. **Lo que hay que saber hoy:** hasta 4 frases con su botón.
5. **Primeros pasos** (hasta que se completan o se cierran).
6. **Las tarjetas:** gráficos y listas de la reportería, el estado de los clientes y los vencimientos, en el orden y tamaño que guardó el gimnasio (o el diseño sugerido).

Los tres modos ven lo mismo. El modo simple no elige tamaños (se acomodan solos), solo usa plantillas (no reportes guardados) y lleva la guía de 3 pasos (`components/ui/recorrido.tsx`).

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| La pantalla | `apps/web/src/app/dashboard/page.tsx` |
| Indicadores | `apps/web/src/components/inicio/indicadores.tsx`; la API en `GET /dashboard/kpis` (`dashboard.service.ts`, `indicadores.ts`, `series-diarias.ts`) |
| Lo que hay que saber hoy | `components/inicio/para-saber.tsx`; la API en `GET /dashboard/para-saber` (reglas en `dashboard/para-saber.ts`, consultas en `getParaSaber`) |
| Las tarjetas y "Personalizar" | `components/inicio/tablero.tsx` (modo edición con `@dnd-kit`) y `components/inicio/galeria.tsx` |
| Diseño sugerido, tamaños, tarjetas propias | `apps/web/src/lib/tablero.ts` |
| Datos de ejemplo | `apps/web/src/lib/ejemplos.ts` y `components/inicio/ejemplos.tsx` |
| Los gráficos | `apps/web/src/app/dashboard/reporteria/grafico-reporte.tsx` (los mismos de la reportería) |
| Paleta de los gráficos | `apps/web/src/lib/colores-graficos.ts` |

## Dónde se guarda el diseño

En `organizaciones.configuracion.tablero.tarjetas` (un diseño por gimnasio, sin columnas nuevas). Se guarda con `PUT /organizaciones/me/info` y lo valida `TarjetaTableroDto` (`organizacion/dto/update-mi-organizacion.dto.ts`):

- `id`: `plantilla:<clave>`, `reporte:<id>`, `estado-clientes` o `por-vencer`.
- `tamano`: `chica`, `mediana` o `ancha` (en una grilla de 6 columnas; en el celular, todas a lo ancho).
- `rango` (opcional): el período con el que se muestra; sin él, el del reporte.
- Hasta 16 tarjetas. `tarjetas: null` es "Volver al diseño sugerido".

Lo cambia quien tenga `organizaciones:actualizar`. Cada persona ve, de ese diseño, las tarjetas que su rol permite: las de reportería piden `reportes:leer` y el permiso y el módulo de su tipo de reporte; el estado de los clientes, `clientes:leer`; los vencimientos, `membresias:leer`.

## Agregar una tarjeta

**Si es un gráfico o una lista de datos, que sea una plantilla.** Una plantilla nueva en `apps/api/src/modules/reporteria/catalogo/plantillas.ts` aparece sola en la galería, se abre completa en la reportería y se puede exportar (ver [reporteria.md](reporteria.md)). Para que entre en el diseño sugerido, súmala a `disenoSugerido` en `lib/tablero.ts`, con la condición de su módulo.

- Las formas: barras, barras horizontales (agrupado), líneas, área (agrupado), torta, mapa de calor (tabla cruzada) y "destacar" (tabla cruzada en barras o líneas: la última fila en color y las demás en gris).
- La descripción no nombra el período: se puede cambiar en la tarjeta.
- Una tarjeta corre su reporte con 6 filas (`POST /reporteria/reportes/:id/ejecutar`, con `contar: false` para que cada visita al Inicio no cuente como una ejecución ni llene "Recientes"). Que su consulta sea rápida con un gimnasio grande.

**Si no sale de un reporte** (como el estado de los clientes), es una tarjeta propia:

1. Sumarla a `TARJETAS_PROPIAS` en `lib/tablero.ts`, con su permiso y su tamaño.
2. Sumar su `id` a la expresión de `TarjetaTableroDto.id` en la API.
3. Mostrarla en `contenido` de `useContenido` (`tablero.tsx`).

## Agregar una frase de "Lo que hay que saber hoy"

1. **El texto y cuándo se dice**, como función pura en `dashboard/para-saber.ts`: recibe los números y devuelve una `Frase` o `null`. Su `importancia` decide el orden (lo urgente arriba; hoy van de 30 a 90). Con su prueba en `para-saber.spec.ts`: singular y plural, el límite en que se dice y en que no.
2. **De dónde sale el número**, en `getParaSaber` (`dashboard.service.ts`), dentro de `regla(...)` (si falla, las demás se muestran igual):
   - Si cuenta lo mismo que una plantilla, córrela con `this.reporteria.correrPlantilla(clave, ctx)`: así el número coincide con lo que se ve al hacer clic, y ya respeta el permiso, el módulo y la sucursal.
   - Si es SQL directo, filtra a mano `organizacion_id`, `deleted_at` y la sucursal (el SQL crudo no pasa por la extensión RLS), y usa la zona horaria del gimnasio.
3. **Quién la ve:** revisa el permiso y el módulo. Lo del dinero (el ritmo del mes, la caja) es para quien administra (`organizaciones:actualizar`). El botón va a la plantilla con `plantilla(clave, pantallaSinReportes)`: sin la reportería, a la pantalla de siempre.
4. **Compárala con SQL** con los datos grandes antes de darla por buena.
5. **El tono** decide el ícono: `atencion` (triángulo ámbar), `bueno` (flecha verde) o `info` (foco).

## Los datos de ejemplo

`/dashboard/kpis` dice `conDatos` (si hay alguna venta o algún ingreso registrado). Sin datos, la página arma indicadores de ejemplo (`kpisDeEjemplo`) y cada tarjeta con gráfico cuyo resultado real viene vacío se llena con `resultadoDeEjemplo`, que toma los ejes del resultado real y solo inventa los números. Cada una dice "Ejemplo". Las listas no llevan ejemplo: serían personas inventadas. Una plantilla nueva con un eje raro puede necesitar su caso en `valoresDelEje` (por ejemplo, nombres para un eje de texto en `NOMBRES_TEXTO`).

## Probar

- Unidad: `apps/api/src/modules/dashboard/indicadores.spec.ts` y `para-saber.spec.ts`; `apps/web/src/lib/inicio.test.ts` (diseño sugerido y ejemplos).
- e2e: `apps/e2e/pruebas/inicio.spec.ts` (ver [pruebas-e2e.md](pruebas-e2e.md)).
- Con un gimnasio grande: cargar los datos grandes en `gym_e2e` y mirar el Inicio como dueño, recepción e instructor, en claro y oscuro y en el celular.
