import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { obtenerAccesoVigente } from '../../common/utils/acceso-vigente.util';
import { MODULOS_POR_DEFECTO } from '../../common/utils/modulo.util';
import { modoDeConfiguracion, ModoUso } from '../../common/utils/modo.util';
import { aHoraLocal, desdeHoraLocal, ZONA_HORARIA_DEFAULT } from '../../common/utils/zona-horaria.util';
import { ModuloTenant } from '../../common/decorators/requiere-modulo.decorator';
import { TIPOS_REPORTE, tipoReporte, TipoReporte } from './catalogo';
import { Definicion, FORMATOS, Granularidad, FUNCIONES_TOTAL, GRANULARIDADES, OPERADORES, RANGOS_FECHA, validarDefinicion } from './motor/definicion';
import { compilarReporte, ContextoEjecucion, MAX_FILAS_EN_PANTALLA, MAX_GRUPOS, ReporteCompilado } from './motor/compilador';

// Una consulta de reporte no puede tardar más que esto (decisión R4).
const TIEMPO_MAXIMO_MS = 15_000;
// Exportar: hasta 50.000 filas (decisión R4).
export const MAX_FILAS_EXPORTACION = 50_000;

export interface Contexto {
  ejecucion: ContextoEjecucion;
  /** Rol en esta organización (para las carpetas compartidas por rol). */
  rolId: string | null;
  permisos: string[];
  modulos: Record<ModuloTenant, boolean>;
  modo: ModoUso;
}

export interface ResultadoReporte {
  definicion: Definicion;
  columnas: { clave: string; nombre: string; tipo: string; opciones?: Record<string, string> }[];
  agrupaciones: { clave: string; nombre: string; tipo: string; granularidad?: Granularidad; opciones?: Record<string, string> }[];
  totales: { clave: string; funcion: string; nombre: string; tipo: string }[];
  /** Filas de detalle: grupos (g0, g1...) y columnas por su clave. */
  filas: Record<string, unknown>[] | null;
  /** Por nivel: 0 = total general, 1 = primer grupo, etc. */
  resumenes: { nivel: number; grupo: unknown[]; cantidad: number; totales: (number | string | null)[] }[];
  totalFilas: number;
  pagina: number;
  porPagina: number;
  /** Hay más filas de las que se pueden ver en pantalla (se exportan o se filtran). */
  recortado: boolean;
  gruposRecortados: boolean;
}

/**
 * Reportería (docs/plan-reporteria.md): catálogo de tipos y ejecución de
 * definiciones.
 *
 * Usa el cliente crudo de Prisma a propósito (ver excludedFiles en
 * .eslintrc.js): corre SQL generado por el compilador, que agrega él mismo el
 * filtro de organización y de sucursal (el SQL crudo no pasa por la
 * extensión RLS). Las pruebas del compilador exigen ese filtro.
 */
@Injectable()
export class ReporteriaService {
  private readonly logger = new Logger(ReporteriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
  ) {}

  async contexto(): Promise<Contexto> {
    const organizacionId: string | undefined = this.cls.get('organizacionId');
    const usuarioId: string | undefined = this.cls.get('usuarioId');
    if (!organizacionId || !usuarioId) throw new ForbiddenException('Selecciona una organización para usar la reportería.');
    const [org, acceso, asignacion] = await Promise.all([
      this.prisma.organizacion.findUnique({ where: { id: organizacionId }, select: { configuracion: true, zonaHoraria: true } }),
      obtenerAccesoVigente(this.prisma, this.redis, usuarioId, organizacionId),
      // Misma asignación que usa obtenerAccesoVigente (la más antigua).
      this.prisma.asignacionAcceso.findFirst({
        where: { usuarioId, organizacionId },
        orderBy: { createdAt: 'asc' },
        select: { rolId: true },
      }),
    ]);
    const zonaHoraria = org?.zonaHoraria ?? ZONA_HORARIA_DEFAULT;
    const guardados = (org?.configuracion as { modulos?: Partial<Record<ModuloTenant, boolean>> } | null)?.modulos ?? {};
    return {
      ejecucion: {
        organizacionId,
        usuarioId,
        sucursalAlcance: this.cls.get('sucursalId') ?? undefined,
        zonaHoraria,
        hoy: aHoraLocal(new Date(), zonaHoraria).fechaSolo,
        inicioDelDia: (fecha: string) => desdeHoraLocal(new Date(`${fecha}T00:00:00Z`), 0, zonaHoraria),
      },
      rolId: asignacion?.rolId ?? null,
      permisos: acceso?.permisos ?? [],
      modulos: { ...MODULOS_POR_DEFECTO, ...guardados },
      modo: modoDeConfiguracion(org?.configuracion),
    };
  }

