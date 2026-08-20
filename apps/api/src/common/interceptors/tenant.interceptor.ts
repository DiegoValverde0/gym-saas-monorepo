import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { getPrismaClientForTenant, prisma } from '@repo/database';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    // Si la petición ya pasó por el AuthGuard, usamos el organizacion_id del token
    const orgId = request.user?.organizacion_id || request.headers['x-organizacion-id'];

    if (orgId) {
      // Inyectar prisma con contexto de tenant (RLS)
      request.prisma = getPrismaClientForTenant(orgId);
    } else {
      // Cliente global (sin tenant), usado para login/registro de la propia organización
      request.prisma = prisma;
    }

    return next.handle();
  }
}
