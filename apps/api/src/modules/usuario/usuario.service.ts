import { Injectable } from '@nestjs/common';

@Injectable()
export class UsuarioService {
  
  // Recibimos el cliente de Prisma ya filtrado por Tenant (RLS) desde el controlador
  async listarUsuarios(tenantPrisma: any): Promise<any> {
    // Si RLS está bien configurado en BD, esta consulta jamás traerá usuarios de otra organización.
    // Dependiendo de tu lógica de la BD, 'asignaciones_acceso' nos dirá quiénes están en esta org.
    return tenantPrisma.asignacion_Acceso.findMany({
      include: {
        usuario: true,
        rol: true
      }
    });
  }
}
