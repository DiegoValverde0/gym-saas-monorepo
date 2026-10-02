import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CarpetaReporte, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { nombreRolLegible, registrarAuditoria } from '../../common/utils/auditoria.util';
import { tipoReporte, TipoReporte } from './catalogo';
import { Definicion, validarDefinicion } from './motor/definicion';
import { aCsv, aExcel, NOMBRE_RANGO, nombreArchivo } from './motor/exportador';
import { Contexto, MAX_FILAS_EXPORTACION, ReporteriaService, ResultadoReporte } from './reporteria.service';
import {
  ActualizarCarpetaDto,
  ActualizarReporteDto,
  CrearCarpetaDto,
  DuplicarReporteDto,
  EjecutarGuardadoDto,
  GuardarReporteDto,
  ListarReportesDto,
} from './dto/reportes-guardados.dto';

// Roles con los que no tiene sentido compartir reportes.
const ROLES_NO_COMPARTIBLES = ['SUPERADMIN', 'CLIENTE'];

const SELECT_REPORTE = {
  id: true,
  nombre: true,
  descripcion: true,
  tipoReporte: true,
  formato: true,
  esPlantilla: true,
  carpetaId: true,
  creadoPorId: true,
  ultimaEjecucion: true,
  vecesEjecutado: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  carpeta: { select: { id: true, nombre: true, visibilidad: true, rolesIds: true, creadoPorId: true, deletedAt: true } },
  creadoPor: { select: { nombreCompleto: true } },
} as const;

type ReporteFila = Prisma.ReporteGetPayload<{ select: typeof SELECT_REPORTE }>;

/**
 * Reportes guardados y carpetas (docs/plan-reporteria.md, fase 3).
 *
 * Quién ve un reporte: quien lo creó; todos, si es una plantilla; y quien
 * tenga el rol de su carpeta si la carpeta está compartida (sin roles = todo
 * el equipo con reportes:leer). Además hace falta acceso a su tipo (Ventas
 * pide transacciones:leer...). En modo simple solo se ven las plantillas.
 *
 * Quién lo cambia: con reportes:actualizar / eliminar, quien lo creó o
 * cualquiera que vea la carpeta compartida donde está. Las plantillas no se
 * cambian: se duplican. Las carpetas las cambia solo quien las creó.
 */
