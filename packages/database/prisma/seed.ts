import { PrismaClient, EstadoOrganizacion, MetodoPago, TipoConceptoVenta, TipoTransaccion, TipoPlan, Genero, EstadoMembresia, EstadoAperturaCaja } from '@prisma/client';
import { asegurarSuperadmin, hashPassword, sembrarPermisosYRoles } from './base';

// Seed de DESARROLLO: borra todo y crea el gimnasio de ejemplo (Gym Titan)
// con cuentas de prueba. En producción se usa prisma/inicial.ts.
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando la siembra de datos (Seed)...');

  // Limpiar la base de datos
  console.log('🧹 Limpiando datos existentes...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "organizaciones" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "usuarios" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "permisos" CASCADE;`);
  // Los roles base son globales (sin organización): hay que vaciarlos aparte
  // para que sembrarPermisosYRoles los vuelva a crear con sus permisos.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "roles" CASCADE;`);
  
  // =======================================================
  // 1 y 2. PERMISOS, ROLES BASE Y SUPERADMIN (prisma/base.ts)
  // =======================================================
  console.log('🛡️ Creando permisos, los 5 roles base y el SuperAdmin global...');
  const roles = await sembrarPermisosYRoles(prisma);
  await asegurarSuperadmin(prisma, roles.SUPERADMIN, {
    nombreCompleto: 'Super Admin',
    correo: 'admin@gymmanager.com',
    contrasena: 'admin123',
    telefono: '12345678',
  });

  // =======================================================
  // 3. CREACIÓN DE ORGANIZACIONES Y SUCURSALES
  // =======================================================
  console.log('🏢 Creando organizaciones...');
  
  const orgTitan = await prisma.organizacion.create({
    data: {
      nombre: 'Gym Titan',
      razonSocial: 'Titan Fitness SRL',
      identificacionFiscal: '100200300',
      moneda: 'BOB',
      estado: EstadoOrganizacion.ACTIVO,
    }
  });

  const sucursalTitan = await prisma.sucursal.create({
    data: {
      organizacionId: orgTitan.id,
      nombre: 'Titan Central',
      esPrincipal: true,
      direccion: 'Av. Principal 123',
    }
  });

  // Crear un usuario DUEÑO (Admin Gym) para la organización Titan
  const duenoUser = await prisma.usuario.create({
    data: {
      nombreCompleto: 'Dueño Gym Titan',
      correo: 'dueno@gymtitan.com',
      contrasenaHash: hashPassword('admin123'),
    }
  });
  await prisma.asignacionAcceso.create({
    data: {
      usuarioId: duenoUser.id,
      organizacionId: orgTitan.id,
      rolId: roles.ADMIN_GYM,
      sucursalId: null, // Acceso a todas las sucursales
    }
  });

  // Crear un usuario Recepcionista de prueba
  const recepcionistaUser = await prisma.usuario.create({
    data: {
      nombreCompleto: 'Ana Recepción',
      correo: 'ana@gymtitan.com',
      contrasenaHash: hashPassword('ana123'),
    }
  });
  await prisma.asignacionAcceso.create({
    data: {
      usuarioId: recepcionistaUser.id,
      organizacionId: orgTitan.id,
      rolId: roles.RECEPCIONISTA,
      sucursalId: sucursalTitan.id,
    }
  });

  // Un instructor (rol ENTRENADOR, con su perfil de equipo): para ver el
  // panel como lo ve un instructor y para las pruebas e2e (docs/plan-pruebas-e2e.md).
  const instructorUser = await prisma.usuario.create({
    data: {
      nombreCompleto: 'Carlos Instructor',
      correo: 'carlos@gymtitan.com',
      contrasenaHash: hashPassword('carlos123'),
    }
  });
  await prisma.asignacionAcceso.create({
    data: {
      usuarioId: instructorUser.id,
      organizacionId: orgTitan.id,
      rolId: roles.ENTRENADOR,
      sucursalId: sucursalTitan.id,
    }
  });
  await prisma.perfilStaff.create({
    data: { usuarioId: instructorUser.id, organizacionId: orgTitan.id, tipoContratacion: 'INDEPENDIENTE' }
  });

  // =======================================================
  // 5. FLUJO BÁSICO (CAJA, PLAN, CLIENTE, VENTA)
  // =======================================================
  // Una venta de ejemplo completa y coherente: Ana (recepción) abrió la caja,
  // le vendió a Juan un plan mensual en efectivo y cerró su turno. Así Juan
  // aparece como cliente activo y la caja queda libre para abrirla de nuevo.
  const cajaTitan = await prisma.cajaRegistradora.create({
    data: { organizacionId: orgTitan.id, sucursalId: sucursalTitan.id, nombre: 'Caja Recepción Central' }
  });

  // Misma cuenta que crea el sistema en modo simple (transaccion.service.ts,
  // CUENTA_EFECTIVO_SIMPLE): con ella también se puede cobrar en efectivo en
  // intermedio y experto sin tener que crear una cuenta antes.
  const cuentaEfectivo = await prisma.cuentaBancaria.create({
    data: { organizacionId: orgTitan.id, banco: 'Efectivo', numeroCuenta: 'Efectivo del gimnasio', tipoCuenta: 'EFECTIVO' }
  });

  const planMensualTitan = await prisma.plan.create({
    data: { organizacionId: orgTitan.id, nombre: 'Mensual Musculación', tipoPlan: TipoPlan.TIEMPO, duracionDias: 30, precio: 300.00 }
  });

  const clienteTitan = await prisma.cliente.create({
    data: {
      organizacionId: orgTitan.id, sucursalBaseId: sucursalTitan.id, nombre: 'Juan Perez (Titan)', correo: 'juan.titan@ejemplo.com',
      telefono: '70000001', tipoDocumento: 'CI', numeroDocumento: '1234567', genero: Genero.MASCULINO,
    }
  });

  // Hoy en la hora de La Paz (zona horaria por defecto de la organización),
  // como fecha sola: las membresías guardan fechaInicio/fechaFin como @db.Date.
  const ahoraLaPaz = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const hoy = new Date(Date.UTC(ahoraLaPaz.getUTCFullYear(), ahoraLaPaz.getUTCMonth(), ahoraLaPaz.getUTCDate()));
  const venceEl = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

  const aperturaTitan = await prisma.aperturaCaja.create({
    data: { organizacionId: orgTitan.id, cajaId: cajaTitan.id, usuarioId: recepcionistaUser.id, montoInicial: 100.00 }
  });

  const membresiaTitan = await prisma.membresia.create({
    data: {
      organizacionId: orgTitan.id, sucursalId: sucursalTitan.id, clienteId: clienteTitan.id, planId: planMensualTitan.id,
      montoBase: 300.00, descuentoAplicado: 0.00, montoFinal: 300.00,
      fechaInicio: hoy, fechaFin: venceEl, estado: EstadoMembresia.ACTIVA, pagada: true, creadoPorId: recepcionistaUser.id,
    }
  });

  const transaccionTitan = await prisma.transaccion.create({
    data: { organizacionId: orgTitan.id, sucursalId: sucursalTitan.id, aperturaCajaId: aperturaTitan.id, clienteId: clienteTitan.id, tipo: TipoTransaccion.INGRESO, montoTotal: 300.00, creadoPorId: recepcionistaUser.id }
  });

  await prisma.pago.create({
    data: { organizacionId: orgTitan.id, transaccionId: transaccionTitan.id, metodoPago: MetodoPago.EFECTIVO, monto: 300.00, cuentaBancariaId: cuentaEfectivo.id }
  });

  await prisma.detalleTransaccion.create({
    data: { organizacionId: orgTitan.id, transaccionId: transaccionTitan.id, tipoConcepto: TipoConceptoVenta.MEMBRESIA, membresiaId: membresiaTitan.id, precioUnitario: 300.00, subtotal: 300.00, cantidad: 1 }
  });

  // Ana cierra su turno: 100 de apertura + 300 cobrados en efectivo.
  await prisma.aperturaCaja.update({
    where: { id: aperturaTitan.id },
    data: { estado: EstadoAperturaCaja.CERRADA, fechaCierre: new Date(), montoCierreEsperado: 400.00, montoCierreReal: 400.00 }
  });

  // =======================================================
  // 6. PORTAL DEL CLIENTE (docs/plan-portal-cliente.md)
  // =======================================================
  // Juan entra a su portal con el correo de su ficha (juan123), como si
  // recepción le hubiera dado acceso desde la ficha.
  const juanUser = await prisma.usuario.create({
    data: { nombreCompleto: clienteTitan.nombre, correo: 'juan.titan@ejemplo.com', telefono: '70000001', contrasenaHash: hashPassword('juan123') }
  });
  await prisma.asignacionAcceso.create({
    data: { usuarioId: juanUser.id, organizacionId: orgTitan.id, rolId: roles.CLIENTE, sucursalId: null }
  });
  await prisma.cliente.update({ where: { id: clienteTitan.id }, data: { usuarioId: juanUser.id } });

  console.log('✅ Base de datos sembrada correctamente con Permisos y 5 Roles base.');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
