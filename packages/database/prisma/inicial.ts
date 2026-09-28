import { PrismaClient } from '@prisma/client';
import { asegurarSuperadmin, sembrarPermisosYRoles } from './base';

// Carga inicial de PRODUCCIÓN (pnpm db:inicial). A diferencia del seed de
// desarrollo, no borra nada ni crea datos de ejemplo: solo los permisos, los
// 5 roles base y, si todavía no hay ninguno, el superadmin de plataforma con
// los datos de las variables de entorno. Se puede ejecutar en cada despliegue.
//
//   SUPERADMIN_CORREO, SUPERADMIN_CONTRASENA (12 caracteres o más), SUPERADMIN_NOMBRE (opcional)

const prisma = new PrismaClient();

async function main() {
  const roles = await sembrarPermisosYRoles(prisma);
  console.log('Permisos y roles base listos.');

  const correo = process.env.SUPERADMIN_CORREO?.trim();
  const contrasena = process.env.SUPERADMIN_CONTRASENA ?? '';
  const hay = await prisma.usuario.count({ where: { isSuperAdmin: true } });
  if (hay > 0) {
    console.log('Ya existe un superadmin: no se cambia.');
    return;
  }
  if (!correo || !correo.includes('@')) throw new Error('Falta SUPERADMIN_CORREO para crear el superadmin.');
  if (contrasena.length < 12) throw new Error('SUPERADMIN_CONTRASENA debe tener al menos 12 caracteres.');

  await asegurarSuperadmin(prisma, roles.SUPERADMIN, {
    nombreCompleto: process.env.SUPERADMIN_NOMBRE?.trim() || 'Administrador de la plataforma',
    correo,
    contrasena,
  });
  console.log(`Superadmin creado: ${correo}.`);
}

main()
  .catch((e) => {
    console.error('Error en la carga inicial:', (e as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
