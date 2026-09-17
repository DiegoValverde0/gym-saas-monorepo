import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

const INCLUDE_STAFF = {
  usuario: { select: { nombreCompleto: true, correo: true } },
  staffDisciplinas: { include: { disciplina: true } },
} as const;

@Injectable()
export class PersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPersonalDto: CreatePersonalDto) {
    const { disciplinaIds, ...staffData } = createPersonalDto;

    // El perfil de staff extiende a un usuario que ya debe tener acceso a
    // esta organización (creado antes vía el módulo de Usuarios) -- no se
    // crea un Usuario nuevo aquí.
    //
    // AsignacionAcceso.organizacionId es opcional en el schema (el superadmin
    // tiene una asignación global con organizacionId null), así que la
    // extensión RLS deja pasar también esa fila global en un findFirst (ver
    // el carve-out para campos opcionales en prisma.service.ts). Se descarta
    // explícitamente para que nadie pueda convertir al superadmin en staff
    // de un tenant.
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.findFirst({
      where: { usuarioId: createPersonalDto.usuarioId },
    });
    if (!asignacion || asignacion.organizacionId === null) {
      throw new BadRequestException('El usuario debe tener una asignación de acceso en esta organización antes de crear su perfil de staff.');
    }

    return await this.prisma.extendedClient.$transaction(async (tx) => {
      const staff = await tx.perfilStaff.create({
        // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
        data: staffData as unknown as Prisma.PerfilStaffUncheckedCreateInput,
      });

      if (disciplinaIds && disciplinaIds.length > 0) {
        await tx.staffDisciplina.createMany({
          data: disciplinaIds.map((disciplinaId) => ({ staffId: staff.id, disciplinaId })) as unknown as Prisma.StaffDisciplinaCreateManyInput[],
        });
      }

      return tx.perfilStaff.findUnique({ where: { id: staff.id }, include: INCLUDE_STAFF });
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.perfilStaff.findMany({
        include: INCLUDE_STAFF,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.perfilStaff.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const staff = await this.prisma.extendedClient.perfilStaff.findUnique({
      where: { id },
      include: INCLUDE_STAFF,
    });
    if (!staff) {
      throw new NotFoundException(`Perfil de staff con ID ${id} no encontrado`);
    }
    return staff;
  }

  async update(id: string, updatePersonalDto: UpdatePersonalDto) {
    await this.findOne(id);
    const { disciplinaIds, ...staffData } = updatePersonalDto;
    // usuarioId se ignora a propósito: el perfil queda ligado al mismo
    // usuario para siempre, no se "reasigna" a otra persona.
    delete (staffData as { usuarioId?: string }).usuarioId;

    return this.prisma.extendedClient.$transaction(async (tx) => {
      await tx.perfilStaff.update({ where: { id }, data: staffData });

      if (disciplinaIds !== undefined) {
        await tx.staffDisciplina.deleteMany({ where: { staffId: id } });
        if (disciplinaIds.length > 0) {
          await tx.staffDisciplina.createMany({
            data: disciplinaIds.map((disciplinaId) => ({ staffId: id, disciplinaId })) as unknown as Prisma.StaffDisciplinaCreateManyInput[],
          });
        }
      }

      return tx.perfilStaff.findUnique({ where: { id }, include: INCLUDE_STAFF });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.perfilStaff.delete({
      where: { id },
    });
  }

  async restore(id: string) {
    // No usamos findOne porque está filtrado por deletedAt: null
    return this.prisma.extendedClient.perfilStaff.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
