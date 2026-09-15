import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule, ClsMiddleware } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { OrganizacionModule } from './modules/organizacion/organizacion.module';
import { UsuarioModule } from './modules/usuario/usuario.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { HealthModule } from './modules/health/health.module';
import { SucursalModule } from './modules/sucursal/sucursal.module';
import { CajaRegistradoraModule } from './modules/caja-registradora/caja-registradora.module';
import { RolModule } from './modules/rol/rol.module';
import { PermisoModule } from './modules/permiso/permiso.module';
import { PlanModule } from './modules/plan/plan.module';
import { PromocionModule } from './modules/promocion/promocion.module';
import { MembresiaModule } from './modules/membresia/membresia.module';
import { AsistenciaModule } from './modules/asistencia/asistencia.module';
import { CuentaBancariaModule } from './modules/cuenta-bancaria/cuenta-bancaria.module';
import { AperturaCajaModule } from './modules/apertura-caja/apertura-caja.module';
import { TransaccionModule } from './modules/transaccion/transaccion.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ProductoModule } from './modules/producto/producto.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
    // Límite global generoso (protege toda la API de abuso); rutas
    // sensibles como /auth/login aplican un límite más estricto vía @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    RedisModule,
    PrismaModule,
    OrganizacionModule, 
    UsuarioModule,
    AuthModule,
    ClientesModule,
    HealthModule,
    SucursalModule,
    CajaRegistradoraModule,
    RolModule,
    PermisoModule,
    PlanModule,
    PromocionModule,
    MembresiaModule,
    AsistenciaModule,
    CuentaBancariaModule,
    AperturaCajaModule,
    TransaccionModule,
    DashboardModule,
    ProductoModule,
    InventarioModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
