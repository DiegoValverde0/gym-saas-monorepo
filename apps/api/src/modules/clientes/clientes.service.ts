import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    // 100% Ciego al tenant. La magia RLS de Prisma hará el filtrado 
    // porque el organizacion_id está en el nestjs-cls context (setted por JwtAuthGuard).
    return this.prisma.extendedClient.cliente.findMany();
  }
}
