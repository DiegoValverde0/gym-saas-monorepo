import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransaccionDto } from './dto/create-transaccion.dto';
import { TipoConceptoVenta } from '@prisma/client';

@Injectable()
export class TransaccionService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTransaccionDto, userId: string) {
    // 1. Validaciones Matemáticas
    const sumaDetalles = dto.detalles.reduce((acc, curr) => acc + Number(curr.subtotal), 0);
    const sumaPagos = dto.pagos.reduce((acc, curr) => acc + Number(curr.monto), 0);

    // Permitimos una pequeñísima tolerancia por redondeos en frontend (0.01)
    if (Math.abs(sumaDetalles - dto.montoTotal) > 0.01) {
        throw new BadRequestException('La suma de los subtotales no coincide con el monto total de la transacción.');
    }
    if (Math.abs(sumaPagos - dto.montoTotal) > 0.01) {
        throw new BadRequestException('La suma de los pagos debe cubrir exactamente el 100% del monto total para poder procesar la operación.');
    }

    // 2. Blindaje de Caja (Validar Apertura)
    const aperturaCaja = await this.prisma.extendedClient.aperturaCaja.findFirst({
        where: {
            usuarioId: userId,
            estado: 'ABIERTA'
        },
        include: {
            caja: { select: { sucursalId: true } }
        }
    });

    if (dto.tipo === 'INGRESO' && !aperturaCaja) {
        throw new BadRequestException('No puedes registrar una transacción de cobro sin tener un turno de caja abierto.');
    }

    // 3. Resolver Sucursal. Si hay un turno de caja abierto, la sucursal SIEMPRE
    // se deriva de esa caja física (nunca de lo que mande el DTO) -- evita que
    // el dinero quede registrado en una sucursal distinta de donde realmente
    // está la caja abierta.
    let sucursalId = aperturaCaja?.caja.sucursalId ?? dto.sucursalId;
    if (!sucursalId) {
        const sucursal = await this.prisma.extendedClient.sucursal.findFirst({
            where: { estado: 'ACTIVO' },
            orderBy: { createdAt: 'asc' }
        });
        if (!sucursal) {
            throw new BadRequestException('No hay ninguna sucursal activa en la organización para registrar la transacción.');
        }
        sucursalId = sucursal.id;
    }

    // 4. Ejecución Transaccional (Todo o Nada)
    return this.prisma.extendedClient.$transaction(async (tx) => {
        
        // A. Crear la Transacción Cabecera
        const transaccion = await tx.transaccion.create({
            // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
            data: {
                sucursalId: sucursalId,
                clienteId: dto.clienteId || null,
                aperturaCajaId: aperturaCaja ? aperturaCaja.id : null,
                tipo: dto.tipo,
                montoTotal: dto.montoTotal,
                creadoPorId: userId,
            } as any
        });

        // B. Crear Detalles y validar Membresías
        for (const det of dto.detalles) {
            await tx.detalleTransaccion.create({
                // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
                data: {
                    transaccionId: transaccion.id,
                    tipoConcepto: det.tipoConcepto,
                    membresiaId: det.membresiaId,
                    productoId: det.productoId,
                    servicioId: det.servicioId,
                    descripcionLibre: det.descripcionLibre,
                    cantidad: det.cantidad,
                    precioUnitario: det.precioUnitario,
                    subtotal: det.subtotal,
                } as any
            });

            // Lógica de Activación de Membresía
            if (det.tipoConcepto === 'MEMBRESIA' && det.membresiaId) {
                const mem = await tx.membresia.findUnique({ where: { id: det.membresiaId } });
                if (!mem) throw new BadRequestException(`La membresía ${det.membresiaId} no existe.`);
                if (mem.estado !== 'PENDIENTE_PAGO') throw new BadRequestException(`La membresía ya ha sido procesada anteriormente (Estado Actual: ${mem.estado}).`);

                const hoy = new Date();
                hoy.setHours(0,0,0,0);
                const fechaInicioMem = new Date(mem.fechaInicio);
                fechaInicioMem.setHours(0,0,0,0);

                const nuevoEstado = fechaInicioMem > hoy ? 'EN_ESPERA' : 'ACTIVA';

                await tx.membresia.update({
                    where: { id: mem.id },
                    data: {
                        estado: nuevoEstado,
                        pagada: true
                    }
                });
            }
        }

        // C. Crear Pagos e Incrementar Saldos
        for (const pago of dto.pagos) {
            // Validar cuenta bancaria para todos los métodos (incluyendo efectivo)
            if (!pago.cuentaBancariaId) {
                throw new BadRequestException(`El método de pago ${pago.metodoPago} exige seleccionar una cuenta bancaria destino (Caja Central o Cuenta de Banco).`);
            }

            await tx.pago.create({
                // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
                data: {
                    transaccionId: transaccion.id,
                    metodoPago: pago.metodoPago,
                    monto: pago.monto,
                    cuentaBancariaId: pago.cuentaBancariaId || null,
                    referencia: pago.referencia
                } as any
            });

            // Afectación de saldos contables
            if (dto.tipo === 'INGRESO') {
                // Doble contabilidad: Se registra en la gaveta física si hay turno abierto
                if (pago.metodoPago === 'EFECTIVO' && aperturaCaja) {
                    await tx.cajaRegistradora.update({
                        where: { id: aperturaCaja.cajaId },
                        data: { saldoActual: { increment: pago.monto } }
                    });
                }
                
                // Y siempre se registra en la cuenta bancaria / fondo general seleccionado
                if (pago.cuentaBancariaId) {
                    await tx.cuentaBancaria.update({
                        where: { id: pago.cuentaBancariaId },
                        data: { saldo: { increment: pago.monto } }
                    });
                }
            }
        }

        return transaccion;
    });
  }

  async findAll(tenantId: string) {
    const whereClause: any = {};
    if (tenantId && tenantId !== 'all') {
      whereClause.organizacionId = tenantId;
    }

    const transacciones = await this.prisma.extendedClient.transaccion.findMany({
      where: whereClause,
      include: {
        cliente: { select: { nombre: true, numeroDocumento: true } },
        sucursal: { select: { nombre: true } },
        creadoPor: { select: { nombreCompleto: true, correo: true } },
        pagos: {
          include: {
            cuentaBancaria: { select: { banco: true, numeroCuenta: true } }
          }
        },
        detalles: true
      },
      orderBy: { fechaHora: 'desc' }
    });

    return {
      message: 'Transacciones recuperadas',
      data: transacciones
    };
  }
}
