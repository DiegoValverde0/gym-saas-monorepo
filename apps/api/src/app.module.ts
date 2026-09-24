import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DeletedInterceptor } from './common/interceptors/deleted.interceptor';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
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
import { ProveedorModule } from './modules/proveedor/proveedor.module';
import { GastoPlantillaModule } from './modules/gasto-plantilla/gasto-plantilla.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ProductoModule } from './modules/producto/producto.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { DisciplinaModule } from './modules/disciplina/disciplina.module';
import { PersonalModule } from './modules/personal/personal.module';
import { TurnoTrabajoModule } from './modules/turno-trabajo/turno-trabajo.module';
import { TurnoPlantillaModule } from './modules/turno-plantilla/turno-plantilla.module';
import { ClasePlantillaModule } from './modules/clase-plantilla/clase-plantilla.module';
import { ClaseProgramadaModule } from './modules/clase-programada/clase-programada.module';
import { ReservaClaseModule } from './modules/reserva-clase/reserva-clase.module';
import { SistemaModule } from './modules/sistema/sistema.module';
import { AgendaModule } from './modules/agenda/agenda.module';
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
    ProveedorModule,
    GastoPlantillaModule,
    DashboardModule,
    ProductoModule,
    InventarioModule,
    DisciplinaModule,
    PersonalModule,
    TurnoTrabajoModule,
    TurnoPlantillaModule,
    ClaseProgramadaModule,
    ClasePlantillaModule,
    ReservaClaseModule,
    SistemaModule,
    AgendaModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: DeletedInterceptor },
  ],
})
export class AppModule {}
