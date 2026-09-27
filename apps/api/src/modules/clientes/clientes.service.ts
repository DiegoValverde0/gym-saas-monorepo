import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { Prisma } from '@prisma/client';
import { ClientesQueryDto } from './dto/clientes-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { calcularSegmentoCliente } from './segmentacion-cliente.util';

const SELECT_MEMBRESIAS_SEGMENTO = { estado: true, fechaInicio: true, fechaFin: true, pagada: true } as const;

interface RequerimientosClienteConfig {
  exigirDni?: boolean;
  exigirCorreo?: boolean;
  exigirTelefono?: boolean;
}

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  // Antes esta política ("Exigir DNI/Correo/Teléfono") solo se validaba en el
  // formulario del frontend (clientes/page.tsx) -- cualquiera que llamara la
  // API directamente la podía saltar por completo. Se valida acá con los
  // mismos datos ya "resueltos" (creación, o edición mezclada con lo existente).
  private async assertRequerimientosCliente(datos: { numeroDocumento?: string | null; correo?: string | null; telefono?: string | null }) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return;

    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { configuracion: true },
    });
    const requerimientos = (org?.configuracion as { requerimientosCliente?: RequerimientosClienteConfig } | null)
      ?.requerimientosCliente;
    if (!requerimientos) return;

    if (requerimientos.exigirDni && !datos.numeroDocumento) {
      throw new BadRequestException('Esta organización exige número de documento para registrar un cliente.');
    }
    if (requerimientos.exigirCorreo && !datos.correo) {
      throw new BadRequestException('Esta organización exige correo electrónico para registrar un cliente.');
    }
    if (requerimientos.exigirTelefono && !datos.telefono) {
      throw new BadRequestException('Esta organización exige teléfono para registrar un cliente.');
    }
  }

  async create(createClienteDto: CreateClienteDto) {
    await this.assertRequerimientosCliente(createClienteDto);
    return await this.prisma.extendedClient.cliente.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createClienteDto as unknown as Prisma.ClienteUncheckedCreateInput,
    });
  }

  async findAll(query?: ClientesQueryDto) {
    // 100% Ciego al tenant. La magia RLS de Prisma hará el filtrado.
    // Paginado para no traer de golpe toda la tabla de un tenant con miles de clientes.
    const { page, limit, skip, take } = resolverPaginacion(query);
    const termino = query?.search?.trim();
    const where: Prisma.ClienteWhereInput = {
      ...(termino && {
        OR: [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { numeroDocumento: { contains: termino } },
          { correo: { contains: termino, mode: 'insensitive' } },
          { telefono: { contains: termino } },
        ],
      }),
      ...(query?.estado === 'activos' && { estado: 'ACTIVO' }),
      ...(query?.estado === 'inactivos' && { estado: { not: 'ACTIVO' } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.cliente.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        // Solo lo mínimo para clasificar (ver segmentacion-cliente.util.ts);
        // no se expone el array de membresías en la respuesta, solo el
        // segmento ya calculado.
        include: { membresias: { select: SELECT_MEMBRESIAS_SEGMENTO } },
      }),
      this.prisma.extendedClient.cliente.count({ where }),
    ]);
    const dataConSegmento = data.map(({ membresias, ...cliente }) => ({
      ...cliente,
      segmento: calcularSegmentoCliente(membresias),
    }));
    return paginar(dataConSegmento, total, page, limit);
  }

  async findOne(id: string) {
    const cliente = await this.prisma.extendedClient.cliente.findUnique({
      where: { id },
      include: { membresias: { select: SELECT_MEMBRESIAS_SEGMENTO } },
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    const { membresias, ...rest } = cliente;
    return { ...rest, segmento: calcularSegmentoCliente(membresias) };
  }

  // Ficha 360 del cliente (plan 11.1): membresía actual y días que le
  // quedan, lo necesario para "Renovar" con el mismo plan y forma de pago,
  // últimas asistencias, reservas próximas y últimos pagos.
  async ficha(id: string) {
    const db = this.prisma.extendedClient;
    const cliente = await this.findOne(id);
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    const [membresias, asistencias, reservas, transacciones] = await Promise.all([
      db.membresia.findMany({
        where: { clienteId: id, estado: { in: ['ACTIVA', 'EN_ESPERA', 'CONGELADA', 'VENCIDA'] } },
        include: { plan: { select: { id: true, nombre: true, tipoPlan: true, estado: true } } },
        orderBy: { fechaInicio: 'desc' },
        take: 5,
      }),
      db.registroAsistencia.findMany({
        where: { clienteId: id },
        select: { fechaHoraIngreso: true, sucursal: { select: { nombre: true } } },
        orderBy: { fechaHoraIngreso: 'desc' },
        take: 5,
      }),
      db.reservaClase.findMany({
        where: { clienteId: id, estado: 'CONFIRMADA', clase: { fechaHora: { gte: new Date() }, estado: 'ACTIVO' } },
        select: { id: true, clase: { select: { nombreClase: true, fechaHora: true, sucursal: { select: { nombre: true } } } } },
        orderBy: { clase: { fechaHora: 'asc' } },
        take: 5,
      }),
      db.transaccion.findMany({
        where: { clienteId: id, tipo: 'INGRESO' },
        select: {
          fechaHora: true,
          montoTotal: true,
          pagos: { select: { metodoPago: true } },
          detalles: { select: { tipoConcepto: true, descripcionLibre: true, membresia: { select: { plan: { select: { nombre: true } } } } } },
        },
        orderBy: { fechaHora: 'desc' },
        take: 5,
      }),
    ]);

    type M = (typeof membresias)[number];
    const vigente = membresias.find((m: M) => m.estado === 'ACTIVA' && m.fechaInicio <= hoy && (!m.fechaFin || m.fechaFin >= hoy));
    const enEspera = membresias.filter((m: M) => m.estado === 'EN_ESPERA').sort((a: M, b: M) => a.fechaInicio.getTime() - b.fechaInicio.getTime())[0];
    const actual = vigente ?? enEspera ?? null;
    const ultima = membresias[0] ?? null;
    const diasRestantes = actual?.fechaFin ? Math.max(0, Math.round((actual.fechaFin.getTime() - hoy.getTime()) / 86_400_000)) : null;

    const describirMembresia = (m: M) => ({
      id: m.id,
      estado: m.estado,
      planId: m.plan.id,
      planNombre: m.plan.nombre,
      tipoPlan: m.plan.tipoPlan,
      fechaInicio: m.fechaInicio.toISOString().slice(0, 10),
      fechaFin: m.fechaFin ? m.fechaFin.toISOString().slice(0, 10) : null,
      sesionesRestantes: m.sesionesRestantes,
    });

    return {
      cliente,
      membresiaActual: actual ? { ...describirMembresia(actual), diasRestantes } : null,
      // "Renovar": mismo plan de la última membresía (si sigue activo) y la
      // forma de pago del último cobro.
      renovacion: ultima && ultima.plan.estado === 'ACTIVO'
        ? { planId: ultima.plan.id, planNombre: ultima.plan.nombre, formaPago: transacciones[0]?.pagos[0]?.metodoPago ?? 'EFECTIVO' }
        : null,
      asistencias: asistencias.map((a: { fechaHoraIngreso: Date; sucursal: { nombre: string } }) => ({ fechaHora: a.fechaHoraIngreso, sucursal: a.sucursal.nombre })),
      reservas: reservas.map((r: { id: string; clase: { nombreClase: string; fechaHora: Date; sucursal: { nombre: string } } }) => ({
        id: r.id,
        clase: r.clase.nombreClase,
        fechaHora: r.clase.fechaHora,
        sucursal: r.clase.sucursal.nombre,
      })),
      pagos: transacciones.map((t: { fechaHora: Date; montoTotal: unknown; pagos: { metodoPago: string }[]; detalles: { tipoConcepto: string; descripcionLibre: string | null; membresia: { plan: { nombre: string } } | null }[] }) => ({
        fechaHora: t.fechaHora,
        monto: Number(t.montoTotal),
        formaPago: t.pagos.map((p) => p.metodoPago).join(' + '),
        concepto: t.detalles.map((d) => d.descripcionLibre || (d.membresia ? `Membresía ${d.membresia.plan.nombre}` : d.tipoConcepto)).join(', '),
      })),
    };
  }

  async update(id: string, updateData: Prisma.ClienteUpdateInput) {
    // Primero verificamos si existe (y si pertenece al tenant gracias a RLS implícito)
    const actual = await this.findOne(id);
    // 'campo' in updateData: si no viene en el patch, se conserva el valor actual;
    // si viene explícito (incluso null, para "borrar" el campo), se valida ese.
    await this.assertRequerimientosCliente({
      numeroDocumento: 'numeroDocumento' in updateData ? (updateData.numeroDocumento as string | null) : actual.numeroDocumento,
      correo: 'correo' in updateData ? (updateData.correo as string | null) : actual.correo,
      telefono: 'telefono' in updateData ? (updateData.telefono as string | null) : actual.telefono,
    });
    return await this.prisma.extendedClient.cliente.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.cliente.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.cliente.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
