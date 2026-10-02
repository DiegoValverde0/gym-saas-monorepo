import { Prisma } from '@prisma/client';
import { ColumnaCatalogo, ContextoSql, ExpresionSql, TipoReporte } from '../catalogo';
import { Agrupacion, Definicion, FiltroCampo, FuncionTotal, Granularidad } from './definicion';
import { diaSiguiente, rangoDeFechas } from './fechas';
import { analizarLogica, sqlDeLogica, tipoConGrupos } from './avanzado';

// Compilador de reportes (docs/plan-reporteria.md, sección 3.2): definición
// validada -> SQL parametrizado. Reglas:
//  - Nombres de tablas y columnas: SOLO del catálogo (Prisma.raw de textos
//    fijos) y alias generados aquí ("c0", "g1"...). Nada escrito por el
//    usuario llega al SQL como texto: todo valor va como parámetro.
//  - Siempre filtra la organización y la papelera de la tabla principal (el
//    SQL crudo no pasa por la extensión RLS de Prisma). Las demás tablas se
//    unen por claves foráneas compuestas (id, organizacion_id), así que no
//    pueden traer filas de otro gimnasio.
//  - Todo se arma sobre una subconsulta "b" con cada expresión una sola vez;
//    las consultas de afuera (filas, totales) solo usan sus alias.

export const MAX_FILAS_EN_PANTALLA = 2000;
export const MAX_GRUPOS = 5000;

export interface ContextoEjecucion extends ContextoSql {
  organizacionId: string;
  usuarioId: string;
  /** Sucursal a la que está limitada la persona (undefined = todas). */
  sucursalAlcance?: string;
  /** Hoy en la hora del gimnasio (medianoche UTC). */
  hoy: Date;
  /** Fecha local "AAAA-MM-DD" -> instante UTC en que empieza ese día en el gimnasio. */
  inicioDelDia: (fecha: string) => Date;
}

export interface ReporteCompilado {
  /** Columnas de detalle, grupos y totales, con el alias de cada uno en el resultado. */
  mapa: {
    columnas: { clave: string; alias: string }[];
    grupos: { clave: string; alias: string; granularidad?: Granularidad }[];
    totales: { clave: string; funcion: FuncionTotal; alias: string }[];
    /** Tabla cruzada: lo que va en las columnas (alias "gc"). */
    columnaCruzada?: { clave: string; alias: string; granularidad?: Granularidad };
  };
  /** Filas de detalle, paginadas (null si el reporte agrupado oculta el detalle). */
  filas: ((pagina: number, porPagina: number) => Prisma.Sql) | null;
  /** Cantidad de filas y totales: general (LISTA) o por cada nivel de agrupación (AGRUPADO). */
  resumen: Prisma.Sql;
}

const TRUNC: Record<Granularidad, string> = { dia: 'day', semana: 'week', mes: 'month', anio: 'year' };
const AGREGADO: Record<Exclude<FuncionTotal, 'distintos'>, string> = { suma: 'sum', promedio: 'avg', minimo: 'min', maximo: 'max' };

const expresion = (sql: ExpresionSql, ctx: ContextoSql): Prisma.Sql => (typeof sql === 'string' ? Prisma.raw(sql) : sql(ctx));

// % y _ son comodines de LIKE: se escapan para buscar el texto tal cual.
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

