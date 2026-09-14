import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMembresiaDto } from './dto/create-membresia.dto';
import { UpdateMembresiaDto } from './dto/update-membresia.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

// Transiciones de estado permitidas para Membresia.estado vía update() manual
// (staff). Las transiciones automáticas del sistema (activación al pagar en
// transaccion.service.ts, promoción de cola y vencimiento en los crons de
// abajo) no pasan por aquí -- son cambios internos que el propio sistema
// controla, no algo que un usuario pida libremente desde la UI.
const TRANSICIONES_VALIDAS: Record<string, string[]> = {
  PENDIENTE_PAGO: ['CANCELADA'],
  EN_ESPERA: ['CANCELADA'],
  ACTIVA: ['CANCELADA', 'CONGELADA'],
  CONGELADA: ['ACTIVA', 'CANCELADA'],
  VENCIDA: [],
  CANCELADA: [],
  AGOTADA: ['CANCELADA'],
};

@Injectable()
export class MembresiaService {
  private readonly logger = new Logger(MembresiaService.name);

  constructor(private prisma: PrismaService) {}

  async create(createMembresiaDto: CreateMembresiaDto, userId: string) {
    const { clienteId, planId, promocionId, sucursalId } = createMembresiaDto;

    // 1. Cancelar cualquier membresía PENDIENTE_PAGO previa del cliente para evitar choques
    await this.prisma.extendedClient.membresia.updateMany({
      where: {
        clienteId,
        estado: 'PENDIENTE_PAGO'
      },
      data: {
        estado: 'CANCELADA'
      }
    });

    // 2. Traer el Plan
    const plan = await this.prisma.extendedClient.plan.findUnique({
      where: { id: planId }
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (plan.estado !== 'ACTIVO') throw new BadRequestException('El plan seleccionado no está activo');

    // 3. Traer y validar Promoción
    let descuentoAplicado = 0;
    if (promocionId) {
      const promocion = await this.prisma.extendedClient.promocion.findUnique({
        where: { id: promocionId }
      });
      if (!promocion) throw new NotFoundException('Promoción no encontrada');
      if (promocion.estado !== 'ACTIVO') throw new BadRequestException('Promoción no activa');
      
      const now = new Date();
      if (now < promocion.fechaInicio || now > promocion.fechaFin) {
        throw new BadRequestException('La promoción no está vigente en este momento');
      }

      if (promocion.porcentajeDescuento) {
        descuentoAplicado = (Number(plan.precio) * Number(promocion.porcentajeDescuento)) / 100;
      } else if (promocion.montoDescuentoFijo) {
        descuentoAplicado = Number(promocion.montoDescuentoFijo);
      }
    }

    const montoBase = Number(plan.precio);
    let montoFinal = montoBase - descuentoAplicado;
    if (montoFinal < 0) montoFinal = 0;

    let fechaInicioFinal = createMembresiaDto.fechaInicio ? new Date(createMembresiaDto.fechaInicio) : new Date();
    // Normalizar a 00:00:00 para evitar desfaces horarios en la fecha de inicio
    fechaInicioFinal.setUTCHours(0,0,0,0);

    // 4. Encolamiento: si el cliente ya tiene una membresía ACTIVA/EN_ESPERA/CONGELADA
    // cuyo rango cubre la fecha de inicio solicitada, la nueva se corre al día
    // siguiente de que termine la última en la cola -- evita vender/solapar
    // accesos ya pagados. Al pagarse (transaccion.service.ts), como su
    // fechaInicio queda en el futuro, nace en EN_ESPERA (no ACTIVA) de forma
    // natural con la lógica ya existente ahí.
    const membresiasEnCola = await this.prisma.extendedClient.membresia.findMany({
      where: {
        clienteId,
        estado: { in: ['ACTIVA', 'EN_ESPERA', 'CONGELADA'] },
        fechaFin: { not: null },
      },
      orderBy: { fechaFin: 'desc' },
    });
    const ultimaEnCola = membresiasEnCola[0];
    if (ultimaEnCola?.fechaFin && ultimaEnCola.fechaFin >= fechaInicioFinal) {
      fechaInicioFinal = new Date(ultimaEnCola.fechaFin);
      fechaInicioFinal.setDate(fechaInicioFinal.getDate() + 1);
      fechaInicioFinal.setUTCHours(0, 0, 0, 0);
    }

    let estadoCalculado: any = 'PENDIENTE_PAGO'; // Siempre nace pendiente de pago

    let fechaFinFinal = null;
    if (plan.tipoPlan === 'TIEMPO' && plan.duracionDias) {
      fechaFinFinal = new Date(fechaInicioFinal);
      fechaFinFinal.setDate(fechaFinFinal.getDate() + plan.duracionDias);
    }

    // 5. Creación Transaccional Financiera
    return this.prisma.extendedClient.membresia.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: {
        clienteId,
        sucursalId: sucursalId || undefined,
        planId,
        promocionId: promocionId || null,
        montoBase,
        descuentoAplicado,
        montoFinal,
        fechaInicio: fechaInicioFinal,
        fechaFin: fechaFinFinal,
        sesionesRestantes: plan.tipoPlan === 'SESIONES' ? plan.cantidadSesiones : null,
        estado: estadoCalculado,
        pagada: false,
        creadoPorId: userId,
      } as any,
    });
  }

