import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class SucursalService {
  constructor(private readonly prisma: PrismaService) {}

  // Sede principal: es la sucursal con la que arranca todo el sistema para
  // quien tiene acceso a todas (sucursal predeterminada, plan de
  // simplificación 5.1). Reglas, sin cambio de base de datos:
  //  - Hay una sola principal: marcar una desmarca las demás.
  //  - La primera sucursal que se crea es la principal.
  //  - La principal no se desmarca, desactiva ni elimina mientras haya otras:
  //    primero se marca otra como principal.
  async create(createSucursalDto: CreateSucursalDto) {
    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const hayPrincipal = await tx.sucursal.count({ where: { esPrincipal: true, estado: 'ACTIVO' } });
      const esPrincipal = createSucursalDto.esPrincipal === true || hayPrincipal === 0;
      if (esPrincipal) await tx.sucursal.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } });
      return tx.sucursal.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: { ...createSucursalDto, esPrincipal } as unknown as Prisma.SucursalUncheckedCreateInput,
      });
    });
  }

  private async assertPuedeDejarDeSerPrincipal(tx: Prisma.TransactionClient, id: string, accion: string) {
    const otras = await tx.sucursal.count({ where: { id: { not: id } } });
    if (otras > 0) {
      throw new BadRequestException(`Esta es la sede principal. Antes de ${accion}, marca otra sucursal como principal.`);
    }
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.sucursal.findMany({
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.sucursal.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  /** Las sucursales activas del gimnasio, solo con lo que hace falta para elegir una. */
  async basicas() {
    return this.prisma.extendedClient.sucursal.findMany({
      where: { estado: 'ACTIVO' },
      select: { id: true, nombre: true, esPrincipal: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const sucursal = await this.prisma.extendedClient.sucursal.findUnique({
      where: { id },
    });
    if (!sucursal) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada en esta organización`);
    }
    return sucursal;
  }

  async update(id: string, updateSucursalDto: UpdateSucursalDto) {
    // Validar existencia en el tenant antes de actualizar
    const actual = await this.findOne(id);

    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      if (actual.esPrincipal) {
        if (updateSucursalDto.esPrincipal === false) await this.assertPuedeDejarDeSerPrincipal(tx, id, 'quitarle esa marca');
        if (updateSucursalDto.estado && updateSucursalDto.estado !== 'ACTIVO') await this.assertPuedeDejarDeSerPrincipal(tx, id, 'desactivarla');
      } else if (updateSucursalDto.esPrincipal === true) {
        if ((updateSucursalDto.estado ?? actual.estado) !== 'ACTIVO') {
          throw new BadRequestException('Una sucursal inactiva no puede ser la sede principal.');
        }
        await tx.sucursal.updateMany({ where: { esPrincipal: true, id: { not: id } }, data: { esPrincipal: false } });
      }
      return tx.sucursal.update({ where: { id }, data: updateSucursalDto });
    });
  }

  async remove(id: string) {
    const actual = await this.findOne(id);
    return this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      if (actual.esPrincipal) await this.assertPuedeDejarDeSerPrincipal(tx, id, 'eliminarla');
      return tx.sucursal.delete({ where: { id } });
    });
  }

  async restore(id: string) {
    // Restaurar el registro haciendo null el deletedAt
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.sucursal.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
