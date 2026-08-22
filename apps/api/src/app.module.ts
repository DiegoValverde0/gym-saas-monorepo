import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { createClient } from 'redis';
import { ClsModule, ClsMiddleware } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizacionModule } from './modules/organizacion/organizacion.module';
import { UsuarioModule } from './modules/usuario/usuario.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientesModule } from './modules/clientes/clientes.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          // Extraemos el organizacion_id del header o JWT y lo guardamos en el contexto
          const orgId = req.headers['x-organizacion-id'];
          if (orgId) {
            cls.set('organizacion_id', orgId);
          }
        },
      },
    }),
    PrismaModule,
    OrganizacionModule, 
    UsuarioModule,
    AuthModule,
    ClientesModule
  ],
  controllers: [],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6380' });
        await client.connect();
        return client;
      },
    },
  ],
})
export class AppModule {}
