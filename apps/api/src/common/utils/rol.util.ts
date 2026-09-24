import { BadRequestException } from '@nestjs/common';

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
