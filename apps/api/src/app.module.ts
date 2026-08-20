import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { createClient } from 'redis';
import { getPrismaClientForTenant } from '@repo/database';
import { OrganizacionModule } from './modules/organizacion/organizacion.module';
import { UsuarioModule } from './modules/usuario/usuario.module';

@Module({
  imports: [OrganizacionModule, UsuarioModule],
  controllers: [],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = createClient({ url: 'redis://redis:6379' });
        await client.connect();
        return client;
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Ejemplo de middleware que extrae el organizacion_id del request (e.g. desde el JWT)
    consumer.apply((req, res, next) => {
      // Extraer del JWT o Headers
      const orgId = req.headers['x-organizacion-id'];
      if (orgId) {
        req.prisma = getPrismaClientForTenant(orgId as string);
      }
      next();
    }).forRoutes('*');
  }
}
