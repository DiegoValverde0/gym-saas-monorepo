import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateTransaccionDto } from './dto/create-transaccion.dto';
import { QueryTransaccionDto } from './dto/query-transaccion.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { CONCEPTOS_INGRESO, CONCEPTOS_EGRESO } from './tipo-concepto.util';
import { moduloEstaActivo } from '../../common/utils/modulo.util';

@Injectable()
export class TransaccionService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async create(dto: CreateTransaccionDto, userId: string) {
    // Un solo endpoint sirve tanto ventas (INGRESO) como gastos (EGRESO), así
    // que a diferencia de GastoPlantillaController/ProveedorController no se
    // puede gatear con @RequiereModulo a nivel de controller -- bloquearía
    // también el punto de venta. El chequeo se hace acá, solo para EGRESO.
    if (dto.tipo === 'EGRESO') {
      const organizacionId = this.cls.get('organizacionId');
      if (organizacionId && !(await moduloEstaActivo(this.prisma, organizacionId, 'controlGastos'))) {
        throw new ForbiddenException('El módulo de Gastos no está activado para tu organización. Actívalo en Configuración.');
      }
    }

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

    // 1.5. Consistencia entre el tipo de transacción y las categorías de sus
    // líneas -- sin esto se podría registrar, por ejemplo, un EGRESO con una
    // línea de concepto MEMBRESIA (que además activaría la membresía más
    // abajo, algo sin sentido para un gasto).
    const conceptosEsperados = dto.tipo === 'INGRESO' ? CONCEPTOS_INGRESO : CONCEPTOS_EGRESO;
    const detalleInvalido = dto.detalles.find((det) => !conceptosEsperados.has(det.tipoConcepto));
    if (detalleInvalido) {
        throw new BadRequestException(
            `La categoría "${detalleInvalido.tipoConcepto}" no corresponde a una transacción de tipo ${dto.tipo}.`,
        );
    }

    // 2. Blindaje de Caja (Validar Apertura). Solo INGRESO lo exige, igual
    // que antes -- EGRESO se queda con la misma flexibilidad que ya tenía
    // (coherente con que AperturaCaja sea opcional en el modelo, pensado
    // para el gym informal). Si hay un turno abierto, el gasto en efectivo
    // también se descuenta de esa gaveta más abajo; si no lo hay, el gasto
    // igual se registra y afecta la cuenta bancaria/fondo general elegido.
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
                proveedorId: dto.proveedorId || null,
                beneficiario: dto.beneficiario || null,
                montoTotal: dto.montoTotal,
                creadoPorId: userId,
            } as unknown as Prisma.TransaccionUncheckedCreateInput
        });

        // B. Crear Detalles (una sola operación bulk en vez de un create por línea)
        await tx.detalleTransaccion.createMany({
            // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
            data: dto.detalles.map((det) => ({
                transaccionId: transaccion.id,
                tipoConcepto: det.tipoConcepto,
                membresiaId: det.membresiaId,
                productoId: det.productoId,
                servicioId: det.servicioId,
                descripcionLibre: det.descripcionLibre,
                cantidad: det.cantidad,
                precioUnitario: det.precioUnitario,
                subtotal: det.subtotal,
            })) as unknown as Prisma.DetalleTransaccionCreateManyInput[],
        });

        // Activación de Membresía: a diferencia de la creación de detalles de
        // arriba, esto no se puede volver una sola operación bulk porque cada
        // membresía se valida y transiciona individualmente. En la práctica
        // solo itera los pocos detalles (normalmente 0 o 1) de tipo MEMBRESIA.
        for (const det of dto.detalles) {
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

        // C. Crear Pagos (validar todos antes de escribir nada, igual que antes)
        for (const pago of dto.pagos) {
            if (!pago.cuentaBancariaId) {
                throw new BadRequestException(`El método de pago ${pago.metodoPago} exige seleccionar una cuenta bancaria destino (Caja Central o Cuenta de Banco).`);
            }
        }

        await tx.pago.createMany({
            // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
            data: dto.pagos.map((pago) => ({
                transaccionId: transaccion.id,
                metodoPago: pago.metodoPago,
                monto: pago.monto,
                cuentaBancariaId: pago.cuentaBancariaId,
                referencia: pago.referencia,
            })) as unknown as Prisma.PagoCreateManyInput[],
        });

        // Afectación de saldos contables: se suma el movimiento total por
        // cuenta destino (en vez de un update por cada pago individual) y se
        // aplica en una sola operación por cuenta afectada. INGRESO suma,
        // EGRESO resta -- antes de este cambio EGRESO no tocaba ningún saldo
        // (el bloque entero estaba condicionado a `tipo === 'INGRESO'`), así
        // que un gasto se registraba sin ningún efecto contable real.
        let montoCaja = 0;
        const montosPorCuenta = new Map<string, number>();

        for (const pago of dto.pagos) {
            if (pago.metodoPago === 'EFECTIVO' && aperturaCaja) {
                montoCaja += Number(pago.monto);
            }
            const cuentaId = pago.cuentaBancariaId as string;
            montosPorCuenta.set(cuentaId, (montosPorCuenta.get(cuentaId) || 0) + Number(pago.monto));
        }

        // A propósito no se bloquea un saldo que quedaría negativo: igual que
        // con la caja física (ver arqueo-caja-wizard.tsx), un descuadre es
        // información legítima a detectar en el cierre, no un error a impedir
        // -- coherente con la flexibilidad informal que ya tiene el resto del
        // sistema (ver notas de arquitectura al inicio de schema.prisma).
        const signo = dto.tipo === 'INGRESO' ? 1 : -1;

        // Doble contabilidad: Se registra en la gaveta física si hay turno abierto
        if (montoCaja > 0 && aperturaCaja) {
            await tx.cajaRegistradora.update({
                where: { id: aperturaCaja.cajaId },
                data: { saldoActual: { increment: signo * montoCaja } }
            });
        }

        // Y siempre se registra en la cuenta bancaria / fondo general seleccionado
        for (const [cuentaBancariaId, monto] of montosPorCuenta) {
            await tx.cuentaBancaria.update({
                where: { id: cuentaBancariaId },
                data: { saldo: { increment: signo * monto } }
            });
        }

        return transaccion;
    });
  }

  async findAll(query?: QueryTransaccionDto) {
    const whereClause: Prisma.TransaccionWhereInput = query?.tipo ? { tipo: query.tipo } : {};

    const { page, limit, skip, take } = resolverPaginacion(query);
    const [transacciones, total] = await Promise.all([
      this.prisma.extendedClient.transaccion.findMany({
        where: whereClause,
        include: {
          cliente: { select: { nombre: true, numeroDocumento: true } },
          proveedor: { select: { nombre: true } },
          sucursal: { select: { nombre: true } },
          creadoPor: { select: { nombreCompleto: true, correo: true } },
          pagos: {
            include: {
              cuentaBancaria: { select: { banco: true, numeroCuenta: true } }
            }
          },
          detalles: true
        },
        orderBy: { fechaHora: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.transaccion.count({ where: whereClause }),
    ]);

    return paginar(transacciones, total, page, limit);
  }
}