  async findAll() {
    return this.prisma.extendedClient.membresia.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { nombre: true, numeroDocumento: true } },
        plan: { select: { nombre: true, tipoPlan: true } },
      }
    });
  }

  async findByCliente(clienteId: string) {
    return this.prisma.extendedClient.membresia.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        promocion: true
      }
    });
  }

  async findOne(id: string) {
    const membresia = await this.prisma.extendedClient.membresia.findUnique({
      where: { id },
      include: {
        cliente: true,
        plan: true,
        promocion: true
      }
    });
    if (!membresia) throw new NotFoundException('Membresía no encontrada');
    return membresia;
  }

  async update(id: string, updateMembresiaDto: UpdateMembresiaDto) {
    const actual = await this.findOne(id);

    if (updateMembresiaDto.estado && updateMembresiaDto.estado !== actual.estado) {
      const permitidos = TRANSICIONES_VALIDAS[actual.estado] ?? [];
      if (!permitidos.includes(updateMembresiaDto.estado)) {
        throw new BadRequestException(
          `No se puede cambiar una membresía de ${actual.estado} a ${updateMembresiaDto.estado}.`,
        );
      }
    }

    const resultado = await this.prisma.extendedClient.membresia.update({
      where: { id },
      data: updateMembresiaDto,
    });

    // Si se cancela una membresía que estaba ACTIVA, se libera el cupo antes
    // de tiempo: promovemos ya a la siguiente EN_ESPERA de este cliente.
    if (actual.estado === 'ACTIVA' && resultado.estado === 'CANCELADA') {
      await this.promoverSiguienteEnEspera(actual.clienteId);
    }

    return resultado;
  }

  // Activa la membresía EN_ESPERA más próxima (por fechaInicio) de un cliente,
  // recalculando su fechaInicio/fechaFin a partir de HOY -- el cupo se liberó
  // ahora, no en la fecha que se había estimado al crearla (ver create()).
  private async promoverSiguienteEnEspera(clienteId: string) {
    const siguiente = await this.prisma.extendedClient.membresia.findFirst({
      where: { clienteId, estado: 'EN_ESPERA' },
      orderBy: { fechaInicio: 'asc' },
      include: { plan: true },
    });
    if (!siguiente) return;

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    let fechaFin: Date | null = null;
    if (siguiente.plan.tipoPlan === 'TIEMPO' && siguiente.plan.duracionDias) {
      fechaFin = new Date(hoy);
      fechaFin.setDate(fechaFin.getDate() + siguiente.plan.duracionDias);
    }

    await this.prisma.extendedClient.membresia.update({
      where: { id: siguiente.id },
      data: { estado: 'ACTIVA', fechaInicio: hoy, fechaFin },
    });

    this.logger.log(`Membresía ${siguiente.id} promovida de EN_ESPERA a ACTIVA (cliente ${clienteId}).`);
  }

  async remove(id: string) {
    await this.findOne(id);
    // Preferiblemente Soft Delete, Prisma Client Extendido lo maneja
    return this.prisma.extendedClient.membresia.delete({
      where: { id },
    });
  }

  // =========================================================================
  // TAREAS AUTOMATIZADAS (CRON JOBS)
  // =========================================================================

  // Se ejecuta todos los días a las 00:00 del servidor
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAnulacionMembresiasPendientes() {
    this.logger.log('Iniciando proceso de cancelación automática de membresías no pagadas...');

    // Todas las membresías PENDIENTE_PAGO que no se pagaron el día de su creación.
    // Cancelamos cualquier membresía que tenga más de 24 horas (creada ayer o antes)
    const ayer = new Date();
    ayer.setHours(0, 0, 0, 0);

    const resultado = await this.prisma.extendedClient.membresia.updateMany({
      where: {
        estado: 'PENDIENTE_PAGO',
        createdAt: {
          lt: ayer // estrictamente menor a hoy a las 00:00 (o sea, de ayer o antes)
        }
      },
      data: {
        estado: 'CANCELADA'
      }
    });

    this.logger.log(`Proceso completado. Se anularon ${resultado.count} membresías vencidas sin pago.`);
  }

  // Vence las membresías ACTIVAS cuya fechaFin ya pasó y promueve, para cada
  // cliente afectado, su siguiente membresía EN_ESPERA (si tiene una comprada).
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleVencimientoMembresiasActivas() {
    this.logger.log('Iniciando proceso de vencimiento de membresías activas...');

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    const vencidas = await this.prisma.extendedClient.membresia.findMany({
      where: { estado: 'ACTIVA', fechaFin: { lt: hoy } },
      select: { id: true, clienteId: true },
    });

    for (const mem of vencidas) {
      await this.prisma.extendedClient.membresia.update({
        where: { id: mem.id },
        data: { estado: 'VENCIDA' },
      });
      await this.promoverSiguienteEnEspera(mem.clienteId);
    }

    this.logger.log(`Proceso completado. Se vencieron ${vencidas.length} membresías activas.`);
  }
}
