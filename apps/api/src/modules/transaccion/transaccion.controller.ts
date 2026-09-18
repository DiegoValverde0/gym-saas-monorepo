import { Controller, Post, Get, Body, Req, Query, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { TransaccionService } from './transaccion.service';
import { CreateTransaccionDto } from './dto/create-transaccion.dto';
import { QueryTransaccionDto } from './dto/query-transaccion.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

interface RequestWithUser extends ExpressRequest {
  user: {
    sub: string;
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transacciones')
export class TransaccionController {
  constructor(private readonly transaccionService: TransaccionService) {}

  @Post()
  @RequirePermissions({ accion: 'crear', modulo: 'transacciones' })
  create(@Body() createTransaccionDto: CreateTransaccionDto, @Req() req: RequestWithUser) {
    const userId = req.user.sub;
    return this.transaccionService.create(createTransaccionDto, userId);
  }

  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'transacciones' })
  findAll(@Query() query: QueryTransaccionDto) {
    return this.transaccionService.findAll(query);
  }
}
