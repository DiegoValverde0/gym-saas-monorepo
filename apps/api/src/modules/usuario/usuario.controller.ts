import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantInterceptor } from '../../common/interceptors/tenant.interceptor';
import { TenantPrisma } from '../../common/decorators/tenant-prisma.decorator';

@Controller('usuario')
@UseGuards(AuthGuard)
@UseInterceptors(TenantInterceptor)
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  @Get()
  async listarUsuarios(@TenantPrisma() tenantPrisma: any): Promise<any> {
    return this.usuarioService.listarUsuarios(tenantPrisma);
  }
}
