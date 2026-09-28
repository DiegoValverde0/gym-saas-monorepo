import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { obtenerModoUso } from '../../common/utils/modo.util';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { CerrarDiaDto } from './dto/cierre-dia.dto';
import { registrarAuditoria } from '../../common/utils/auditoria.util';

// Caja que se crea sola en cada sucursal la primera vez que se cierra el día
// en modo simple (plan 11.6: "una caja por sucursal creada automáticamente").
const NOMBRE_CAJA_AUTOMATICA = 'Caja del gimnasio';
const DIA_MS = 24 * 60 * 60_000;
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * "Cerrar el día" del modo simple (plan de simplificación, 11.6), sin cambio
 * de base de datos. En modo simple se cobra sin abrir turno de caja (fase 2),
 * así que los cobros del día son las transacciones de la sucursal sin turno
 * de caja. Al cerrar se registra una AperturaCaja ya cerrada en la caja
 * automática de la sucursal, con lo esperado frente a lo contado: queda en el
 * historial de Cajas igual que un arqueo del modo experto.
 */
@Injectable()
export class CierreDiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private async contexto(sucursalId?: string) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización.');
    const db = this.prisma.extendedClient;
    const org = await db.organizacion.findUnique({ where: { id: organizacionId }, select: { zonaHoraria: true } });
    const zonaHoraria = org?.zonaHoraria ?? null;

    const sucursal = sucursalId
      ? await db.sucursal.findUnique({ where: { id: sucursalId }, select: { id: true, nombre: true } })
      : await db.sucursal.findFirst({ where: { estado: 'ACTIVO' }, orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }], select: { id: true, nombre: true } });
    if (!sucursal) throw new BadRequestException('No se encontró la sucursal.');

    const hoy = aHoraLocal(new Date(), zonaHoraria).fechaSolo;
    const inicio = desdeHoraLocal(hoy, 0, zonaHoraria);
    const fin = desdeHoraLocal(new Date(hoy.getTime() + DIA_MS), 0, zonaHoraria);
    return { organizacionId, zonaHoraria, sucursal, hoy, inicio, fin };
  }

  // Cobros y gastos del día sin turno de caja formal, por forma de pago.
  private async movimientos(sucursalId: string, desde: Date, hasta: Date) {
    const pagos: Array<{ monto: Prisma.Decimal; metodoPago: string; transaccion: { tipo: string } }> = await this.prisma.extendedClient.pago.findMany({
      where: {
        transaccion: { sucursalId, aperturaCajaId: null, deletedAt: null, fechaHora: { gte: desde, lt: hasta } },
      },
      select: { monto: true, metodoPago: true, transaccion: { select: { tipo: true } } },
    });
    const ingresos: Record<string, number> = {};
    let totalIngresos = 0;
    let efectivoIngresos = 0;
    let totalGastos = 0;
    let efectivoGastos = 0;
    for (const p of pagos) {
      const monto = Number(p.monto);
      if (p.transaccion.tipo === 'INGRESO') {
        ingresos[p.metodoPago] = redondear((ingresos[p.metodoPago] ?? 0) + monto);
        totalIngresos += monto;
        if (p.metodoPago === 'EFECTIVO') efectivoIngresos += monto;
      } else {
        totalGastos += monto;
        if (p.metodoPago === 'EFECTIVO') efectivoGastos += monto;
      }
    }
    const cantidadCobros = await this.prisma.extendedClient.transaccion.count({
      where: { sucursalId, aperturaCajaId: null, tipo: 'INGRESO', fechaHora: { gte: desde, lt: hasta } },
    });
    return {
      ingresos,
      totalIngresos: redondear(totalIngresos),
      efectivoIngresos: redondear(efectivoIngresos),
      totalGastos: redondear(totalGastos),
      efectivoGastos: redondear(efectivoGastos),
      cantidadCobros,
    };
  }

  private cajaAutomatica(sucursalId: string) {
    return this.prisma.extendedClient.cajaRegistradora.findFirst({
      where: { sucursalId, nombre: NOMBRE_CAJA_AUTOMATICA },
      select: { id: true },
    });
  }

  async resumen(sucursalId?: string) {
    const ctx = await this.contexto(sucursalId);
    const db = this.prisma.extendedClient;
    const caja = await this.cajaAutomatica(ctx.sucursal.id);

    const cierre = caja
      ? await db.aperturaCaja.findFirst({
          where: { cajaId: caja.id, estado: 'CERRADA', fechaApertura: { gte: ctx.inicio, lt: ctx.fin } },
          orderBy: { fechaCierre: 'desc' },
          include: { usuario: { select: { nombreCompleto: true } } },
        })
      : null;
    // Por defecto, el día empieza con el efectivo que quedó contado en el cierre anterior.
    const anterior = caja
      ? await db.aperturaCaja.findFirst({
          where: { cajaId: caja.id, estado: 'CERRADA', fechaApertura: { lt: ctx.inicio } },
          orderBy: { fechaApertura: 'desc' },
          select: { montoCierreReal: true },
        })
      : null;

    const hastaCierre = cierre?.fechaCierre ?? ctx.fin;
    const dia = await this.movimientos(ctx.sucursal.id, ctx.inicio, hastaCierre);
    const despues = cierre?.fechaCierre ? await this.movimientos(ctx.sucursal.id, cierre.fechaCierre, ctx.fin) : null;

    return {
      fecha: ctx.hoy.toISOString().slice(0, 10),
      sucursal: ctx.sucursal,
      ...dia,
      efectivoInicialSugerido: anterior?.montoCierreReal != null ? Number(anterior.montoCierreReal) : 0,
      cierre: cierre
        ? {
            hora: aHoraLocal(cierre.fechaCierre ?? new Date(), ctx.zonaHoraria).minutosDelDia,
            cerradoPor: cierre.usuario?.nombreCompleto ?? null,
            efectivoInicial: Number(cierre.montoInicial),
            esperado: Number(cierre.montoCierreEsperado ?? 0),
            contado: Number(cierre.montoCierreReal ?? 0),
            diferencia: redondear(Number(cierre.montoCierreReal ?? 0) - Number(cierre.montoCierreEsperado ?? 0)),
            observaciones: cierre.observaciones,
          }
        : null,
      cobrosDespuesDelCierre: despues ? { cantidad: despues.cantidadCobros, total: despues.totalIngresos } : null,
    };
  }

  async cerrar(dto: CerrarDiaDto, usuarioId: string) {
    const ctx = await this.contexto(dto.sucursalId);
    if ((await obtenerModoUso(this.prisma, ctx.organizacionId)) !== 'simple') {
      throw new BadRequestException('"Cerrar el día" es del modo simple. En este modo, cierra el turno de caja desde Cajas.');
    }
    const db = this.prisma.extendedClient;

    const existente = await this.cajaAutomatica(ctx.sucursal.id);
    if (existente) {
      const yaCerrado = await db.aperturaCaja.findFirst({
        where: { cajaId: existente.id, estado: 'CERRADA', fechaApertura: { gte: ctx.inicio, lt: ctx.fin } },
        select: { id: true },
      });
      if (yaCerrado) throw new BadRequestException('El día de hoy ya está cerrado en esta sucursal.');
    }

    const ahora = new Date();
    const mov = await this.movimientos(ctx.sucursal.id, ctx.inicio, ahora);
    const esperado = redondear(dto.efectivoInicial + mov.efectivoIngresos - mov.efectivoGastos);

    const resultado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const caja =
        existente ??
        (await tx.cajaRegistradora.create({
          // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
          data: { sucursalId: ctx.sucursal.id, nombre: NOMBRE_CAJA_AUTOMATICA, creadoPorId: usuarioId } as unknown as Prisma.CajaRegistradoraUncheckedCreateInput,
          select: { id: true },
        }));
      await tx.cajaRegistradora.update({ where: { id: caja.id }, data: { estado: 'CERRADA', saldoActual: dto.efectivoContado } });
      await tx.aperturaCaja.create({
        data: {
          cajaId: caja.id,
          usuarioId,
          montoInicial: dto.efectivoInicial,
          montoCierreEsperado: esperado,
          montoCierreReal: dto.efectivoContado,
          observaciones: dto.observaciones?.trim() || null,
          fechaApertura: ctx.inicio,
          fechaCierre: ahora,
          estado: 'CERRADA',
        } as unknown as Prisma.AperturaCajaUncheckedCreateInput,
      });
      return {
        esperado,
        contado: dto.efectivoContado,
        diferencia: redondear(dto.efectivoContado - esperado),
        totalIngresos: mov.totalIngresos,
        cantidadCobros: mov.cantidadCobros,
      };
    });

    const diferencia = resultado.diferencia;
    if (Math.abs(diferencia) >= 0.01) {
      await registrarAuditoria(db, {
        tabla: 'aperturas_caja', operacion: 'INSERT', accion: 'cerrar_caja_con_diferencia',
        descripcion: `Cerró el día en ${ctx.sucursal.nombre} con ${diferencia > 0 ? 'sobrante' : 'faltante'} de Bs. ${Math.abs(diferencia).toFixed(2)} (esperado Bs. ${esperado.toFixed(2)}, contado Bs. ${dto.efectivoContado.toFixed(2)})`,
        despues: { esperado, contado: dto.efectivoContado },
      });
    }

    return resultado;
  }
}
