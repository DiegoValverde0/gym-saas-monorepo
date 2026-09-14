import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermisoService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    // Permisos es global, no tiene organizacionId, por ende se lee directo
    return this.prisma.extendedClient.permiso.findMany({
      orderBy: [
        { modulo: 'asc' },
        { accion: 'asc' },
      ],
    });
  }
}
