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
import { tipoConGrupos } from './motor/avanzado';
import { idDePlantilla, plantillasListas } from './motor/plantillas';

// Tabla cruzada: más columnas que esto no se leen; se pide agrupar por algo más general.
const MAX_COLUMNAS_TABLA = 50;

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
  /** Tabla cruzada: lo que va en las columnas. */
  columnaCruzada?: { clave: string; nombre: string; tipo: string; granularidad?: Granularidad; opciones?: Record<string, string> };
  totales: { clave: string; funcion: string; nombre: string; tipo: string }[];
  /** Filas de detalle: grupos (g0, g1...) y columnas por su clave. */
  filas: Record<string, unknown>[] | null;
  /**
   * Por nivel: 0 = total general, 1 = primer grupo, etc. En la tabla cruzada,
   * con `conColumna` cada casilla (y el total de cada columna), y sin él los
   * totales de cada fila.
   */
  resumenes: { nivel: number; grupo: unknown[]; cantidad: number; totales: (number | string | null)[]; columna?: unknown; conColumna?: boolean }[];
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
  // Gimnasios cuyas plantillas ya se revisaron (ver asegurarPlantillas).
  private readonly plantillasAlDia = new Set<string>();

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
      formatos: ctx.modo === 'simple' ? [] : ctx.modo === 'experto' ? FORMATOS : FORMATOS.filter((f) => f !== 'TABLA_CRUZADA'),
      avanzado: ctx.modo === 'experto',
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
        rangoPorDefecto: t.rangoPorDefecto ?? 'ultimos_30',
        columnasIniciales: t.columnasIniciales,
        tieneSoloMios: !!t.creadoPor,
        cruzados: (t.cruzados ?? []).map((c) => ({ clave: c.clave, nombre: c.nombre, conRango: c.conRango })),
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
    // Las funciones avanzadas se arman solo en modo experto.
    const definicion = validarDefinicion(entrada, tipo, { avanzado: ctx.modo === 'experto' });
    return this.ejecutar(tipo, definicion, ctx, pagina, porPagina);
  }

  /**
   * Corre una plantilla del sistema por su clave (para "Lo que hay que saber
   * hoy" del Inicio: el mismo número que muestra su tarjeta). null si esta
   * persona no puede usar su tipo (permiso o módulo apagado).
   */
  async correrPlantilla(clave: string, ctx?: Contexto, porPagina = 1): Promise<ResultadoReporte | null> {
    ctx ??= await this.contexto();
    const plantilla = plantillasListas().find((p) => p.clave === clave);
    const tipo = plantilla ? tipoReporte(plantilla.definicion.tipo) : undefined;
    if (!plantilla || !tipo || !this.disponible(tipo, ctx)) return null;
    return this.ejecutar(tipo, plantilla.definicion, ctx, 1, porPagina);
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

    // Con los grupos personalizados como columnas más.
    const conGrupos = tipoConGrupos(tipo, definicion.gruposPersonalizados);
    const col = (clave: string) => conGrupos.columnas.find((c) => c.clave === clave)!;
    const normalizar = (clave: string, valor: unknown) => normalizarValor(col(clave).tipo, valor);
    const cruzada = compilado.mapa.columnaCruzada;
    const tipoCruzada = cruzada ? (cruzada.granularidad ? 'fecha' : col(cruzada.clave).tipo) : 'texto';
    if (cruzada) {
      const columnasDistintas = new Set(resumenCrudo.filter((r) => Number(r.xc) === 0).map((r) => JSON.stringify(normalizarValor(tipoCruzada, r.gc))));
      if (columnasDistintas.size > MAX_COLUMNAS_TABLA) {
        throw new BadRequestException(
          `La tabla tendría ${columnasDistintas.size} columnas (hasta ${MAX_COLUMNAS_TABLA}). Usa algo más general en las columnas (por ejemplo, por mes en vez de por día) o filtra.`,
        );
      }
    }
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
        ...(cruzada
          ? { conColumna: Number(r.xc) === 0, ...(Number(r.xc) === 0 ? { columna: normalizarValor(tipoCruzada, r.gc) } : {}) }
          : {}),
      };
    });
    const general = resumenes.find((r) => r.nivel === 0 && !r.conColumna);
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
      ...(cruzada
        ? {
            columnaCruzada: {
              clave: cruzada.clave,
              nombre: col(cruzada.clave).nombre,
              tipo: tipoCruzada,
              granularidad: cruzada.granularidad,
              opciones: col(cruzada.clave).opciones,
            },
          }
        : {}),
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

  /**
   * Copia las plantillas del sistema (catalogo/plantillas.ts) a los reportes
   * del gimnasio: crea las que faltan, actualiza las que cambiaron y manda a
   * la papelera las que ya no existen. Una vez por gimnasio mientras la API
   * esté prendida. SQL crudo: no es una acción de nadie, no va a la auditoría.
   */
  async asegurarPlantillas(organizacionId: string) {
    if (this.plantillasAlDia.has(organizacionId)) return;
    const plantillas = plantillasListas();
    const filas = plantillas.map(
      (p) => Prisma.sql`(${idDePlantilla(organizacionId, p.clave)}::uuid, ${organizacionId}::uuid, ${p.nombre}, ${p.descripcion},
        ${p.definicion.tipo}, ${p.definicion.formato}::"FormatoReporte", ${JSON.stringify(p.definicion)}::jsonb, true, now(), now())`,
    );
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        INSERT INTO reportes (id, organizacion_id, nombre, descripcion, tipo_reporte, formato, definicion, es_plantilla, created_at, updated_at)
        VALUES ${Prisma.join(filas)}
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, tipo_reporte = EXCLUDED.tipo_reporte,
          formato = EXCLUDED.formato, definicion = EXCLUDED.definicion, es_plantilla = true, deleted_at = NULL, updated_at = now()
        WHERE reportes.organizacion_id = EXCLUDED.organizacion_id
          AND (reportes.nombre, reportes.descripcion, reportes.tipo_reporte, reportes.formato, reportes.definicion, reportes.es_plantilla, reportes.deleted_at)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.tipo_reporte, EXCLUDED.formato, EXCLUDED.definicion, true, NULL::timestamptz)`,
      this.prisma.$executeRaw`
        UPDATE reportes SET deleted_at = now(), updated_at = now()
        WHERE organizacion_id = ${organizacionId}::uuid AND es_plantilla AND deleted_at IS NULL
          AND id NOT IN (${Prisma.join(plantillas.map((p) => Prisma.sql`${idDePlantilla(organizacionId, p.clave)}::uuid`))})`,
    ]);
    this.plantillasAlDia.add(organizacionId);
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
function normalizarValor(tipo: string, valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (tipo === 'numero' || tipo === 'moneda') {
    const n = Number(valor instanceof Prisma.Decimal ? valor.toString() : valor);
    return Number.isFinite(n) ? n : null;
  }
  if (valor instanceof Date) return tipo === 'fecha' ? valor.toISOString().slice(0, 10) : valor.toISOString();
  if (typeof valor === 'bigint') return Number(valor);
  return valor;
}