function condicionDeFiltro(columna: ColumnaCatalogo, f: FiltroCampo, ctx: ContextoEjecucion): Prisma.Sql {
  const e = expresion(columna.sql, ctx);
  const texto = columna.tipo === 'texto' || columna.tipo === 'lista';
  switch (f.operador) {
    case 'vacio':
      return texto ? Prisma.sql`(${e} IS NULL OR ${e} = '')` : Prisma.sql`(${e} IS NULL)`;
    case 'no_vacio':
      return texto ? Prisma.sql`(${e} IS NOT NULL AND ${e} <> '')` : Prisma.sql`(${e} IS NOT NULL)`;
    case 'es_verdadero':
      return Prisma.sql`(${e} IS TRUE)`;
    case 'es_falso':
      return Prisma.sql`(${e} IS NOT TRUE)`;
    case 'en':
      return Prisma.sql`(${e} IN (${Prisma.join(f.valores!)}))`;
    case 'no_en':
      return Prisma.sql`(${e} IS NULL OR ${e} NOT IN (${Prisma.join(f.valores!)}))`;
    case 'contiene':
      return Prisma.sql`(${e} ILIKE ${`%${escaparLike(String(f.valor))}%`})`;
    case 'no_contiene':
      return Prisma.sql`(${e} IS NULL OR ${e} NOT ILIKE ${`%${escaparLike(String(f.valor))}%`})`;
    case 'empieza':
      return Prisma.sql`(${e} ILIKE ${`${escaparLike(String(f.valor))}%`})`;
  }

  if (columna.tipo === 'fechaHora') {
    // Fechas del gimnasio -> instantes: "el 5 de marzo" es desde las 00:00 del 5 hasta las 00:00 del 6, hora local.
    const inicio = (fecha: unknown) => ctx.inicioDelDia(String(fecha));
    const fin = (fecha: unknown) => ctx.inicioDelDia(diaSiguiente(String(fecha)));
    switch (f.operador) {
      case 'igual':
        return Prisma.sql`(${e} >= ${inicio(f.valor)} AND ${e} < ${fin(f.valor)})`;
      case 'antes':
        return Prisma.sql`(${e} < ${inicio(f.valor)})`;
      case 'despues':
        return Prisma.sql`(${e} >= ${fin(f.valor)})`;
      case 'entre':
        return Prisma.sql`(${e} >= ${inicio(f.valor)} AND ${e} < ${fin(f.valorHasta)})`;
    }
  }
  if (columna.tipo === 'fecha') {
    const d = (v: unknown) => Prisma.sql`${String(v)}::date`;
    switch (f.operador) {
      case 'igual':
        return Prisma.sql`(${e} = ${d(f.valor)})`;
      case 'antes':
        return Prisma.sql`(${e} < ${d(f.valor)})`;
      case 'despues':
        return Prisma.sql`(${e} > ${d(f.valor)})`;
      case 'entre':
        return Prisma.sql`(${e} >= ${d(f.valor)} AND ${e} <= ${d(f.valorHasta)})`;
    }
  }
  // Números y textos (igual / distinto) y comparaciones numéricas.
  const v = (x: unknown) => (columna.tipo === 'numero' || columna.tipo === 'moneda' ? Prisma.sql`${Number(x)}::numeric` : Prisma.sql`${String(x)}`);
  switch (f.operador) {
    case 'igual':
      return Prisma.sql`(${e} = ${v(f.valor)})`;
    case 'distinto':
      return Prisma.sql`(${e} IS DISTINCT FROM ${v(f.valor)})`;
    case 'mayor':
      return Prisma.sql`(${e} > ${v(f.valor)})`;
    case 'mayor_igual':
      return Prisma.sql`(${e} >= ${v(f.valor)})`;
    case 'menor':
      return Prisma.sql`(${e} < ${v(f.valor)})`;
    case 'menor_igual':
      return Prisma.sql`(${e} <= ${v(f.valor)})`;
    case 'entre':
      return Prisma.sql`(${e} BETWEEN ${v(f.valor)} AND ${v(f.valorHasta)})`;
  }
  throw new Error(`Operador sin traducir: ${f.operador}`);
}

