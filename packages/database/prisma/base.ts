import { Permiso, PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// Datos base que necesita cualquier instalación: permisos, los 5 roles base
// (globales, compartidos por todas las organizaciones) y el superadmin. Lo
// usan el seed de desarrollo (prisma/seed.ts) y la carga inicial de
// producción (prisma/inicial.ts). Se puede ejecutar varias veces: no duplica
// nada y no pisa los permisos que el superadmin haya ajustado después.

// Mismo formato que apps/api/src/common/utils/contrasena.util.ts (scrypt con sal).
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

const MODULOS = [
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
  'pagos',
  'productos',
  'inventarios',
  'dashboard',
];
const ACCIONES = ['crear', 'leer', 'actualizar', 'eliminar'];

// Permisos fuera de la matriz modulo x accion.
const PERMISOS_ESPECIALES = [
  // Activar/suspender una organización es la única escritura de plataforma que
  // puede hacer el superadmin sobre una organización ya existente.
  { modulo: 'organizaciones', accion: 'suspender', descripcion: 'Permite activar/suspender una organización existente (no editar ni borrar sus datos)' },
  // Excepciones explícitas al límite de 1 ingreso por día y a las validaciones
  // de acceso (antes estaba hardcodeado al rol "RECEPCIONISTA").
  { modulo: 'asistencias', accion: 'multiple_por_dia', descripcion: 'Permite registrar más de un ingreso del mismo cliente en el mismo día' },
  { modulo: 'asistencias', accion: 'forzar', descripcion: 'Permite forzar un ingreso que no pasó las validaciones normales (membresía, horario, etc.)' },
  { modulo: 'sistema', accion: 'restaurar', descripcion: 'Permite restaurar registros que han sido eliminados (enviados a la papelera)' },
];

type Filtro = (p: Permiso) => boolean;

// Los 5 roles base y qué permisos reciben al crearse.
const ROLES_BASE: { nombre: string; descripcion: string; permisos: Filtro }[] = [
  {
    // Solo visibilidad global + crear organizaciones con su admin inicial +
    // suspender/reactivar una organización. Única escritura sobre roles:
    // 'roles:actualizar', para ajustar los roles base (rol.service.ts lo
    // limita a los globales).
    nombre: 'SUPERADMIN',
    descripcion: 'Acceso total y absoluto al sistema',
    permisos: (p) =>
      p.accion === 'leer' ||
      (p.modulo === 'organizaciones' && ['crear', 'suspender'].includes(p.accion)) ||
      (p.modulo === 'roles' && p.accion === 'actualizar') ||
      (p.modulo === 'sistema' && p.accion === 'restaurar'),
  },
  {
    // Todo lo de su organización más "actualizar" su propia organización;
    // nunca el listado global ni crear/suspender organizaciones.
    nombre: 'ADMIN_GYM',
    descripcion: 'Administrador del Gimnasio (Dueño)',
    permisos: (p) => p.modulo !== 'organizaciones' || p.accion === 'actualizar',
  },
  {
    nombre: 'ENTRENADOR',
    descripcion: 'Gestión de clases y lectura de asistencias',
    permisos: (p) =>
      (p.modulo === 'clientes' && p.accion === 'leer') ||
      (p.modulo === 'asistencias' && p.accion === 'leer') ||
      p.modulo === 'clases' ||
      (p.modulo === 'disciplinas' && p.accion === 'leer') ||
      (p.modulo === 'turnos' && p.accion === 'leer') ||
      (p.modulo === 'reservas' && p.accion === 'leer') ||
      (p.modulo === 'dashboard' && p.accion === 'leer'),
  },
  {
    nombre: 'RECEPCIONISTA',
    descripcion: 'Ventas, membresías y atención al cliente',
    permisos: (p) =>
      (p.modulo === 'cajas_registradoras' && p.accion === 'leer') ||
      (p.modulo === 'clientes' && ['crear', 'leer', 'actualizar'].includes(p.accion)) ||
      (p.modulo === 'membresias' && ['crear', 'leer', 'actualizar'].includes(p.accion)) ||
      (p.modulo === 'asistencias' && ['crear', 'leer'].includes(p.accion)) ||
      (p.modulo === 'aperturas_caja' && ['crear', 'leer'].includes(p.accion)) ||
      (p.modulo === 'transacciones' && ['crear', 'leer'].includes(p.accion)) ||
      (p.modulo === 'pagos' && ['crear', 'leer'].includes(p.accion)) ||
      (p.modulo === 'planes' && p.accion === 'leer') ||
      (p.modulo === 'promociones' && p.accion === 'leer') ||
      (p.modulo === 'productos' && p.accion === 'leer') ||
      // Vende productos: necesita ver el stock de su sucursal.
      (p.modulo === 'inventarios' && p.accion === 'leer') ||
      (p.modulo === 'clases' && p.accion === 'leer') ||
      (p.modulo === 'cuentas_bancarias' && p.accion === 'leer') ||
      (p.modulo === 'disciplinas' && p.accion === 'leer') ||
      (p.modulo === 'reservas' && ['crear', 'leer', 'actualizar'].includes(p.accion)) ||
      (p.modulo === 'turnos' && p.accion === 'leer') ||
      (p.modulo === 'sucursales' && p.accion === 'leer') ||
      (p.modulo === 'dashboard' && p.accion === 'leer'),
  },
  {
    // Sin permisos a propósito: con reservas:leer o membresias:leer vería
    // las de todos los clientes. El portal (/portal) solo muestra lo suyo y
    // JwtAuthGuard le cierra el resto de la API.
    nombre: 'CLIENTE',
    descripcion: 'Portal del cliente: su membresía, sus asistencias y reservas de clases',
    permisos: () => false,
  },
];

export type NombreRolBase = 'SUPERADMIN' | 'ADMIN_GYM' | 'ENTRENADOR' | 'RECEPCIONISTA' | 'CLIENTE';

/** Crea los permisos y los roles base que falten. Devuelve el id de cada rol base. */
export async function sembrarPermisosYRoles(prisma: PrismaClient): Promise<Record<NombreRolBase, string>> {
  const definiciones = [
    ...MODULOS.flatMap((modulo) => ACCIONES.map((accion) => ({ modulo, accion, descripcion: `Permite ${accion} en el módulo de ${modulo}` }))),
    ...PERMISOS_ESPECIALES,
  ];
  const permisos: Permiso[] = [];
  for (const d of definiciones) {
    permisos.push(
      await prisma.permiso.upsert({
        where: { modulo_accion: { modulo: d.modulo, accion: d.accion } },
        update: {},
        create: d,
      }),
    );
  }

  const ids = {} as Record<NombreRolBase, string>;
  for (const rol of ROLES_BASE) {
    // Los roles base son globales (sin organización): la clave única
    // (organizacionId, nombre) no sirve para upsert con organizacionId nulo.
    const existente = await prisma.rol.findFirst({ where: { nombre: rol.nombre, organizacionId: null }, select: { id: true } });
    if (existente) {
      // No se tocan sus permisos: el superadmin puede haberlos ajustado.
      ids[rol.nombre as NombreRolBase] = existente.id;
      continue;
    }
    const creado = await prisma.rol.create({
      data: {
        nombre: rol.nombre,
        descripcion: rol.descripcion,
        esSistema: true,
        rolPermisos: { create: permisos.filter(rol.permisos).map((p) => ({ permisoId: p.id })) },
      },
      select: { id: true },
    });
    ids[rol.nombre as NombreRolBase] = creado.id;
  }
  return ids;
}

/**
 * Crea el superadmin de plataforma si todavía no hay ninguno. Si ya existe
 * alguno, no cambia nada (ni su contraseña). Devuelve si lo creó.
 */
export async function asegurarSuperadmin(
  prisma: PrismaClient,
  rolSuperadminId: string,
  datos: { nombreCompleto: string; correo: string; contrasena: string; telefono?: string },
): Promise<boolean> {
  const hay = await prisma.usuario.count({ where: { isSuperAdmin: true } });
  if (hay > 0) return false;
  const usuario = await prisma.usuario.create({
    data: {
      nombreCompleto: datos.nombreCompleto,
      correo: datos.correo.trim().toLowerCase(),
      contrasenaHash: hashPassword(datos.contrasena),
      telefono: datos.telefono,
      isSuperAdmin: true,
    },
  });
  await prisma.asignacionAcceso.create({
    data: { usuarioId: usuario.id, organizacionId: null, rolId: rolSuperadminId, sucursalId: null },
  });
  return true;
}
