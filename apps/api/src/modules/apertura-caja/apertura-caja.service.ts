import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAperturaCajaDto } from './dto/create-apertura-caja.dto';
import { CloseAperturaCajaDto } from './dto/close-apertura-caja.dto';
import { registrarAuditoria } from '../../common/utils/auditoria.util';

@Injectable()
export class AperturaCajaService {
  constructor(private prisma: PrismaService) {}

  async abrirCaja(dto: CreateAperturaCajaDto, userId: string, sucursalId?: string | null) {
    // 1. Validar que la caja exista
    const caja = await this.prisma.extendedClient.cajaRegistradora.findUnique({
      where: { id: dto.cajaId }
    });
    if (!caja) throw new NotFoundException('La caja seleccionada no existe en esta sucursal.');

    // 1.b Si el usuario tiene una sucursal fija asignada, no puede abrir cajas de otra sucursal
    if (sucursalId && caja.sucursalId !== sucursalId) {
      throw new ForbiddenException('No puedes abrir una caja de otra sucursal.');
    }

    // 2. Validar que la caja no esté ABIERTA por nadie más (ni por el mismo)
    const cajaOcupada = await this.prisma.extendedClient.aperturaCaja.findFirst({
      where: {
        cajaId: dto.cajaId,
        estado: 'ABIERTA'
      }
    });
    if (cajaOcupada) {
      throw new BadRequestException('Esta caja ya se encuentra abierta actualmente.');
    }

    // 3. Validar que el usuario no tenga YA OTRA caja abierta en la organización
    const usuarioConCajaAbierta = await this.prisma.extendedClient.aperturaCaja.findFirst({
      where: {
        usuarioId: userId,
        estado: 'ABIERTA'
      }
    });
    if (usuarioConCajaAbierta) {
      throw new BadRequestException('Ya tienes un turno de caja abierto. Debes cerrarlo antes de abrir otra caja.');
    }

    // 4. Crear Apertura y Actualizar Caja (Transacción)
    // Nota: los chequeos 2 y 3 son "optimistas" (SELECT antes de escribir) y no
    // bastan solos contra dos requests concurrentes -- el respaldo real son los
    // índices únicos parciales `uq_caja_una_apertura_abierta` y
    // `uq_usuario_un_turno_abierto` (ver la migración 0_inicial), que Postgres
    // aplica de forma atómica y cuya violación se traduce abajo a un 409 claro.
    // El saldo de la caja pasa a ser el monto inicial que se contó al abrir (igual
    // que "Cerrar el día" en cierre-dia.service.ts): al cerrar se espera ese
    // monto más los cobros en efectivo del turno. Si no coincide con lo que la
    // caja traía del turno anterior, queda en la auditoría.
    const saldoAnterior = Number(caja.saldoActual);
    try {
      const apertura = await this.prisma.extendedClient.$transaction(async (tx) => {
        const apertura = await tx.aperturaCaja.create({
          // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
          data: {
            cajaId: dto.cajaId,
            usuarioId: userId,
            montoInicial: dto.montoInicial,
            estado: 'ABIERTA',
            fechaApertura: new Date()
          } as unknown as Prisma.AperturaCajaUncheckedCreateInput,
          include: {
            caja: true
          }
        });

        await tx.cajaRegistradora.update({
          where: { id: dto.cajaId },
          data: { estado: 'ABIERTA', saldoActual: dto.montoInicial }
        });

        return apertura;
      });
      const diferencia = Number(dto.montoInicial) - saldoAnterior;
      if (Math.abs(diferencia) >= 0.01) {
        await registrarAuditoria(this.prisma.extendedClient, {
          tabla: 'aperturas_caja', operacion: 'INSERT', accion: 'abrir_caja_con_diferencia',
          descripcion: `Abrió "${caja.nombre}" con ${diferencia > 0 ? 'más' : 'menos'} efectivo del que había (Bs. ${Math.abs(diferencia).toFixed(2)}: la caja tenía Bs. ${saldoAnterior.toFixed(2)} y contó Bs. ${Number(dto.montoInicial).toFixed(2)})`,
          despues: { aperturaId: apertura.id, anterior: saldoAnterior, contado: Number(dto.montoInicial) },
        });
      }
      return apertura;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta caja ya fue abierta o ya tienes un turno abierto (intento simultáneo).');
      }
      throw error;
    }
  }

  async estadoActual(userId: string) {
    // Devuelve la caja actualmente abierta por este usuario
    const apertura = await this.prisma.extendedClient.aperturaCaja.findFirst({
      where: {
        usuarioId: userId,
        estado: 'ABIERTA'
      },
      include: {
        caja: {
          select: { nombre: true, sucursalId: true, saldoActual: true }
        }
      }
    });

    if (!apertura) {
      return { abierta: false, message: 'No tienes ninguna caja abierta.' };
    }

    // Calcular montos transaccionados en este turno
    const pagos = await this.prisma.extendedClient.pago.findMany({
      where: {
        transaccion: {
          aperturaCajaId: apertura.id,
          tipo: 'INGRESO'
        }
      }
    });

    const desglosePagos = pagos.reduce((acc, p) => {
      acc[p.metodoPago] = (acc[p.metodoPago] || 0) + Number(p.monto);
      acc.total += Number(p.monto);
      return acc;
    }, { total: 0 } as Record<string, number>);

    return {
      abierta: true,
      apertura,
      desglosePagos
    };
  }

  async cerrarCaja(dto: CloseAperturaCajaDto, userId: string) {
    // 1. Validar que el usuario tenga un turno abierto
    const apertura = await this.prisma.extendedClient.aperturaCaja.findFirst({
      where: {
        usuarioId: userId,
        estado: 'ABIERTA'
      },
      include: {
        caja: true
      }
    });

    if (!apertura) {
      throw new BadRequestException('No tienes un turno de caja activo para cerrar.');
    }

    const esperado = Number(apertura.caja.saldoActual);
    if (Number(dto.montoExtraido) > Number(dto.montoCierreReal)) {
      throw new BadRequestException('No se puede retirar más efectivo del que se contó.');
    }

    // 2. Ejecutar transacción
    return this.prisma.extendedClient.$transaction(async (tx) => {
      // A. Cerrar Apertura
      const cierre = await tx.aperturaCaja.update({
        where: { id: apertura.id },
        data: {
          estado: 'CERRADA',
          fechaCierre: new Date(),
          montoCierreEsperado: esperado,
          montoCierreReal: dto.montoCierreReal,
          observaciones: dto.observaciones
        }
      });

      // B. Cerrar la caja: queda lo que se contó menos lo que se retira (no lo
      // esperado: un faltante no puede pasar al turno siguiente como si estuviera).
      await tx.cajaRegistradora.update({
        where: { id: apertura.cajaId },
        data: {
          estado: 'CERRADA',
          saldoActual: Number(dto.montoCierreReal) - Number(dto.montoExtraido)
        }
      });

      return cierre;
    }).then(async (cierre) => {
      const diferencia = Number(dto.montoCierreReal) - esperado;
      if (Math.abs(diferencia) >= 0.01) {
        await registrarAuditoria(this.prisma.extendedClient, {
          tabla: 'aperturas_caja', operacion: 'UPDATE', accion: 'cerrar_caja_con_diferencia',
          descripcion: `Cerró "${apertura.caja.nombre}" con ${diferencia > 0 ? 'sobrante' : 'faltante'} de Bs. ${Math.abs(diferencia).toFixed(2)} (esperado Bs. ${esperado.toFixed(2)}, contado Bs. ${Number(dto.montoCierreReal).toFixed(2)})`,
          despues: { aperturaId: cierre.id, esperado, contado: Number(dto.montoCierreReal) },
        });
      }
      return cierre;
    });
  }
}