export function compilarReporte(tipoBase: TipoReporte, def: Definicion, ctx: ContextoEjecucion): ReporteCompilado {
  // Los grupos personalizados son columnas más (con su CASE y su orden).
  const tipo = tipoConGrupos(tipoBase, def.gruposPersonalizados);
  const col = (clave: string) => tipo.columnas.find((c) => c.clave === clave)!;
  const a = tipo.tabla.alias;

  // ---- Relaciones: solo las que hacen falta, con sus dependencias.
  const necesarias = new Set<string>(tipo.obligatorias ?? []);
  const usar = (aliases?: string[]) => aliases?.forEach((x) => necesarias.add(x));
  const clavesUsadas = new Set([
    ...def.columnas,
    ...def.agrupaciones.map((g) => g.columna),
    ...(def.columnaCruzada ? [def.columnaCruzada.columna] : []),
    ...def.totales.map((t) => t.columna),
    ...def.filtros.campos.map((f) => f.columna),
    def.filtros.fecha.columna,
  ]);
  clavesUsadas.forEach((clave) => usar(col(clave).usa));
  const porSucursal = !!ctx.sucursalAlcance || !!def.filtros.sucursalId;
  if (porSucursal) usar(tipo.sucursal.usa);
  if (def.filtros.soloMios) usar(tipo.creadoPor?.usa);
  // Dependencias (planes necesita membresías, cajas necesita aperturas...).
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const r of tipo.relaciones) {
      if (!necesarias.has(r.alias)) continue;
      for (const req of r.requiere ?? []) {
        if (!necesarias.has(req)) {
          necesarias.add(req);
          cambio = true;
        }
      }
    }
  }
  const joins = tipo.relaciones.filter((r) => necesarias.has(r.alias)).map((r) => Prisma.raw(r.sql));

  // ---- WHERE
  const where: Prisma.Sql[] = [Prisma.sql`${Prisma.raw(`${a}.organizacion_id`)} = ${ctx.organizacionId}::uuid`];
  if (tipo.tabla.tieneDeletedAt) where.push(Prisma.raw(`${a}.deleted_at IS NULL`));
  (tipo.condiciones ?? []).forEach((c) => where.push(Prisma.raw(c)));

  const sucursal = Prisma.raw(tipo.sucursal.sql);
  if (ctx.sucursalAlcance) {
    where.push(
      tipo.sucursal.opcional
        ? Prisma.sql`(${sucursal} = ${ctx.sucursalAlcance}::uuid OR ${sucursal} IS NULL)`
        : Prisma.sql`${sucursal} = ${ctx.sucursalAlcance}::uuid`,
    );
  }
  if (def.filtros.sucursalId) where.push(Prisma.sql`${sucursal} = ${def.filtros.sucursalId}::uuid`);
  if (def.filtros.soloMios && tipo.creadoPor) where.push(Prisma.sql`${Prisma.raw(tipo.creadoPor.sql)} = ${ctx.usuarioId}::uuid`);

  const { columna: claveFecha, rango, desde: desdePers, hasta: hastaPers } = def.filtros.fecha;
  const rangoLocal = rangoDeFechas(rango, ctx.hoy, { desde: desdePers, hasta: hastaPers });
  const columnaFecha = col(claveFecha);
  const eFecha = expresion(columnaFecha.sql, ctx);
  const limiteFecha = (fecha: string) => (columnaFecha.tipo === 'fechaHora' ? Prisma.sql`${ctx.inicioDelDia(fecha)}` : Prisma.sql`${fecha}::date`);
  if (rangoLocal.desde) where.push(Prisma.sql`${eFecha} >= ${limiteFecha(rangoLocal.desde)}`);
  if (rangoLocal.hasta) where.push(Prisma.sql`${eFecha} < ${limiteFecha(rangoLocal.hasta)}`);

  // Filtros por columna: todos a la vez, o combinados con la lógica ("1 Y (2 O 3)").
  const condiciones = def.filtros.campos.map((f) => condicionDeFiltro(col(f.columna), f, ctx));
  if (def.filtros.logica) where.push(sqlDeLogica(analizarLogica(def.filtros.logica, condiciones.length).arbol, condiciones));
  else where.push(...condiciones);

  // Filtros "con / sin": EXISTS correlacionado (definido en el catálogo).
  for (const x of def.filtros.cruzados) {
    const cruzado = tipoBase.cruzados!.find((c) => c.clave === x.clave)!;
    const limites = cruzado.conRango ? rangoDeFechas(x.rango ?? 'todo', ctx.hoy) : {};
    const existe = cruzado.existe(ctx, limites.desde, limites.hasta);
    where.push(x.modo === 'sin' ? Prisma.sql`NOT ${existe}` : existe);
  }

  // ---- Subconsulta con cada expresión una sola vez, con alias propios.
  const select: Prisma.Sql[] = [];
  const mapa: ReporteCompilado['mapa'] = { columnas: [], grupos: [], totales: [] };
  def.columnas.forEach((clave, i) => {
    select.push(Prisma.sql`${expresion(col(clave).sql, ctx)} AS ${Prisma.raw(`c${i}`)}`);
    mapa.columnas.push({ clave, alias: `c${i}` });
  });
  // Un grupo: su expresión (por día/semana/mes/año si es fecha) y, si tiene
  // un orden propio (tramos de un grupo personalizado), "o..." para ordenar.
  const conOrden = new Set<string>();
  const agrupar = (g: Agrupacion, alias: string) => {
    const c = col(g.columna);
    const e = expresion(c.sql, ctx);
    let agrupada = e;
    if (g.granularidad) {
      const trunc = Prisma.raw(`'${TRUNC[g.granularidad]}'`);
      agrupada =
        c.tipo === 'fechaHora'
          ? Prisma.sql`date_trunc(${trunc}, (${e} AT TIME ZONE ${ctx.zonaHoraria}))::date`
          : Prisma.sql`date_trunc(${trunc}, (${e})::timestamp)::date`;
    }
    select.push(Prisma.sql`${agrupada} AS ${Prisma.raw(alias)}`);
    if (c.orden) {
      select.push(Prisma.sql`${expresion(c.orden, ctx)} AS ${Prisma.raw(`o${alias}`)}`);
      conOrden.add(alias);
    }
  };
  def.agrupaciones.forEach((g, i) => {
    agrupar(g, `g${i}`);
    mapa.grupos.push({ clave: g.columna, alias: `g${i}`, granularidad: g.granularidad });
  });
  if (def.columnaCruzada) {
    agrupar(def.columnaCruzada, 'gc');
    mapa.columnaCruzada = { clave: def.columnaCruzada.columna, alias: 'gc', granularidad: def.columnaCruzada.granularidad };
  }
  // En GROUP BY y ORDER BY, cada grupo va con su orden propio si lo tiene.
  const enConjunto = (alias: string) => (conOrden.has(alias) ? `${alias}, o${alias}` : alias);
  const ordenGrupo = (alias: string) => (conOrden.has(alias) ? `o${alias} NULLS LAST, ${alias} NULLS LAST` : `${alias} NULLS LAST`);
  // Una expresión por columna que se totaliza (aunque tenga varios totales).
  const fuentes = [...new Set(def.totales.map((t) => t.columna))];
  fuentes.forEach((clave, i) => select.push(Prisma.sql`${expresion(col(clave).sql, ctx)} AS ${Prisma.raw(`t${i}`)}`));
  if (select.length === 0) select.push(Prisma.raw('1 AS uno'));

  const base = Prisma.sql`SELECT ${Prisma.join(select, ', ')} FROM ${Prisma.raw(`${tipo.tabla.nombre} ${a}`)} ${
    joins.length ? Prisma.join(joins, ' ') : Prisma.empty
  } WHERE ${Prisma.join(where, ' AND ')}`;

  // ---- Totales
  const agregados: Prisma.Sql[] = [Prisma.raw('count(*) AS n')];
  def.totales.forEach((t, i) => {
    const fuente = Prisma.raw(`t${fuentes.indexOf(t.columna)}`);
    const alias = Prisma.raw(`a${i}`);
    agregados.push(
      t.funcion === 'distintos'
        ? Prisma.sql`count(DISTINCT ${fuente}) AS ${alias}`
        : Prisma.sql`${Prisma.raw(AGREGADO[t.funcion])}(${fuente}) AS ${alias}`,
    );
    mapa.totales.push({ clave: t.columna, funcion: t.funcion, alias: `a${i}` });
  });

  let resumen: Prisma.Sql;
  if (mapa.grupos.length === 0) {
    resumen = Prisma.sql`SELECT ${Prisma.join(agregados, ', ')} FROM (${base}) b`;
  } else {
    // Un conjunto por nivel: (g0, g1, g2), (g0, g1), (g0) y () = total general.
    // Tabla cruzada: cada nivel también con la columna (gc), así salen las
    // casillas, los totales de cada columna y los de cada fila.
    const g = mapa.grupos.map((x) => x.alias);
    const prefijos = g.map((_, i) => g.slice(0, g.length - i)).concat([[]]);
    const conjuntos = prefijos.flatMap((p) => {
      const sin = `(${p.map(enConjunto).join(', ')})`;
      return mapa.columnaCruzada ? [`(${[...p, 'gc'].map(enConjunto).join(', ')})`, sin] : [sin];
    });
    const seleccion = [...g, ...(mapa.columnaCruzada ? ['gc'] : [])];
    const marcas = [...g.map((x, i) => `GROUPING(${x}) AS x${i}`), ...(mapa.columnaCruzada ? ['GROUPING(gc) AS xc'] : [])];
    resumen = Prisma.sql`SELECT ${Prisma.raw(seleccion.join(', '))}, ${Prisma.raw(marcas.join(', '))}, ${Prisma.join(agregados, ', ')}
      FROM (${base}) b GROUP BY GROUPING SETS (${Prisma.raw(conjuntos.join(', '))})
      ORDER BY ${Prisma.raw(seleccion.map(ordenGrupo).join(', '))}
      LIMIT ${MAX_GRUPOS + 1}`;
  }

  // ---- Filas de detalle (agrupadas primero por sus grupos).
  const aliasDe = (clave: string) =>
    mapa.grupos.find((x) => x.clave === clave)?.alias ?? mapa.columnas.find((x) => x.clave === clave)?.alias;
  const orden = [
    ...mapa.grupos.map((x) => ordenGrupo(x.alias)),
    ...def.orden.map((o) => `${aliasDe(o.columna)} ${o.direccion === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST'}`),
  ];
  const visibles = [...mapa.grupos.map((x) => x.alias), ...mapa.columnas.map((x) => x.alias)];
  const filas =
    def.formato === 'TABLA_CRUZADA' || (def.formato === 'AGRUPADO' && !def.mostrarDetalle)
      ? null
      : (pagina: number, porPagina: number) =>
          Prisma.sql`SELECT ${Prisma.raw(visibles.join(', ') || '1 AS uno')} FROM (${base}) b
            ${orden.length ? Prisma.raw(`ORDER BY ${orden.join(', ')}`) : Prisma.empty}
            LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`;

  return { mapa, filas, resumen };
}
