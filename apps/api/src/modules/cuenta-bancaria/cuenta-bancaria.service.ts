import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCuentaBancariaDto } from './dto/create-cuenta-bancaria.dto';
import { UpdateCuentaBancariaDto } from './dto/update-cuenta-bancaria.dto';

@Injectable()
export class CuentaBancariaService {
  constructor(private prisma: PrismaService) {}

  async create(createCuentaBancariaDto: CreateCuentaBancariaDto) {
    return this.prisma.extendedClient.cuentaBancaria.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: createCuentaBancariaDto as any,
    });
  }

  async findAll() {
    return this.prisma.extendedClient.cuentaBancaria.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const cuenta = await this.prisma.extendedClient.cuentaBancaria.findUnique({
      where: { id },
    });
    if (!cuenta) throw new NotFoundException('Cuenta bancaria no encontrada');
    return cuenta;
  }

  async update(id: string, updateCuentaBancariaDto: UpdateCuentaBancariaDto) {
    await this.findOne(id);
    return this.prisma.extendedClient.cuentaBancaria.update({
      where: { id },
      data: updateCuentaBancariaDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.cuentaBancaria.delete({
      where: { id },
    });
  }
}
