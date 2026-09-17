import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class SistemaService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService
  ) {}

  async restaurar(modelo: string, id: string) {
    const validModels = [
      'cliente', 'plan', 'promocion', 'producto', 'usuario', 'sucursal', 'membresia', 'reservaClase', 'claseProgramada', 'disciplina', 'turnoTrabajo', 'rol', 'cajaRegistradora', 'perfilStaff'
    ];

    if (!validModels.includes(modelo)) {
      throw new BadRequestException(`El modelo '${modelo}' no soporta restauración o no es válido.`);
    }

    const organizacionId = this.cls.get('organizacionId');
    const isSuperAdmin = this.cls.get('is_superadmin');

    // Construimos el query usando el cliente base de Prisma para saltarnos la extensión
    // que automáticamente inyecta "deletedAt = null" en las búsquedas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { id };
    
    if (!isSuperAdmin) {
      if (!organizacionId) {
        throw new BadRequestException('No se puede restaurar sin un tenant activo');
      }
      where.organizacionId = organizacionId;
    }

    try {
      // Verificamos si existe (incluso borrado)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = await (this.prisma as any)[modelo].findFirst({ where });
      
      if (!target) {
        throw new NotFoundException(`Registro no encontrado o no pertenece a tu organización.`);
      }

      if (target.deletedAt === null || target.deletedAt === undefined) {
        throw new BadRequestException('El registro no está eliminado.');
      }

      // Restauramos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restored = await (this.prisma as any)[modelo].update({
        where: { id: target.id },
        data: { deletedAt: null }
      });

      return restored;
    } catch (e: unknown) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('Error al restaurar el registro: ' + (e as Error).message);
    }
  }
}
