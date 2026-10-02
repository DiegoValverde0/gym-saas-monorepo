# Reportería: cómo funciona y cómo agregar un tipo de reporte

Guía para quien mantiene el módulo. El plan con las decisiones y las fases está en [plan-reporteria.md](plan-reporteria.md).

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tipos de reporte (el catálogo) | `apps/api/src/modules/reporteria/catalogo/*.ts`, lista en `catalogo/index.ts` |
| Plantillas del sistema | `catalogo/plantillas.ts` (se copian solas a cada gimnasio) |
| Validar una definición | `motor/definicion.ts` (`validarDefinicion`) |
| Pasar la definición a SQL | `motor/compilador.ts` |
| Tabla cruzada, grupos personalizados, lógica de filtros | `motor/avanzado.ts` |
| Rangos de fecha ("este mes"...) | `motor/fechas.ts` |
| CSV y Excel | `motor/exportador.ts` |
| Correr y exportar, reportes guardados, carpetas | `reporteria.service.ts`, `reportes-guardados.service.ts` |
| Pantallas | `apps/web/src/app/dashboard/reporteria/` |

Todo el SQL vive en el catálogo y es fijo. El motor solo arma la consulta con esas piezas; lo que manda el usuario (valores de filtros, fechas, sucursal) entra siempre como parámetro. El motor agrega solo el filtro de organización, la papelera (`deleted_at`) y la sucursal de quien lo corre: el catálogo no los escribe.

## Agregar un tipo de reporte

1. **Un archivo en `catalogo/`** que exporte un `TipoReporte` (ver `catalogo/tipos.ts`). Lo más parecido a copiar es `clases.ts` o `pagos-gastos.ts`:
   - `clave` (fija, se guarda en los reportes), `nombre`, `descripcion` y `fila` ("Una fila por cada ...").
   - `permiso` del módulo que exige (por ejemplo `clases:leer`) y, si depende de un módulo del gimnasio, `moduloGimnasio`.
   - `tabla`: la tabla principal, su alias y si tiene `deleted_at`.
   - `relaciones`: cada JOIN con su alias. Usa `LEFT JOIN` salvo que la fila no tenga sentido sin la otra tabla; en ese caso va en `obligatorias`. Si un JOIN necesita otro antes, decláralo en `requiere`. Una tabla unida con papelera lleva `AND x.deleted_at IS NULL` en su JOIN.
   - `sucursal`: la columna de sucursal; `opcional: true` si hay filas sin sucursal que igual debe ver quien está limitado a una.
   - `fechaPorDefecto`: la clave de una columna `fecha` o `fechaHora` (la del filtro rápido). `rangoPorDefecto` solo si no conviene "últimos 30 días" (por ejemplo, "todo" para una foto de hoy, como Inventario).
   - `creadoPor` si tiene sentido "solo los míos".
2. **Las columnas.** Cada una con `clave`, `nombre`, `grupo` (el origen que se ve en el panel: "Venta", "Cliente"...), `tipo` y `sql`:
   - `tipo` decide los filtros, los totales y el formato: `texto`, `numero`, `moneda`, `fecha`, `fechaHora`, `booleano` o `lista` (con `opciones`: valor → nombre legible; los compartidos están en `NOMBRES`).
   - `usa`: los alias de relaciones que necesita la expresión.
   - Si depende de la zona horaria del gimnasio, `sql` es una función: `(ctx) => Prisma.sql\`...${ctx.zonaHoraria}...\`` (ver `enHoraLocal`).
   - Sin textos de relleno (`COALESCE(x, 'Sin cliente')`): lo vacío queda vacío, así funciona el filtro "está vacío" y la pantalla muestra "(sin dato)".
   - Nada sensible (condiciones médicas, contraseñas, documentos de identidad que no hagan falta).
3. **`columnasIniciales`**: las que se proponen al crear un reporte (cuatro a seis).
4. **Filtros "con / sin"** (opcional, modo experto): en `cruzados`, un `EXISTS (...)` correlacionado con la fila; si lleva rango, usa `entreFechas`.
5. **Sumarlo a `TIPOS_REPORTE`** en `catalogo/index.ts`, en el orden en que se ofrece.
6. **Probar:**
   - `pnpm test` en `apps/api`: `compilador.spec.ts` recorre todos los tipos y exige el filtro de organización y de papelera en toda consulta.
   - Contra la base: correr cada columna en lista, agrupada y filtrada, y comparar algunos valores con SQL hecho a mano. Los scripts usados están en `pruebas-reporteria/` (fuera del repo), por ejemplo `prueba_tipos_f6.py`.

No hace falta tocar la interfaz: el constructor, la vista, la exportación y los gráficos leen el catálogo de `GET /reporteria/tipos`.

## Cambiar o quitar una columna

Los reportes guardados guardan las claves de sus columnas. Si una clave cambia o desaparece, esos reportes avisan "ya no se puede correr: ..." y piden editarlos. Para no romperlos, cambia el nombre visible y deja la clave.

## Agregar o cambiar una plantilla

Se escriben en `catalogo/plantillas.ts` con una `clave` fija y una definición como la de cualquier reporte. Al prender la API, la primera vez que alguien de cada gimnasio abre Reportería, se crean las que faltan, se actualizan las que cambiaron y van a la papelera las que se quitaron. El id de cada una sale del gimnasio y de la clave (UUID v5), así que no cambies la clave de una plantilla existente. `plantillas.spec.ts` comprueba que todas se validan y se compilan.

## Límites

- En pantalla: hasta 2.000 filas, en páginas de 50. Al exportar: hasta 50.000 filas.
- Cada consulta corta a los 15 segundos y corre en solo lectura.
- Tabla cruzada: hasta 50 columnas. Agrupado: hasta 5.000 grupos en pantalla.

## Rendimiento medido (fase 8)

En la base local con 200.000 ventas, 500.000 asistencias y 3.000 clientes, todas las consultas de los 11 tipos (lista, agrupado y tabla cruzada, con todas las fechas) respondieron en menos de 1 segundo, así que no se agregaron índices. Exportar 44.000 filas tarda unos 3 s a Excel y 1 s a CSV. Si un gimnasio crece mucho más, lo primero a mirar es un `EXPLAIN` de la consulta del tipo con el rango más usado.
