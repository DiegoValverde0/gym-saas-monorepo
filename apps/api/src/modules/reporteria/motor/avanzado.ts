import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ColumnaCatalogo, ContextoSql, TipoReporte } from '../catalogo';

// Funciones del modo experto (docs/plan-reporteria.md, fase 6): grupos
// personalizados, lógica de filtros y filtros "con / sin". Todo lo que
// escribe el usuario (etiquetas, valores) llega al SQL como parámetro.

export const MAX_GRUPOS_PERSONALIZADOS = 5;
export const MAX_CRUZADOS = 3;
const MAX_TRAMOS = 10;

const error = (mensaje: string): never => {
  throw new BadRequestException(mensaje);
};
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown, max: number, que: string) => {
  if (typeof v !== 'string' || !v.trim()) error(`Falta ${que}.`);
  const t = (v as string).trim();
  if (t.length > max) error(`${que.replace(/^./, (c) => c.toUpperCase())} es demasiado largo (hasta ${max} letras).`);
  return t;
};

// ---------------------------------------------------------------------------
// Grupos personalizados ("buckets"): una columna nueva que agrupa los valores
// de otra. Números en tramos ("Menos de 100", "100 a 500"...), textos y listas
// en conjuntos ("Mensuales" = Mensual + Mensual Musculación).
// ---------------------------------------------------------------------------

export interface GrupoPersonalizado {
  clave: string;
  nombre: string;
  columna: string;
  /** Números: cada tramo llega HASTA ese valor (sin incluirlo), en orden. */
  rangos?: { hasta: number; etiqueta: string }[];
  /** Textos y listas: qué valores van en cada grupo. */
  valores?: { etiqueta: string; valores: string[] }[];
  /** Lo que no entra en ningún tramo o grupo (y lo vacío). */
  otros: string;
}

export function validarGruposPersonalizados(entrada: unknown, tipo: TipoReporte): GrupoPersonalizado[] {
  const lista = Array.isArray(entrada) ? entrada : [];
  if (lista.length > MAX_GRUPOS_PERSONALIZADOS) error(`Se pueden crear hasta ${MAX_GRUPOS_PERSONALIZADOS} grupos personalizados.`);
  const claves = new Set<string>();
  return lista.map((g, i) => {
    if (!esObjeto(g)) error(`El grupo personalizado ${i + 1} no es válido.`);
    const x = g as Record<string, unknown>;
    if (typeof x.clave !== 'string' || !/^gp\d{1,2}$/.test(x.clave) || claves.has(x.clave)) error(`La clave del grupo personalizado ${i + 1} no es válida.`);
    claves.add(x.clave as string);
    const nombre = texto(x.nombre, 60, 'el nombre del grupo personalizado');
    const base = tipo.columnas.find((c) => c.clave === x.columna);
    if (!base) error(`El grupo "${nombre}" usa una columna que no existe.`);
    const otros = typeof x.otros === 'string' && x.otros.trim() ? texto(x.otros, 40, 'la etiqueta de "otros"') : 'Otros';
    const grupo: GrupoPersonalizado = { clave: x.clave as string, nombre, columna: base!.clave, otros };

    if (base!.tipo === 'numero' || base!.tipo === 'moneda') {
      const rangos = Array.isArray(x.rangos) ? x.rangos : [];
      if (rangos.length === 0 || rangos.length > MAX_TRAMOS) error(`El grupo "${nombre}" necesita entre 1 y ${MAX_TRAMOS} tramos.`);
      let anterior = -Infinity;
      grupo.rangos = rangos.map((r, j) => {
        if (!esObjeto(r)) error(`El tramo ${j + 1} de "${nombre}" no es válido.`);
        const hasta = Number((r as Record<string, unknown>).hasta);
        if (!Number.isFinite(hasta) || hasta <= anterior) error(`En "${nombre}", cada tramo tiene que llegar más alto que el anterior.`);
        anterior = hasta;
        return { hasta, etiqueta: texto((r as Record<string, unknown>).etiqueta, 40, `el nombre del tramo ${j + 1}`) };
      });
    } else if (base!.tipo === 'texto' || base!.tipo === 'lista') {
      const conjuntos = Array.isArray(x.valores) ? x.valores : [];
      if (conjuntos.length === 0 || conjuntos.length > MAX_TRAMOS) error(`El grupo "${nombre}" necesita entre 1 y ${MAX_TRAMOS} conjuntos.`);
      const usados = new Set<string>();
      grupo.valores = conjuntos.map((c, j) => {
        if (!esObjeto(c)) error(`El conjunto ${j + 1} de "${nombre}" no es válido.`);
        const etiqueta = texto((c as Record<string, unknown>).etiqueta, 40, `el nombre del conjunto ${j + 1}`);
        const valores = (c as Record<string, unknown>).valores;
        if (!Array.isArray(valores) || valores.length === 0 || valores.length > 50) error(`El conjunto "${etiqueta}" necesita entre 1 y 50 valores.`);
        for (const crudo of valores as unknown[]) {
          if (typeof crudo !== 'string' || !crudo.trim() || crudo.length > 100) error(`Un valor de "${etiqueta}" no es válido.`);
          const v = crudo as string;
          if (base!.tipo === 'lista' && !(base!.opciones && v in base!.opciones)) error(`"${v}" no es un valor de "${base!.nombre}".`);
          if (usados.has(v)) error(`"${base!.opciones?.[v] ?? v}" está en dos conjuntos de "${nombre}".`);
          usados.add(v);
        }
        return { etiqueta, valores: valores as string[] };
      });
    } else {
      error(`No se pueden hacer grupos personalizados con "${base!.nombre}".`);
    }
    return grupo;
  });
}

