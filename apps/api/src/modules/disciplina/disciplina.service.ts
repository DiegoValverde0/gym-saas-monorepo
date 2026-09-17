import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';

@Injectable()
export class DisciplinaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDisciplinaDto: CreateDisciplinaDto) {
    return await this.prisma.extendedClient.disciplina.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createDisciplinaDto as unknown as Prisma.DisciplinaUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.disciplina.findMany({
        orderBy: { nombre: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.disciplina.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const disciplina = await this.prisma.extendedClient.disciplina.findUnique({
      where: { id },
    });
    if (!disciplina) {
      throw new NotFoundException(`Disciplina con ID ${id} no encontrada`);
    }
    return disciplina;
  }

  async update(id: string, updateDisciplinaDto: UpdateDisciplinaDto) {
    await this.findOne(id);
    return await this.prisma.extendedClient.disciplina.update({
      where: { id },
      data: updateDisciplinaDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Disciplina no tiene deletedAt en el schema: es borrado físico, no soft-delete.
    return this.prisma.extendedClient.disciplina.delete({
      where: { id },
    });
  }
}
