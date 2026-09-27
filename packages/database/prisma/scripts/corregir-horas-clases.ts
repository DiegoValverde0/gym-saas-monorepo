/**
 * Corrige la hora de las clases generadas desde plantillas ANTES del arreglo
 * de zona horaria (ClasePlantillaService.generarParaOrganizacion).
 *
 * El bug: la hora "de reloj" de la plantilla (ej. 08:00) se guardaba como si
 * fuera UTC (08:00Z), así que en La Paz (UTC-4) la clase quedaba a las 04:00.
 * Esas clases tienen una firma inconfundible: la hora UTC de `fechaHora` es
 * exactamente la `horaInicio` de su plantilla. La corrección toma esa misma
 * fecha y la convierte de hora local de la organización a UTC real.
 *
 * Se saltan (y se informan):
 *  - Clases cuya hora ya no coincide con la plantilla (editadas a mano, o la
 *    plantilla cambió de hora después): no hay forma segura de saber la hora
 *    correcta.
 *  - Clases cuya hora corregida chocaría con otra clase ya existente de la
 *    misma plantilla (generada después del arreglo): hay que decidir a mano
 *    cuál queda.
 *
 * Uso (desde packages/database):
 *   pnpm db:corregir-horas-clases                 -> solo muestra qué cambiaría
 *   pnpm db:corregir-horas-clases --aplicar       -> aplica los cambios
 *   ... --org=<organizacionId>                    -> limita a una organización
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ZONA_HORARIA_DEFAULT = 'America/La_Paz';

// --- Conversión de zona horaria (misma lógica que apps/api/src/common/utils/zona-horaria.util.ts)
function formato(zona: string) {
  const opciones: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { ...opciones, timeZone: zona });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...opciones, timeZone: ZONA_HORARIA_DEFAULT });
  }
}

function aHoraLocal(instante: Date, zona: string) {
  const p = Object.fromEntries(formato(zona).formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    fechaSolo: new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))),
    minutosDelDia: Number(p.hour) * 60 + Number(p.minute),
  };
}

function desdeHoraLocal(fechaSolo: Date, minutosDelDia: number, zona: string) {
  const objetivo = fechaSolo.getTime() + minutosDelDia * 60_000;
  let instante = objetivo;
  for (let i = 0; i < 2; i++) {
    const local = aHoraLocal(new Date(instante), zona);
    instante += objetivo - (local.fechaSolo.getTime() + local.minutosDelDia * 60_000);
  }
  return new Date(instante);
}

const minutosUTC = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const orgArg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);

  const clases = await prisma.claseProgramada.findMany({
    where: { clasePlantillaId: { not: null }, deletedAt: null, ...(orgArg ? { organizacionId: orgArg } : {}) },
    include: {
      clasePlantilla: { select: { horaInicio: true, nombreClase: true } },
      organizacion: { select: { nombre: true, zonaHoraria: true } },
      _count: { select: { reservas: true } },
    },
    orderBy: { fechaHora: 'asc' },
  });

  const aCorregir: { id: string; nueva: Date; descripcion: string }[] = [];
  const saltadas: string[] = [];
  const ahora = new Date();

  for (const c of clases) {
    if (!c.clasePlantilla) continue;
    const zona = c.organizacion.zonaHoraria || ZONA_HORARIA_DEFAULT;
    const minutosPlantilla = minutosUTC(c.clasePlantilla.horaInicio);
    const localActual = aHoraLocal(c.fechaHora, zona);

    // Ya está bien (o la organización está en UTC): nada que hacer.
    if (localActual.minutosDelDia === minutosPlantilla) continue;

    // Sin la firma del bug no sabemos cuál es la hora correcta.
    if (minutosUTC(c.fechaHora) !== minutosPlantilla) {
      saltadas.push(`  - ${c.organizacion.nombre} · ${c.nombreClase} · ${c.fechaHora.toISOString()}: la hora no coincide con la plantilla (${hhmm(minutosPlantilla)}), posiblemente editada a mano.`);
      continue;
    }

    // El bug usaba la fecha UTC como la fecha local deseada.
    const fechaDeseada = new Date(Date.UTC(c.fechaHora.getUTCFullYear(), c.fechaHora.getUTCMonth(), c.fechaHora.getUTCDate()));
    const nueva = desdeHoraLocal(fechaDeseada, minutosPlantilla, zona);

    const duplicada = await prisma.claseProgramada.findFirst({
      where: { clasePlantillaId: c.clasePlantillaId, fechaHora: nueva, deletedAt: null, id: { not: c.id } },
      select: { id: true },
    });
    if (duplicada) {
      saltadas.push(`  - ${c.organizacion.nombre} · ${c.nombreClase} · ${fechaDeseada.toISOString().slice(0, 10)}: ya existe otra clase de la misma plantilla a la hora correcta (${duplicada.id}). Revisar a mano.`);
      continue;
    }

    const cuando = c.fechaHora < ahora ? 'pasada' : 'futura';
    const reservas = c._count.reservas > 0 ? `, ${c._count.reservas} reserva(s)` : '';
    aCorregir.push({
      id: c.id,
      nueva,
      descripcion: `  - ${c.organizacion.nombre} · ${c.nombreClase} · ${fechaDeseada.toISOString().slice(0, 10)}: ${hhmm(localActual.minutosDelDia)} -> ${hhmm(minutosPlantilla)} (${zona}, ${cuando}${reservas})`,
    });
  }

  console.log(`Clases generadas desde plantillas revisadas: ${clases.length}`);
  console.log(`\nA corregir: ${aCorregir.length}`);
  aCorregir.forEach((c) => console.log(c.descripcion));
  if (saltadas.length) {
    console.log(`\nSaltadas (requieren revisión manual): ${saltadas.length}`);
    saltadas.forEach((s) => console.log(s));
  }

  if (!aplicar) {
    console.log('\nModo de prueba: no se cambió nada. Ejecuta con --aplicar para guardar los cambios.');
    return;
  }
  if (aCorregir.length === 0) return;

  await prisma.$transaction(aCorregir.map((c) => prisma.claseProgramada.update({ where: { id: c.id }, data: { fechaHora: c.nueva } })));
  console.log(`\nListo: ${aCorregir.length} clases corregidas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