/** La columna virtual de un grupo personalizado: la etiqueta, y un número para ordenar los tramos. */
function columnaVirtual(g: GrupoPersonalizado, base: ColumnaCatalogo): ColumnaCatalogo {
  const e = (ctx: ContextoSql) => (typeof base.sql === 'string' ? Prisma.raw(base.sql) : base.sql(ctx));
  const casos = (ctx: ContextoSql, valor: (i: number, etiqueta: string) => Prisma.Sql, otros: Prisma.Sql) => {
    const expr = e(ctx);
    const ramas = g.rangos
      ? g.rangos.map((r, i) => Prisma.sql`WHEN ${expr} < ${r.hasta}::numeric THEN ${valor(i, r.etiqueta)}`)
      : g.valores!.map((c, i) => Prisma.sql`WHEN ${expr}::text IN (${Prisma.join(c.valores)}) THEN ${valor(i, c.etiqueta)}`);
    return Prisma.sql`(CASE ${Prisma.join(ramas, ' ')} ELSE ${otros} END)`;
  };
  const cuantos = (g.rangos ?? g.valores!).length;
  return {
    clave: g.clave,
    nombre: g.nombre,
    grupo: 'Grupos personalizados',
    tipo: 'texto',
    usa: base.usa,
    sql: (ctx) => casos(ctx, (_i, etiqueta) => Prisma.sql`${etiqueta}::text`, Prisma.sql`${g.otros}::text`),
    orden: (ctx) => casos(ctx, (i) => Prisma.sql`${i}::int`, Prisma.sql`${cuantos}::int`),
  };
}

/** El tipo con sus columnas más las de los grupos personalizados de la definición. */
export function tipoConGrupos(tipo: TipoReporte, grupos: GrupoPersonalizado[]): TipoReporte {
  if (grupos.length === 0) return tipo;
  const virtuales = grupos.map((g) => columnaVirtual(g, tipo.columnas.find((c) => c.clave === g.columna)!));
  return { ...tipo, columnas: [...tipo.columnas, ...virtuales] };
}

