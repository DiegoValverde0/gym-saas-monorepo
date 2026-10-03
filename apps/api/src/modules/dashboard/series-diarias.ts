import { Prisma } from '@prisma/client';
import { ZONA_HORARIA_DEFAULT } from '../../common/utils/zona-horaria.util';

// Sumas por día local para los indicadores del Inicio (docs/plan-inicio.md,
// fase 1), agrupadas en la base: traer miles de filas para sumarlas en la API
// tardaba más de 1,5 s con un gimnasio grande. Es SQL directo ($queryRaw no
// pasa por los filtros automáticos de la extensión RLS), así que cada consulta
// filtra organizacion_id, deleted_at y la sucursal a mano.

interface ConsultaCruda {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

interface FiltroSerie {
  organizacionId: string;
  sucursalId?: string;
  zona: string | null;
  desde: Date;
  hasta: Date;
}

const sucursal = (columna: string, sucursalId?: string) => (sucursalId ? Prisma.sql` AND ${Prisma.raw(columna)} = ${sucursalId}::uuid` : Prisma.empty);

/** Ingresos por día local ('AAAA-MM-DD' → monto). */
export async function ventasPorDia(db: ConsultaCruda, f: FiltroSerie): Promise<Map<string, number>> {
  const zona = f.zona || ZONA_HORARIA_DEFAULT;
  const filas = await db.$queryRaw<{ dia: string; total: number }[]>(Prisma.sql`
    SELECT to_char((t.fecha_hora AT TIME ZONE ${zona})::date, 'YYYY-MM-DD') AS dia, SUM(t.monto_total)::float8 AS total
    FROM transacciones t
    WHERE t.organizacion_id = ${f.organizacionId}::uuid AND t.deleted_at IS NULL AND t.tipo = 'INGRESO'
      AND t.fecha_hora >= ${f.desde} AND t.fecha_hora < ${f.hasta}${sucursal('t.sucursal_id', f.sucursalId)}
    GROUP BY 1`);
  return new Map(filas.map((x) => [x.dia, Number(x.total)]));
}

/**
 * Asistencias por día local: el total y las que entraron antes de
 * `minutosDelDia` (para comparar hoy "a esta hora" con otros días).
 */
export async function asistenciasPorDia(db: ConsultaCruda, f: FiltroSerie & { minutosDelDia: number }): Promise<Map<string, { total: number; hastaLaHora: number }>> {
  const zona = f.zona || ZONA_HORARIA_DEFAULT;
  const filas = await db.$queryRaw<{ dia: string; total: number; hasta: number }[]>(Prisma.sql`
    SELECT to_char(l.local::date, 'YYYY-MM-DD') AS dia, count(*)::int AS total,
           count(*) FILTER (WHERE EXTRACT(HOUR FROM l.local) * 60 + EXTRACT(MINUTE FROM l.local) < ${f.minutosDelDia})::int AS hasta
    FROM (
      SELECT ra.fecha_hora_ingreso AT TIME ZONE ${zona} AS local
      FROM registros_asistencia ra
      WHERE ra.organizacion_id = ${f.organizacionId}::uuid AND ra.deleted_at IS NULL
        AND ra.fecha_hora_ingreso >= ${f.desde} AND ra.fecha_hora_ingreso < ${f.hasta}${sucursal('ra.sucursal_id', f.sucursalId)}
    ) l
    GROUP BY 1`);
  return new Map(filas.map((x) => [x.dia, { total: Number(x.total), hastaLaHora: Number(x.hasta) }]));
}
