import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Los roles base son globales (organizacionId null) y la extensión RLS los deja
// ver a cualquier tenant para que pueda asignarlos. SUPERADMIN es la
// excepción: es el rol de la cuenta de plataforma y nunca debe asignarse dentro
// de una organización. No es una escalada real (los endpoints de plataforma
// exigen además is_superadmin), pero dejaba a un empleado con un perfil sin
// sentido (lectura de todo + restaurar) y sería un agujero en cuanto algún
// endpoint confiara solo en los permisos del rol.
export const ROL_PLATAFORMA = 'SUPERADMIN';

export function assertRolAsignableEnOrganizacion(rol: { nombre: string; organizacionId: string | null } | null) {
  if (!rol) throw new BadRequestException('El rol especificado no existe en tu organización.');
  if (rol.organizacionId === null && rol.nombre === ROL_PLATAFORMA) {
    throw new BadRequestException('El rol SUPERADMIN es exclusivo de la plataforma y no se puede asignar dentro de una organización.');
  }
}

// Rol del dueño/administrador de un gimnasio (rol base global).
export const ROL_ADMINISTRADOR = 'ADMIN_GYM';

// Rol de las cuentas del portal del cliente (rol base global, sin permisos:
// esas cuentas solo usan las rutas /portal, ver JwtAuthGuard). Un gimnasio
// puede crear un rol propio llamado igual, por eso se mira también que sea global.
export const ROL_CLIENTE = 'CLIENTE';
export const esRolCliente = (rol: { nombre: string; organizacionId: string | null }) =>
  rol.organizacionId === null && rol.nombre === ROL_CLIENTE;

type AsignacionConRol = { id: string; sucursalId: string | null; rol: { nombre: string; organizacionId: string | null } };

// ¿Esta asignación es la de un administrador con acceso a todas las sucursales?
export function esAdministradorGeneral(asignacion: AsignacionConRol) {
  return asignacion.sucursalId === null && asignacion.rol.organizacionId === null && asignacion.rol.nombre === ROL_ADMINISTRADOR;
}

/**
 * Impide que un gimnasio se quede sin ningún administrador con acceso a todas
 * las sucursales (nadie podría volver a gestionar el equipo completo). Se
 * llama antes de cambiar o quitar la asignación `actual`: si hoy es la de un
 * administrador general, tiene que existir otro vigente (cuenta no eliminada
 * y no dado de baja del equipo).
 */
export async function assertQuedaOtroAdministrador(
  tx: Prisma.TransactionClient,
  actual: AsignacionConRol & { organizacionId: string | null },
) {
  if (!esAdministradorGeneral(actual)) return;
  const otros = await tx.asignacionAcceso.count({
    where: {
      id: { not: actual.id },
      organizacionId: actual.organizacionId,
      sucursalId: null,
      rol: { nombre: ROL_ADMINISTRADOR, organizacionId: null },
      usuario: {
        deletedAt: null,
        NOT: { perfilStaff: { is: { organizacionId: actual.organizacionId ?? undefined, deletedAt: { not: null } } } },
      },
    },
  });
  if (otros === 0) {
    throw new BadRequestException(
      'Tiene que quedar al menos un administrador con acceso a todas las sucursales. Primero da ese acceso a otra persona.',
    );
  }
}
