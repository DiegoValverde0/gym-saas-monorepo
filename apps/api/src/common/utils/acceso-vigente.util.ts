import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisClientType } from 'redis';
import { formatPermiso } from './permiso.util';

// Acceso vigente de un usuario en una organización: rol, sucursal y permisos
// leídos de su AsignacionAcceso actual. El token de sesión solo identifica a
// la persona y su organización; todo lo demás sale de acá en cada petición,
// así un cambio de acceso aplica en la siguiente acción sin cerrar sesión
// (antes la sucursal y el rol viajaban en el JWT y quedaban congelados hasta
// el siguiente login -- ver plan de simplificación, 13.2).
export interface AccesoVigente {
  rolNombre: string;
  sucursalId: string | null; // null = todas las sucursales
  sucursalNombre: string | null;
  organizacionNombre: string | null;
  permisos: string[];
}

// Misma clave que usaban antes solo los permisos: todo el código que ya la
// invalida al cambiar un acceso (Equipo, Usuarios, Roles) sigue sirviendo.
export const claveAccesoVigente = (usuarioId: string, organizacionId: string | null | undefined) =>
  `rbac:${usuarioId}:${organizacionId ?? 'global'}`;

const TTL_SEGUNDOS = 900;

function esAccesoVigente(valor: unknown): valor is AccesoVigente {
  // Antes la clave guardaba solo el array de permisos: se trata como caché vacía.
  return !!valor && typeof valor === 'object' && !Array.isArray(valor) && Array.isArray((valor as AccesoVigente).permisos);
}

/**
 * Devuelve el acceso vigente, o null si la persona ya no tiene acceso a esa
 * organización (asignación borrada, cuenta eliminada o dada de baja del equipo).
 * `organizacionId` null = asignación global (superadmin de plataforma).
 *
 * Usa el cliente crudo a propósito: se llama desde los guards, antes de que
 * el contexto del tenant (CLS) esté listo para la extensión RLS.
 */
export async function obtenerAccesoVigente(
  prisma: PrismaClient,
  redis: RedisClientType,
  usuarioId: string,
  organizacionId: string | null,
): Promise<AccesoVigente | null> {
  const clave = claveAccesoVigente(usuarioId, organizacionId);
  try {
    const guardado = await redis.get(clave);
    if (guardado) {
      const valor: unknown = JSON.parse(guardado);
      if (esAccesoVigente(valor)) return valor;
    }
  } catch (err: unknown) {
    // Sin Redis se sigue leyendo de la base: más lento, pero correcto.
    console.error('[AccesoVigente] Fallo al leer la caché:', (err as Error).message);
  }

  const asignacion = await prisma.asignacionAcceso.findFirst({
    where: { usuarioId, organizacionId, usuario: { deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    include: {
      usuario: { select: { perfilStaff: { select: { organizacionId: true, deletedAt: true } } } },
      sucursal: { select: { nombre: true } },
      organizacion: { select: { nombre: true } },
      rol: { include: { rolPermisos: { include: { permiso: true } } } },
    },
  });

  if (!asignacion?.rol) return null;

  // Dar de baja a alguien del equipo borra (soft delete) su perfil de staff:
  // desde ese momento no entra más a esta organización. Restaurar el perfil
  // le devuelve el acceso tal como estaba.
  const perfil = asignacion.usuario.perfilStaff;
  if (organizacionId && perfil?.organizacionId === organizacionId && perfil.deletedAt) return null;

  const acceso: AccesoVigente = {
    rolNombre: asignacion.rol.nombre,
    sucursalId: asignacion.sucursalId,
    sucursalNombre: asignacion.sucursal?.nombre ?? null,
    organizacionNombre: asignacion.organizacion?.nombre ?? null,
    permisos: asignacion.rol.rolPermisos.map((rp) => formatPermiso(rp.permiso.modulo, rp.permiso.accion)),
  };

  try {
    await redis.setEx(clave, TTL_SEGUNDOS, JSON.stringify(acceso));
  } catch (err: unknown) {
    console.error('[AccesoVigente] Fallo al guardar la caché:', (err as Error).message);
  }
  return acceso;
}

export async function invalidarAccesoVigente(redis: RedisClientType, usuarioId: string, organizacionId: string | null | undefined) {
  await redis.del(claveAccesoVigente(usuarioId, organizacionId));
}

/**
 * Un usuario limitado a una sucursal solo puede dar acceso a esa sucursal: ni
 * a otra ni a "todas" (se ampliaría a sí mismo el alcance por la puerta de
 * atrás). Devuelve la sucursal tal cual si es válida; undefined = no se toca.
 */
export async function assertSucursalAsignable(
  prisma: PrismaService,
  cls: ClsService,
  sucursalId: string | null | undefined,
): Promise<string | null | undefined> {
  const miSucursalId: string | undefined = cls.get('sucursalId');
  if (!miSucursalId || sucursalId === undefined || sucursalId === miSucursalId) return sucursalId;
  const mia = await prisma.extendedClient.sucursal.findUnique({ where: { id: miSucursalId }, select: { nombre: true } });
  throw new ForbiddenException(
    `Tu acceso está limitado a ${mia?.nombre ?? 'una sucursal'}, así que solo puedes dar acceso a esa sucursal.`,
  );
}