@Injectable()
export class ReportesGuardadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: ReporteriaService,
  ) {}

  private get db() {
    return this.prisma.extendedClient;
  }

  private puede(ctx: Contexto, accion: 'crear' | 'actualizar' | 'eliminar') {
    return ctx.permisos.includes(`reportes:${accion}`);
  }

  // ---------------------------------------------------------------------------
  // Visibilidad
  // ---------------------------------------------------------------------------

  private carpetaCompartidaConmigo(ctx: Contexto): Prisma.CarpetaReporteWhereInput {
    return {
      deletedAt: null,
      visibilidad: 'COMPARTIDA',
      OR: [{ rolesIds: { isEmpty: true } }, ...(ctx.rolId ? [{ rolesIds: { has: ctx.rolId } }] : [])],
    };
  }

  private reportesVisibles(ctx: Contexto): Prisma.ReporteWhereInput {
    if (ctx.modo === 'simple') return { esPlantilla: true };
    return {
      OR: [{ creadoPorId: ctx.ejecucion.usuarioId }, { esPlantilla: true }, { carpeta: this.carpetaCompartidaConmigo(ctx) }],
    };
  }

  private carpetasVisibles(ctx: Contexto): Prisma.CarpetaReporteWhereInput {
    return { OR: [{ creadoPorId: ctx.ejecucion.usuarioId }, this.carpetaCompartidaConmigo(ctx)] };
  }

  private tipoDe(reporte: { tipoReporte: string }, ctx: Contexto): TipoReporte | null {
    const tipo = tipoReporte(reporte.tipoReporte);
    return tipo && this.motor.disponible(tipo, ctx) ? tipo : null;
  }

  private esEditable(r: ReporteFila, ctx: Contexto) {
    if (r.esPlantilla) return false;
    const mio = r.creadoPorId === ctx.ejecucion.usuarioId;
    const compartida = !!r.carpeta && !r.carpeta.deletedAt && r.carpeta.visibilidad === 'COMPARTIDA';
    return mio || compartida;
  }

  private describir(r: ReporteFila, ctx: Contexto) {
    const tipo = tipoReporte(r.tipoReporte);
    const editable = this.esEditable(r, ctx);
    return {
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      tipo: { clave: r.tipoReporte, nombre: tipo?.nombre ?? r.tipoReporte },
      formato: r.formato,
      esPlantilla: r.esPlantilla,
      carpeta: r.carpeta && !r.carpeta.deletedAt ? { id: r.carpeta.id, nombre: r.carpeta.nombre } : null,
      creadoPor: r.esPlantilla ? 'Sistema' : r.creadoPor?.nombreCompleto ?? null,
      esMio: r.creadoPorId === ctx.ejecucion.usuarioId,
      ultimaEjecucion: r.ultimaEjecucion,
      vecesEjecutado: r.vecesEjecutado,
      creadoEl: r.createdAt,
      modificadoEl: r.updatedAt,
      eliminadoEl: r.deletedAt,
      puedeEditar: editable && this.puede(ctx, 'actualizar'),
      puedeEliminar: editable && this.puede(ctx, 'eliminar'),
    };
  }

  /** Un reporte que esta persona puede ver (y cuyo tipo puede usar). */
  private async reporteVisible(id: string, ctx: Contexto, papelera = false) {
    const r = await this.db.reporte.findFirst({
      // deletedAt va arriba: la extensión de papelera solo lo respeta ahí.
      where: { id, deletedAt: papelera ? { not: null } : null, AND: [this.reportesVisibles(ctx)] },
      select: { ...SELECT_REPORTE, definicion: true },
    });
    if (!r) throw new NotFoundException('No encontramos ese reporte.');
    const tipo = this.tipoDe(r, ctx);
    if (!tipo) throw new ForbiddenException('No tienes acceso a este tipo de reporte.');
    return { reporte: r, tipo };
  }

  private async carpetaDestino(carpetaId: string | null | undefined, ctx: Contexto) {
    if (!carpetaId) return null;
    const carpeta = await this.db.carpetaReporte.findFirst({ where: { AND: [{ id: carpetaId }, this.carpetasVisibles(ctx)] }, select: { id: true } });
    if (!carpeta) throw new BadRequestException('Esa carpeta no existe o no la puedes usar.');
    return carpeta.id;
  }

  private validar(definicion: unknown, ctx: Contexto) {
    const clave = (definicion as { tipo?: unknown }).tipo;
    const tipo = typeof clave === 'string' ? tipoReporte(clave) : undefined;
    if (!tipo) throw new BadRequestException('Ese tipo de reporte no existe.');
    if (!this.motor.disponible(tipo, ctx)) throw new ForbiddenException(`No tienes acceso al reporte de ${tipo.nombre}.`);
    // Guardar algo con funciones avanzadas: solo en modo experto.
    return validarDefinicion(definicion, tipo, { avanzado: ctx.modo === 'experto' });
  }

  private noEnSimple(ctx: Contexto) {
    if (ctx.modo === 'simple') throw new ForbiddenException('En modo simple se usan los reportes listos (plantillas).');
  }

  // ---------------------------------------------------------------------------
  // Reportes
  // ---------------------------------------------------------------------------

  async listar(q: ListarReportesDto) {
    const ctx = await this.motor.contexto();
    const filtros: Prisma.ReporteWhereInput[] = [this.reportesVisibles(ctx)];
    const papelera = q.papelera === 'true';
    // Solo lo propio: la papelera no muestra lo que borraron otros.
    if (papelera) filtros.push({ creadoPorId: ctx.ejecucion.usuarioId });
    if (q.carpetaId) filtros.push({ carpetaId: q.carpetaId });
    if (q.buscar) filtros.push({ nombre: { contains: q.buscar, mode: 'insensitive' } });
    const vista = q.vista ?? 'todos';
    if (vista === 'mios') filtros.push({ creadoPorId: ctx.ejecucion.usuarioId, esPlantilla: false });
    if (vista === 'plantillas') filtros.push({ esPlantilla: true });
    if (vista === 'compartidos') filtros.push({ carpeta: this.carpetaCompartidaConmigo(ctx), NOT: { creadoPorId: ctx.ejecucion.usuarioId } });
    if (vista === 'recientes') filtros.push({ ultimaEjecucion: { not: null } });

    const reportes = await this.db.reporte.findMany({
      where: { deletedAt: papelera ? { not: null } : null, AND: filtros },
      select: SELECT_REPORTE,
      orderBy: vista === 'recientes' ? [{ ultimaEjecucion: 'desc' }] : [{ esPlantilla: 'asc' }, { nombre: 'asc' }],
      take: vista === 'recientes' ? 20 : 500,
    });
    // Los de tipos a los que no tiene acceso no se listan.
    return (reportes as ReporteFila[]).filter((r) => this.tipoDe(r, ctx)).map((r) => this.describir(r, ctx));
  }

  async obtener(id: string) {
    const ctx = await this.motor.contexto();
    const { reporte } = await this.reporteVisible(id, ctx);
    return { ...this.describir(reporte, ctx), definicion: reporte.definicion };
  }

  async crear(dto: GuardarReporteDto) {
    const ctx = await this.motor.contexto();
    this.noEnSimple(ctx);
    const definicion = this.validar(dto.definicion, ctx);
    const carpetaId = await this.carpetaDestino(dto.carpetaId, ctx);
    const creado = await this.db.reporte.create({
      // organizacionId lo inyecta la extensión RLS.
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        carpetaId,
        tipoReporte: definicion.tipo,
        formato: definicion.formato,
        definicion: definicion as unknown as Prisma.InputJsonValue,
        creadoPorId: ctx.ejecucion.usuarioId,
      } as unknown as Prisma.ReporteUncheckedCreateInput,
      select: { id: true },
    });
    return this.obtener(creado.id);
  }

  async actualizar(id: string, dto: ActualizarReporteDto) {
    const ctx = await this.motor.contexto();
    this.noEnSimple(ctx);
    const { reporte } = await this.reporteVisible(id, ctx);
    if (reporte.esPlantilla) throw new ForbiddenException('Las plantillas no se cambian: duplícala y cambia la copia.');
    if (!this.esEditable(reporte, ctx)) throw new ForbiddenException('Solo quien lo creó puede cambiar este reporte.');
    const data: Prisma.ReporteUncheckedUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion || null;
    if (dto.carpetaId !== undefined) data.carpetaId = await this.carpetaDestino(dto.carpetaId, ctx);
    if (dto.definicion !== undefined) {
      const definicion = this.validar(dto.definicion, ctx);
      if (definicion.tipo !== reporte.tipoReporte) throw new BadRequestException('Un reporte no cambia de tipo: crea uno nuevo.');
      data.formato = definicion.formato;
      data.definicion = definicion as unknown as Prisma.InputJsonValue;
    }
    await this.db.reporte.update({ where: { id }, data });
    return this.obtener(id);
  }

  async duplicar(id: string, dto: DuplicarReporteDto) {
    const ctx = await this.motor.contexto();
    this.noEnSimple(ctx);
    const { reporte, tipo } = await this.reporteVisible(id, ctx);
    const carpetaId = dto.carpetaId === undefined ? null : await this.carpetaDestino(dto.carpetaId, ctx);
    // Se valida al copiar: si la original quedó vieja, la copia no nace rota.
    const definicion = validarDefinicion(reporte.definicion, tipo, { avanzado: true });
    const copia = await this.db.reporte.create({
      data: {
        nombre: dto.nombre ?? `${reporte.nombre} (copia)`.slice(0, 150),
        descripcion: reporte.descripcion,
        carpetaId,
        tipoReporte: reporte.tipoReporte,
        formato: definicion.formato,
        definicion: definicion as unknown as Prisma.InputJsonValue,
        creadoPorId: ctx.ejecucion.usuarioId,
      } as unknown as Prisma.ReporteUncheckedCreateInput,
      select: { id: true },
    });
    return this.obtener(copia.id);
  }

  async eliminar(id: string) {
    const ctx = await this.motor.contexto();
    const { reporte } = await this.reporteVisible(id, ctx);
    if (reporte.esPlantilla) throw new ForbiddenException('Las plantillas no se eliminan.');
    if (!this.esEditable(reporte, ctx)) throw new ForbiddenException('Solo quien lo creó puede eliminar este reporte.');
    // Papelera (la extensión lo convierte en deleted_at y lo anota en la auditoría).
    await this.db.reporte.delete({ where: { id } });
    return { ok: true };
  }

  async restaurar(id: string) {
    const ctx = await this.motor.contexto();
    const { reporte } = await this.reporteVisible(id, ctx, true);
    if (reporte.creadoPorId !== ctx.ejecucion.usuarioId) throw new ForbiddenException('Solo quien lo creó puede restaurarlo.');
    const carpetaViva = !reporte.carpetaId || (reporte.carpeta && !reporte.carpeta.deletedAt);
    await this.db.reporte.update({
      where: { id },
      // Si su carpeta ya no existe, vuelve a "Mis reportes".
      data: { deletedAt: null, ...(carpetaViva ? {} : { carpetaId: null }) },
    });
    await registrarAuditoria(this.db, { tabla: 'Reporte', operacion: 'UPDATE', accion: 'restaurar', descripcion: `Restauró el reporte "${reporte.nombre}"` });
    return this.obtener(id);
  }

  /**
   * Corre un reporte guardado. Con reportes:leer alcanza (así recepción corre
   * lo que le comparten). Los filtros rápidos (fecha y sucursal) se pueden
   * cambiar en el momento sin guardar el reporte.
   */
  async ejecutar(id: string, dto: EjecutarGuardadoDto): Promise<ResultadoReporte & { reporte: ReturnType<ReportesGuardadosService['describir']> }> {
    const ctx = await this.motor.contexto();
    const { reporte, tipo } = await this.reporteVisible(id, ctx);
    const definicion = this.definicionConFiltros(reporte.definicion, tipo, dto);
    const pagina = dto.pagina ?? 1;
    const resultado = await this.motor.ejecutar(tipo, definicion, ctx, pagina, dto.porPagina ?? 50);
    if (pagina === 1) await this.motor.registrarEjecucion(id, ctx.ejecucion.organizacionId);
    return { ...resultado, reporte: this.describir(reporte, ctx) };
  }

  /** La definición guardada con los cambios del momento en la fecha y la sucursal. */
  private definicionConFiltros(definicionGuardada: unknown, tipo: TipoReporte, dto: EjecutarGuardadoDto): Definicion {
    const guardada = definicionGuardada as Record<string, unknown>;
    const filtrosGuardados = (guardada.filtros ?? {}) as Record<string, unknown>;
    const entrada = {
      ...guardada,
      filtros: {
        ...filtrosGuardados,
        ...(dto.filtros?.fecha ? { fecha: { ...(filtrosGuardados.fecha as object), ...dto.filtros.fecha } } : {}),
        ...(dto.filtros && 'sucursalId' in dto.filtros ? { sucursalId: dto.filtros.sucursalId ?? undefined } : {}),
      },
    };
    try {
      // Un reporte guardado se corre aunque el gimnasio ya no esté en modo experto.
      return validarDefinicion(entrada, tipo, { avanzado: true });
    } catch (err) {
      throw new BadRequestException(`Este reporte ya no se puede correr: ${(err as Error).message} Edítalo para corregirlo.`);
    }
  }

  /**
   * Exporta un reporte guardado a CSV o Excel con todas sus filas (hasta
   * 50.000) y los mismos filtros del momento que se ven en pantalla. Queda
   * en la auditoría.
   */
  async exportar(id: string, formato: 'csv' | 'xlsx', dto: EjecutarGuardadoDto) {
    const ctx = await this.motor.contexto();
    const { reporte, tipo } = await this.reporteVisible(id, ctx);
    const definicion = this.definicionConFiltros(reporte.definicion, tipo, dto);
    const r = await this.motor.ejecutar(tipo, definicion, ctx, 1, MAX_FILAS_EXPORTACION, MAX_FILAS_EXPORTACION);
    if (r.filas && r.totalFilas > MAX_FILAS_EXPORTACION) {
      throw new BadRequestException(
        `El reporte tiene ${r.totalFilas.toLocaleString('es-ES')} filas y se exportan hasta ${MAX_FILAS_EXPORTACION.toLocaleString('es-ES')}. Achica el rango de fechas, filtra o agrupa sin mostrar el detalle.`,
      );
    }

    // Qué se exportó, para el encabezado del archivo.
    const f = definicion.filtros;
    const partes = [
      f.fecha.rango === 'personalizado'
        ? `Del ${f.fecha.desde?.split('-').reverse().join('/') ?? '…'} al ${f.fecha.hasta?.split('-').reverse().join('/') ?? '…'}`
        : NOMBRE_RANGO[f.fecha.rango],
    ];
    const sucursalId = f.sucursalId ?? ctx.ejecucion.sucursalAlcance;
    if (sucursalId) {
      const s = (await this.db.sucursal.findUnique({ where: { id: sucursalId }, select: { nombre: true } })) as { nombre: string } | null;
      if (s) partes.push(s.nombre);
    }
    if (f.soloMios) partes.push('solo los míos');
    if (f.campos.length) partes.push(`${f.campos.length} filtro${f.campos.length === 1 ? '' : 's'} más`);

    const generado = new Date();
    const datos = {
      titulo: reporte.nombre,
      tipoNombre: tipo.nombre,
      filtros: partes.join(' · '),
      zonaHoraria: ctx.ejecucion.zonaHoraria,
      generado,
      grupos: r.agrupaciones,
      cruzada: r.columnaCruzada,
      columnas: r.columnas,
      totales: r.totales,
      filas: r.filas,
      resumenes: r.resumenes,
    };
    const contenido = formato === 'csv' ? aCsv(datos) : await aExcel(datos);
    await registrarAuditoria(this.db, {
      tabla: 'Reporte',
      operacion: 'UPDATE',
      accion: 'exportar_reporte',
      descripcion: `Exportó el reporte "${reporte.nombre}" a ${formato === 'csv' ? 'CSV' : 'Excel'} (${r.totalFilas.toLocaleString('es-ES')} registros)`,
    });
    return {
      contenido,
      nombre: nombreArchivo(reporte.nombre, generado, formato, ctx.ejecucion.zonaHoraria),
      tipoMime: formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ---------------------------------------------------------------------------
  // Carpetas
  // ---------------------------------------------------------------------------

  async carpetas() {
    const ctx = await this.motor.contexto();
    if (ctx.modo === 'simple') return [];
    const [carpetas, roles, reportes] = await Promise.all([
      this.db.carpetaReporte.findMany({
        where: this.carpetasVisibles(ctx),
        select: { id: true, nombre: true, descripcion: true, visibilidad: true, rolesIds: true, creadoPorId: true, creadoPor: { select: { nombreCompleto: true } } },
        orderBy: { nombre: 'asc' },
      }),
      this.db.rol.findMany({ select: { id: true, nombre: true } }),
      this.db.reporte.findMany({ where: { AND: [this.reportesVisibles(ctx), { carpetaId: { not: null } }] }, select: { carpetaId: true, tipoReporte: true } }),
    ]);
    const nombreRol = new Map((roles as { id: string; nombre: string }[]).map((r) => [r.id, r.nombre]));
    type Carpeta = (typeof carpetas)[number];
    return (carpetas as Carpeta[]).map((c) => {
      const mia = c.creadoPorId === ctx.ejecucion.usuarioId;
      return {
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        visibilidad: c.visibilidad,
        roles: c.rolesIds.map((id) => ({ id, nombre: nombreRol.get(id) ?? 'Rol eliminado' })),
        creadaPor: c.creadoPor?.nombreCompleto ?? null,
        esMia: mia,
        cantidadReportes: (reportes as { carpetaId: string; tipoReporte: string }[]).filter((r) => r.carpetaId === c.id && this.tipoDe(r, ctx)).length,
        puedeEditar: mia && this.puede(ctx, 'actualizar'),
        puedeEliminar: mia && this.puede(ctx, 'eliminar'),
      };
    });
  }

  private async validarCarpeta(ctx: Contexto, nombre: string | undefined, rolesIds: string[] | undefined, excluirId?: string) {
    if (nombre !== undefined) {
      // Único entre las carpetas que esta persona ve: dos personas pueden
      // tener cada una su carpeta privada "Mis ventas".
      const repetida = await this.db.carpetaReporte.findFirst({
        where: { nombre: { equals: nombre, mode: 'insensitive' }, AND: [this.carpetasVisibles(ctx)], ...(excluirId ? { NOT: { id: excluirId } } : {}) },
        select: { id: true },
      });
      if (repetida) throw new ConflictException(`Ya hay una carpeta llamada "${nombre}".`);
    }
    if (rolesIds && rolesIds.length > 0) {
      // Con RLS solo aparecen los roles base y los de este gimnasio.
      const roles = await this.db.rol.findMany({ where: { id: { in: rolesIds } }, select: { id: true, nombre: true, organizacionId: true } });
      const validos = (roles as { id: string; nombre: string; organizacionId: string | null }[]).filter(
        (r) => !(r.organizacionId === null && ROLES_NO_COMPARTIBLES.includes(r.nombre)),
      );
      if (validos.length !== new Set(rolesIds).size) throw new BadRequestException('Uno de los roles elegidos no existe o no se puede usar.');
    }
  }

  private async auditarCompartir(nombre: string, visibilidad: string, rolesIds: string[]) {
    const roles = rolesIds.length
      ? ((await this.db.rol.findMany({ where: { id: { in: rolesIds } }, select: { nombre: true } })) as { nombre: string }[])
          .map((r) => nombreRolLegible(r.nombre))
          .join(', ')
      : 'todo el equipo';
    await registrarAuditoria(this.db, {
      tabla: 'CarpetaReporte',
      operacion: 'UPDATE',
      accion: 'compartir_reportes',
      descripcion:
        visibilidad === 'COMPARTIDA'
          ? `Compartió la carpeta de reportes "${nombre}" con ${roles}`
          : `Dejó de compartir la carpeta de reportes "${nombre}"`,
    });
  }

  async crearCarpeta(dto: CrearCarpetaDto) {
    const ctx = await this.motor.contexto();
    this.noEnSimple(ctx);
    const visibilidad = dto.visibilidad ?? 'PRIVADA';
    const rolesIds = visibilidad === 'COMPARTIDA' ? [...new Set(dto.rolesIds ?? [])] : [];
    await this.validarCarpeta(ctx, dto.nombre, rolesIds);
    const carpeta = await this.db.carpetaReporte.create({
      data: { nombre: dto.nombre, descripcion: dto.descripcion ?? null, visibilidad, rolesIds, creadoPorId: ctx.ejecucion.usuarioId } as unknown as Prisma.CarpetaReporteUncheckedCreateInput,
      select: { id: true },
    });
    if (visibilidad === 'COMPARTIDA') await this.auditarCompartir(dto.nombre, visibilidad, rolesIds);
    return (await this.carpetas()).find((c) => c.id === carpeta.id);
  }

  private async carpetaMia(id: string, ctx: Contexto) {
    const carpeta = await this.db.carpetaReporte.findFirst({ where: { AND: [{ id }, this.carpetasVisibles(ctx)] } });
    if (!carpeta) throw new NotFoundException('No encontramos esa carpeta.');
    if (carpeta.creadoPorId !== ctx.ejecucion.usuarioId) throw new ForbiddenException('Solo quien creó la carpeta puede cambiarla.');
    return carpeta as CarpetaReporte;
  }

  async actualizarCarpeta(id: string, dto: ActualizarCarpetaDto) {
    const ctx = await this.motor.contexto();
    this.noEnSimple(ctx);
    const actual = await this.carpetaMia(id, ctx);
    const visibilidad = dto.visibilidad ?? actual.visibilidad;
    const rolesIds = visibilidad === 'COMPARTIDA' ? [...new Set(dto.rolesIds ?? actual.rolesIds)] : [];
    await this.validarCarpeta(ctx, dto.nombre !== undefined && dto.nombre !== actual.nombre ? dto.nombre : undefined, rolesIds, id);
    await this.db.carpetaReporte.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion || null } : {}),
        visibilidad,
        rolesIds,
      },
    });
    const cambioCompartir = visibilidad !== actual.visibilidad || rolesIds.join() !== [...actual.rolesIds].join();
    if (cambioCompartir) await this.auditarCompartir(dto.nombre ?? actual.nombre, visibilidad, rolesIds);
    return (await this.carpetas()).find((c) => c.id === id);
  }

  async eliminarCarpeta(id: string) {
    const ctx = await this.motor.contexto();
    await this.carpetaMia(id, ctx);
    // Cuenta todos los reportes vivos, también los que esta persona no ve.
    const adentro = await this.db.reporte.count({ where: { carpetaId: id } });
    if (adentro > 0) throw new ConflictException(`La carpeta tiene ${adentro} reporte(s): muévelos o elimínalos primero.`);
    await this.db.carpetaReporte.delete({ where: { id } });
    return { ok: true };
  }
}
