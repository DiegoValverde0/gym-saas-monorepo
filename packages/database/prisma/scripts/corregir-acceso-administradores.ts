/**
 * Da acceso a TODAS las sucursales a los administradores de gimnasio
 * (rol ADMIN_GYM) que quedaron limitados a una sola sucursal.
 *
 * El bug: OrganizacionService.crearOrganizacionConAdmin creaba la asignación
 * del dueño con `sucursalId` = la sede inicial ("Sede Central"), así que toda
 * organización creada desde la plataforma nacía con un administrador que no
 * veía sus otras sucursales. Ya está corregido para las organizaciones nuevas;
 * este script arregla las existentes. Es una corrección de datos, no de
 * estructura: solo pone `sucursalId = null` en esas asignaciones.
 *
 * Se saltan (y se informan) los administradores que ya tienen otra asignación
 * con acceso a todas las sucursales en la misma organización: no hace falta
 * tocar nada.
 *
 * Uso (desde packages/database):
 *   pnpm db:corregir-acceso-administradores             -> solo muestra qué cambiaría
 *   pnpm db:corregir-acceso-administradores --aplicar   -> aplica los cambios
 *   ... --org=<organizacionId>                          -> limita a una organización
 *
 * El acceso de cada usuario se guarda en caché (Redis) hasta 15 minutos: el
 * cambio se nota como mucho 15 minutos después, sin cerrar sesión.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const orgArg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);

  const limitadas = await prisma.asignacionAcceso.findMany({
    where: {
      organizacionId: orgArg ? orgArg : { not: null },
      sucursalId: { not: null },
      rol: { nombre: 'ADMIN_GYM', organizacionId: null },
      usuario: { deletedAt: null },
    },
    include: {
      usuario: { select: { correo: true } },
      organizacion: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
    },
  });

  const aCorregir: { id: string; descripcion: string }[] = [];
  const saltadas: string[] = [];

  for (const a of limitadas) {
    const descripcion = `${a.organizacion?.nombre} · ${a.usuario.correo} (hoy: solo ${a.sucursal?.nombre})`;
    const yaTieneTodas = await prisma.asignacionAcceso.count({
      where: { usuarioId: a.usuarioId, organizacionId: a.organizacionId, sucursalId: null, id: { not: a.id } },
    });
    if (yaTieneTodas > 0) saltadas.push(`${descripcion}: ya tiene otra asignación con todas las sucursales`);
    else aCorregir.push({ id: a.id, descripcion });
  }

  console.log(`Administradores limitados a una sucursal: ${limitadas.length}`);
  for (const c of aCorregir) console.log(`  - ${c.descripcion} -> todas las sucursales`);
  if (saltadas.length > 0) {
    console.log(`\nSe saltan ${saltadas.length}:`);
    for (const s of saltadas) console.log(`  - ${s}`);
  }

  if (aCorregir.length === 0) {
    console.log('\nNo hay nada que corregir.');
    return;
  }
  if (!aplicar) {
    console.log('\nNo se modificó nada. Ejecuta con --aplicar para corregir.');
    return;
  }

  await prisma.asignacionAcceso.updateMany({
    where: { id: { in: aCorregir.map((c) => c.id) } },
    data: { sucursalId: null },
  });
  console.log(`\nCorregidos ${aCorregir.length}. El cambio se nota en su siguiente acción (como mucho 15 minutos, por la caché).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
