import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DeletedInterceptor } from './common/interceptors/deleted.interceptor';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisClientType } from 'redis';
import { AlmacenLimitesRedis } from './common/limites/almacen-redis';
import { LimiteGuard } from './common/limites/limite.guard';
import { LIMITES } from './common/limites/limites';
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
import { AccesoClasesModule } from './modules/acceso-clases/acceso-clases.module';
import { SistemaModule } from './modules/sistema/sistema.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { SalaModule } from './modules/sala/sala.module';
import { PortalModule } from './modules/portal/portal.module';
import { AvisosModule } from './modules/avisos/avisos.module';
import { ReporteriaModule } from './modules/reporteria/reporteria.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
    // Límite general por IP para toda la API; las rutas sensibles o pesadas
    // ponen el suyo con @Throttle. Los valores están en common/limites/limites.ts
    // y los contadores en Redis (docs/plan-seguridad.md, fase 2). Un solo
    // limitador "default": así la cabecera es la estándar Retry-After.
    ThrottlerModule.forRootAsync({
      inject: ['REDIS_CLIENT'],
      useFactory: (redis: RedisClientType) => ({
        throttlers: [{ name: 'default', ...LIMITES.general }],
        storage: new AlmacenLimitesRedis(redis),
        errorMessage: 'Demasiados pedidos seguidos. Espera un momento y vuelve a intentarlo.',
      }),
    }),
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
    AccesoClasesModule,
    SistemaModule,
    AgendaModule,
    ReportesModule,
    AuditoriaModule,
    SalaModule,
    PortalModule,
    AvisosModule,
    ReporteriaModule,
    ScheduleModule.forRoot()
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: LimiteGuard },
    { provide: APP_INTERCEPTOR, useClass: DeletedInterceptor },
  ],
})
export class AppModule {}
