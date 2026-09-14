import { PrismaClient, EstadoOrganizacion, MetodoPago, TipoConceptoVenta, TipoTransaccion, TipoPlan, Genero } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('🌱 Iniciando la siembra de datos (Seed)...');

  // Limpiar la base de datos
  console.log('🧹 Limpiando datos existentes...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "organizaciones" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "usuarios" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "permisos" CASCADE;`);
  
  // =======================================================
  // 1. GENERACIÓN DINÁMICA DE PERMISOS
  // =======================================================
  console.log('🛡️ Generando matriz de permisos...');
  
  const modulos = [
    'organizaciones',
    'sucursales',
    'cajas_registradoras',
    'usuarios',
    'roles',
    'disciplinas',
    'staff',
    'turnos',
    'clases',
    'reservas',
    'clientes',
    'promociones',
    'planes',
    'membresias',
    'asistencias',
    'cuentas_bancarias',
    'aperturas_caja',
    'transacciones',
    'pagos'
  ];

  const acciones = ['crear', 'leer', 'actualizar', 'eliminar'];
  
  const permisosInsertados = [];

  for (const modulo of modulos) {
    for (const accion of acciones) {
      const permiso = await prisma.permiso.create({
        data: {
          modulo,
          accion,
          descripcion: `Permite ${accion} en el módulo de ${modulo}`,
        }
      });
      permisosInsertados.push(permiso);
    }
  }
  
  // Permiso especial fuera de la matriz modulo x accion: activar/suspender una
  // organización es la única escritura de plataforma que puede hacer el superadmin
  // sobre una organización ya existente (ver Auditoria_Claude.md, sección superadmin).
  const permisoSuspenderOrg = await prisma.permiso.create({
    data: {
      modulo: 'organizaciones',
      accion: 'suspender',
      descripcion: 'Permite activar/suspender una organización existente (no editar ni borrar sus datos)',
    }
  });
  permisosInsertados.push(permisoSuspenderOrg);

  // Permisos especiales de asistencias, fuera de la matriz modulo x accion:
  // reemplazan un chequeo que antes estaba hardcodeado a un nombre de rol
  // ("RECEPCIONISTA") en asistencia.service.ts. Por defecto TODOS quedan
  // limitados a 1 ingreso/día y sin poder forzar un ingreso que falló una
  // validación; estos permisos son la excepción explícita.
  const permisoAsistenciaMultiplePorDia = await prisma.permiso.create({
    data: {
      modulo: 'asistencias',
      accion: 'multiple_por_dia',
      descripcion: 'Permite registrar más de un ingreso del mismo cliente en el mismo día',
    }
  });
  const permisoAsistenciaForzar = await prisma.permiso.create({
    data: {
      modulo: 'asistencias',
      accion: 'forzar',
      descripcion: 'Permite forzar un ingreso que no pasó las validaciones normales (membresía, horario, etc.)',
    }
  });
  permisosInsertados.push(permisoAsistenciaMultiplePorDia, permisoAsistenciaForzar);

  // Helpers para buscar permisos por acción
  const getPermisosIds = (condicion: (p: any) => boolean) => permisosInsertados.filter(condicion).map(p => ({ permisoId: p.id }));

  // SUPERADMIN: solo visibilidad global (lectura de todo módulo, incluida
  // auditoría) + crear organizaciones con su admin inicial + suspender/reactivar
  // una organización existente. Nunca crear/actualizar/eliminar datos internos
  // de ningún tenant -- eso lo hace cada organización sobre lo suyo.
  //
  // Única excepción: 'roles:actualizar' -- los 5 roles base (este mismo
  // incluido) son globales (organizacionId null) y compartidos por todos los
  // tenants, así que solo el superadmin puede ajustar qué puede hacer cada
  // uno. rol.service.ts#update() impone en el propio código, no solo por
  // este permiso, que ese poder se limite a roles globales: un rol propio de
  // una organización sigue totalmente fuera del alcance del superadmin.
  const permisosSuperAdmin = [
    ...getPermisosIds((p) => p.accion === 'leer'),
    ...getPermisosIds((p) => p.modulo === 'organizaciones' && p.accion === 'crear'),
    ...getPermisosIds((p) => p.modulo === 'roles' && p.accion === 'actualizar'),
    { permisoId: permisoSuspenderOrg.id },
  ];

  // Todo lo interno de su tenant, más "actualizar" su propia organización
  // (PUT /organizaciones/me/info) -- nunca leer el listado global, ni
  // crear/suspender/reactivar organizaciones (eso es solo de plataforma/superadmin).
  const permisosAdminGym = getPermisosIds((p) => p.modulo !== 'organizaciones' || p.accion === 'actualizar');
  
  const permisosEntrenador = getPermisosIds((p) => 
    (p.modulo === 'clientes' && p.accion === 'leer') ||
    (p.modulo === 'asistencias' && p.accion === 'leer') ||
    (p.modulo === 'clases') ||
    (p.modulo === 'disciplinas' && p.accion === 'leer')
  );

  const permisosRecepcionista = getPermisosIds((p) => 
    (p.modulo === 'cajas_registradoras' && p.accion === 'leer') ||
    (p.modulo === 'clientes' && ['crear', 'leer', 'actualizar'].includes(p.accion)) ||
    (p.modulo === 'membresias' && ['crear', 'leer', 'actualizar'].includes(p.accion)) ||
    (p.modulo === 'asistencias' && ['crear', 'leer'].includes(p.accion)) ||
    (p.modulo === 'aperturas_caja' && ['crear', 'leer'].includes(p.accion)) ||
    (p.modulo === 'transacciones' && ['crear', 'leer'].includes(p.accion)) ||
    (p.modulo === 'pagos' && ['crear', 'leer'].includes(p.accion)) ||
    (p.modulo === 'planes' && p.accion === 'leer') ||
    (p.modulo === 'promociones' && p.accion === 'leer') ||
    (p.modulo === 'clases' && p.accion === 'leer') ||
    (p.modulo === 'cuentas_bancarias' && p.accion === 'leer') ||
    (p.modulo === 'disciplinas' && p.accion === 'leer') ||
    (p.modulo === 'reservas' && p.accion === 'leer') ||
    (p.modulo === 'turnos' && p.accion === 'leer') ||
    (p.modulo === 'sucursales' && p.accion === 'leer')
  );
  
  const permisosCliente = getPermisosIds((p) => 
    (p.modulo === 'reservas' && ['crear', 'leer', 'eliminar'].includes(p.accion)) ||
    (p.modulo === 'membresias' && p.accion === 'leer')
  );

  // =======================================================
  // 2. CREACIÓN DE USUARIO SUPERADMIN
  // =======================================================
  console.log('👤 Creando usuario SuperAdmin global...');
  const admin = await prisma.usuario.create({
    data: {
      nombreCompleto: 'Super Admin',
      correo: 'admin@gymmanager.com',
      contrasenaHash: hashPassword('admin123'),
      telefono: '12345678',
      isSuperAdmin: true,
    },
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

  // =======================================================
  // 4. CREACIÓN DE ROLES PARA LA ORGANIZACIÓN
  // =======================================================
  console.log('🔑 Creando 5 roles principales...');
  
  // 4.1 SUPERADMIN (Solo debe existir 1 a nivel sistema, lo asociaremos a la org principal por estructura, o lo dejamos como rol global abstracto)
  const rolSuperAdmin = await prisma.rol.create({
    data: {
      nombre: 'SUPERADMIN',
      descripcion: 'Acceso total y absoluto al sistema',
      esSistema: true,
      rolPermisos: { create: permisosSuperAdmin }
    }
  });

  // 4.2 ADMIN_GYM
  const rolAdminGym = await prisma.rol.create({
    data: {
      nombre: 'ADMIN_GYM',
      descripcion: 'Administrador del Gimnasio (Dueño)',
      esSistema: true,
      rolPermisos: { create: permisosAdminGym }
    }
  });

  // 4.3 ENTRENADOR
  const rolEntrenador = await prisma.rol.create({
    data: {
      nombre: 'ENTRENADOR',
      descripcion: 'Gestión de clases y lectura de asistencias',
      esSistema: true,
      rolPermisos: { create: permisosEntrenador }
    }
  });

  // 4.4 RECEPCIONISTA (Cajero)
  const rolRecepcionista = await prisma.rol.create({
    data: {
      nombre: 'RECEPCIONISTA',
      descripcion: 'Ventas, membresías y atención al cliente',
      esSistema: true,
      rolPermisos: { create: permisosRecepcionista }
    }
  });

  // 4.5 CLIENTE
  const rolCliente = await prisma.rol.create({
    data: {
      nombre: 'CLIENTE',
      descripcion: 'App Móvil - Ver reservas y membresías',
      esSistema: true,
      rolPermisos: { create: permisosCliente }
    }
  });

  // Asignar el SuperAdmin como GLOBAL (Sin organización ni sucursal)
  await prisma.asignacionAcceso.create({
    data: {
      usuarioId: admin.id,
      organizacionId: null,
      rolId: rolSuperAdmin.id,
      sucursalId: null,
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
      rolId: rolAdminGym.id,
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
      rolId: rolRecepcionista.id,
      sucursalId: sucursalTitan.id,
    }
  });

  // =======================================================
  // 5. FLUJO BÁSICO (CAJA, PLAN, CLIENTE, VENTA)
  // =======================================================
  const cajaTitan = await prisma.cajaRegistradora.create({
    data: { organizacionId: orgTitan.id, sucursalId: sucursalTitan.id, nombre: 'Caja Recepción Central' }
  });

  const planMensualTitan = await prisma.plan.create({
    data: { organizacionId: orgTitan.id, nombre: 'Mensual Musculación', tipoPlan: TipoPlan.TIEMPO, duracionDias: 30, precio: 300.00 }
  });

  const clienteTitan = await prisma.cliente.create({
    data: { organizacionId: orgTitan.id, sucursalBaseId: sucursalTitan.id, nombre: 'Juan Perez (Titan)', correo: 'juan.titan@ejemplo.com', genero: Genero.MASCULINO }
  });

  const aperturaTitan = await prisma.aperturaCaja.create({
    data: { organizacionId: orgTitan.id, cajaId: cajaTitan.id, usuarioId: admin.id, montoInicial: 100.00 }
  });

  const membresiaTitan = await prisma.membresia.create({
    data: {
      organizacionId: orgTitan.id, clienteId: clienteTitan.id, planId: planMensualTitan.id,
      montoBase: 300.00, descuentoAplicado: 0.00, montoFinal: 300.00, fechaInicio: new Date()
    }
  });

  const transaccionTitan = await prisma.transaccion.create({
    data: { organizacionId: orgTitan.id, sucursalId: sucursalTitan.id, aperturaCajaId: aperturaTitan.id, clienteId: clienteTitan.id, tipo: TipoTransaccion.INGRESO, montoTotal: 300.00, creadoPorId: admin.id }
  });

  await prisma.pago.create({
    data: { organizacionId: orgTitan.id, transaccionId: transaccionTitan.id, metodoPago: MetodoPago.EFECTIVO, monto: 300.00 }
  });

  await prisma.detalleTransaccion.create({
    data: { organizacionId: orgTitan.id, transaccionId: transaccionTitan.id, tipoConcepto: TipoConceptoVenta.MEMBRESIA, membresiaId: membresiaTitan.id, precioUnitario: 300.00, subtotal: 300.00, cantidad: 1 }
  });

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