// ---------------------------------------------------------------------------
// Lógica de filtros: "1 Y (2 O 3)", "NO 1 O 2"... Analizador propio (nada de
// eval): números, Y/O/NO (o AND/OR/NOT) y paréntesis.
// ---------------------------------------------------------------------------

export type NodoLogica = { n: number } | { y: NodoLogica[] } | { o: NodoLogica[] } | { no: NodoLogica };

export function analizarLogica(entrada: string, cantidadFiltros: number): { arbol: NodoLogica; normalizada: string } {
  const fuente = entrada.trim();
  if (fuente.length > 200) error('La lógica de filtros es demasiado larga.');
  const fichas: string[] = [];
  const patron = /\s*(\d+|\(|\)|[A-Za-zÁÉÍÓÚáéíóú]+)/y;
  let resto = fuente;
  while (resto.trim()) {
    patron.lastIndex = 0;
    const m = patron.exec(resto);
    if (!m) error(`No entiendo la lógica de filtros cerca de "${resto.trim().slice(0, 10)}".`);
    const ficha = m![1].toUpperCase();
    const palabra = { AND: 'Y', OR: 'O', NOT: 'NO' }[ficha] ?? ficha;
    if (!/^\d+$/.test(palabra) && !['Y', 'O', 'NO', '(', ')'].includes(palabra)) error(`"${m![1]}" no es parte de la lógica: usa números, Y, O, NO y paréntesis.`);
    fichas.push(palabra);
    resto = resto.slice(m![0].length);
  }
  let i = 0;
  const usados = new Set<number>();
  const mirar = () => fichas[i];
  const tomar = (esperada?: string) => {
    const f = fichas[i++];
    if (esperada && f !== esperada) error(esperada === ')' ? 'Falta cerrar un paréntesis en la lógica.' : `Falta "${esperada}" en la lógica.`);
    if (f === undefined) error('La lógica de filtros está incompleta.');
    return f;
  };
  const expresion = (): NodoLogica => {
    const partes = [termino()];
    while (mirar() === 'O') {
      tomar();
      partes.push(termino());
    }
    return partes.length === 1 ? partes[0] : { o: partes };
  };
  const termino = (): NodoLogica => {
    const partes = [factor()];
    while (mirar() === 'Y') {
      tomar();
      partes.push(factor());
    }
    return partes.length === 1 ? partes[0] : { y: partes };
  };
  const factor = (): NodoLogica => {
    const f = tomar();
    if (f === 'NO') return { no: factor() };
    if (f === '(') {
      const dentro = expresion();
      tomar(')');
      return dentro;
    }
    if (/^\d+$/.test(f)) {
      const n = Number(f);
      if (n < 1 || n > cantidadFiltros) error(`La lógica usa el filtro ${n}, pero hay ${cantidadFiltros}.`);
      usados.add(n);
      return { n };
    }
    return error(`La lógica de filtros tiene "${f}" donde va un número.`);
  };
  const arbol = expresion();
  if (i < fichas.length) error(`Sobra "${fichas[i]}" en la lógica de filtros.`);
  for (let n = 1; n <= cantidadFiltros; n++) if (!usados.has(n)) error(`La lógica no usa el filtro ${n}: inclúyelo o quítalo.`);
  return { arbol, normalizada: fichas.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')') };
}

/** Arma la condición SQL con las condiciones de cada filtro (filtro 1 = condiciones[0]). */
export function sqlDeLogica(arbol: NodoLogica, condiciones: Prisma.Sql[]): Prisma.Sql {
  if ('n' in arbol) return condiciones[arbol.n - 1];
  if ('no' in arbol) return Prisma.sql`(NOT ${sqlDeLogica(arbol.no, condiciones)})`;
  const partes = ('y' in arbol ? arbol.y : arbol.o).map((x) => sqlDeLogica(x, condiciones));
  return Prisma.sql`(${Prisma.join(partes, 'y' in arbol ? ' AND ' : ' OR ')})`;
}
