import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

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

  async findAll(query?: PaginationQueryDto) {
    // 100% Ciego al tenant. La magia RLS de Prisma hará el filtrado.
    // Paginado para no traer de golpe toda la tabla de un tenant con miles de clientes.
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.cliente.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.extendedClient.cliente.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const cliente = await this.prisma.extendedClient.cliente.findUnique({
      where: { id },
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    return cliente;
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