  disponible(tipo: TipoReporte, ctx: Contexto) {
    return ctx.permisos.includes(tipo.permiso) && (!tipo.moduloGimnasio || ctx.modulos[tipo.moduloGimnasio]);
  }

  /** Tipos de reporte que esta persona puede usar, con sus columnas y opciones de filtro. */
  async tipos() {
    const ctx = await this.contexto();
    return {
      modo: ctx.modo,
      formatos: ctx.modo === 'simple' ? [] : FORMATOS,
      rangosFecha: RANGOS_FECHA,
      granularidades: GRANULARIDADES,
      funcionesTotal: FUNCIONES_TOTAL,
      operadores: OPERADORES,
      maxFilasEnPantalla: MAX_FILAS_EN_PANTALLA,
      tipos: TIPOS_REPORTE.filter((t) => this.disponible(t, ctx)).map((t) => ({
        clave: t.clave,
        nombre: t.nombre,
        descripcion: t.descripcion,
        fila: t.fila,
        fechaPorDefecto: t.fechaPorDefecto,
        columnasIniciales: t.columnasIniciales,
        tieneSoloMios: !!t.creadoPor,
        columnas: t.columnas.map((c) => ({
          clave: c.clave,
          nombre: c.nombre,
          grupo: c.grupo,
          tipo: c.tipo,
          opciones: c.opciones,
          ayuda: c.ayuda,
          agrupable: c.agrupable !== false,
        })),
      })),
    };
  }

  /**
   * Ejecuta una definición armada en el constructor (sin guardar). En modo
   * simple no se arman reportes: solo se usan las plantillas (decisión R2).
   */
  async ejecutarDefinicion(entrada: unknown, pagina = 1, porPagina = 50): Promise<ResultadoReporte> {
    const ctx = await this.contexto();
    if (ctx.modo === 'simple') {
      throw new ForbiddenException('En modo simple se usan los reportes listos (plantillas). Para armar reportes, cambia a modo intermedio.');
    }
    const clave = (entrada as { tipo?: unknown } | null)?.tipo;
    const tipo = typeof clave === 'string' ? tipoReporte(clave) : undefined;
    if (!tipo) throw new NotFoundException('Ese tipo de reporte no existe.');
    if (!this.disponible(tipo, ctx)) throw new ForbiddenException(`No tienes acceso al reporte de ${tipo.nombre}.`);
    const definicion = validarDefinicion(entrada, tipo);
    return this.ejecutar(tipo, definicion, ctx, pagina, porPagina);
  }

