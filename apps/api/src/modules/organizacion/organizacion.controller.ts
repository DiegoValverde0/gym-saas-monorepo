import { Controller, Post, Body } from '@nestjs/common';
import { OrganizacionService } from './organizacion.service';

@Controller('organizacion')
export class OrganizacionController {
  constructor(private readonly organizacionService: OrganizacionService) {}

  @Post('registrar')
  async registrarTenant(@Body() body: any): Promise<any> {
    return this.organizacionService.crearOrganizacionConAdmin(body);
  }
}