  /**
   * `limite`: cuántas filas de detalle se pueden pedir en total (2.000 en
   * pantalla e impresión; 50.000 al exportar, en una sola página).
   */
  async ejecutar(
    tipo: TipoReporte,
    definicion: Definicion,
    ctx: Contexto,
    pagina: number,
    porPagina: number,
    limite = MAX_FILAS_EN_PANTALLA,
  ): Promise<ResultadoReporte> {
    if (definicion.filtros.sucursalId && ctx.ejecucion.sucursalAlcance && definicion.filtros.sucursalId !== ctx.ejecucion.sucursalAlcance) {
      throw new ForbiddenException('Tu acceso está limitado a otra sucursal.');
    }
    porPagina = Math.min(Math.max(1, Math.floor(porPagina) || 50), limite);
    pagina = Math.max(1, Math.floor(pagina) || 1);
    if (pagina * porPagina > limite + porPagina - 1) {
      throw new BadRequestException(`En pantalla se ven hasta ${MAX_FILAS_EN_PANTALLA} filas. Filtra más o exporta el reporte.`);
    }

    const compilado = compilarReporte(tipo, definicion, ctx.ejecucion);
    const { filasCrudas, resumenCrudo } = await this.consultar(compilado, pagina, porPagina);

    const col = (clave: string) => tipo.columnas.find((c) => c.clave === clave)!;
    const normalizar = (clave: string, valor: unknown) => normalizarValor(col(clave).tipo, valor);
    const grupos = compilado.mapa.grupos;

    const filas =
      filasCrudas?.map((f) => {
        const fila: Record<string, unknown> = {};
        grupos.forEach((g, i) => (fila[`g${i}`] = normalizarValor(g.granularidad ? 'fecha' : col(g.clave).tipo, f[g.alias])));
        compilado.mapa.columnas.forEach((c) => (fila[c.clave] = normalizar(c.clave, f[c.alias])));
        return fila;
      }) ?? null;

    const resumenes = resumenCrudo.map((r) => {
      // En GROUPING SETS, GROUPING(gX) = 1 cuando ese nivel no agrupa por gX.
      const nivel = grupos.filter((_, i) => Number(r[`x${i}`] ?? 1) === 0).length;
      return {
        nivel,
        grupo: grupos.slice(0, nivel).map((g) => normalizarValor(g.granularidad ? 'fecha' : col(g.clave).tipo, r[g.alias])),
        cantidad: Number(r.n),
        totales: compilado.mapa.totales.map((t) =>
          t.funcion === 'distintos' ? Number(r[t.alias]) : (normalizar(t.clave, r[t.alias]) as number | string | null),
        ),
      };
    });
    const general = resumenes.find((r) => r.nivel === 0);
    const totalFilas = general?.cantidad ?? 0;
    const nombreTotal = { suma: 'Suma', promedio: 'Promedio', minimo: 'Mínimo', maximo: 'Máximo', distintos: 'Distintos' } as const;

    return {
      definicion,
      columnas: definicion.columnas.map((clave) => ({ clave, nombre: col(clave).nombre, tipo: col(clave).tipo, opciones: col(clave).opciones })),
      agrupaciones: definicion.agrupaciones.map((g) => ({
        clave: g.columna,
        nombre: col(g.columna).nombre,
        tipo: g.granularidad ? 'fecha' : col(g.columna).tipo,
        granularidad: g.granularidad,
        opciones: col(g.columna).opciones,
      })),
      totales: compilado.mapa.totales.map((t) => ({
        clave: t.clave,
        funcion: t.funcion,
        nombre: `${nombreTotal[t.funcion]} de ${col(t.clave).nombre}`,
        tipo: t.funcion === 'distintos' ? 'numero' : col(t.clave).tipo,
      })),
      filas,
      resumenes,
      totalFilas,
      pagina,
      porPagina,
      recortado: totalFilas > MAX_FILAS_EN_PANTALLA,
      gruposRecortados: resumenCrudo.length > MAX_GRUPOS,
    };
  }

  /**
   * Cuenta una ejecución de un reporte guardado sin tocar updated_at (que es
   * "modificado el"). SQL crudo con la organización explícita.
   */
  async registrarEjecucion(reporteId: string, organizacionId: string) {
    await this.prisma.$executeRaw`
      UPDATE reportes SET ultima_ejecucion = now(), veces_ejecutado = veces_ejecutado + 1
      WHERE id = ${reporteId}::uuid AND organizacion_id = ${organizacionId}::uuid`;
  }

  // Solo lectura y con tiempo máximo: un reporte nunca puede escribir ni
  // dejar a la base ocupada.
  private async consultar(compilado: ReporteCompilado, pagina: number, porPagina: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${TIEMPO_MAXIMO_MS}`);
        const resumenCrudo = await tx.$queryRaw<Record<string, unknown>[]>(compilado.resumen);
        const filasCrudas = compilado.filas ? await tx.$queryRaw<Record<string, unknown>[]>(compilado.filas(pagina, porPagina)) : null;
        return { resumenCrudo: resumenCrudo.slice(0, MAX_GRUPOS + 1), filasCrudas };
      }, { timeout: TIEMPO_MAXIMO_MS + 5_000 });
    } catch (err) {
      const mensaje = (err as Error).message ?? '';
      if (mensaje.includes('statement timeout') || mensaje.includes('canceling statement')) {
        throw new BadRequestException('El reporte tardó demasiado. Achica el rango de fechas, agrega filtros o agrupa.');
      }
      this.logger.error(`Fallo al ejecutar un reporte: ${mensaje}`);
      throw err;
    }
  }
}

/** Valores de la base -> JSON: números como número, fechas como "AAAA-MM-DD" o ISO. */
export function normalizarValor(tipo: string, valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (tipo === 'numero' || tipo === 'moneda') {
    const n = Number(valor instanceof Prisma.Decimal ? valor.toString() : valor);
    return Number.isFinite(n) ? n : null;
  }
  if (valor instanceof Date) return tipo === 'fecha' ? valor.toISOString().slice(0, 10) : valor.toISOString();
  if (typeof valor === 'bigint') return Number(valor);
  return valor;
}
