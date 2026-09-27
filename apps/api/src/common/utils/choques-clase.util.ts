import { Prisma } from '@prisma/client';
import { aHoraLocal } from './zona-horaria.util';

// Choques de horario del instructor (plan de simplificación, 8.3): un
// instructor no puede dar dos clases que se solapan. Sin cambio de base de
// datos: se compara contra las series (ClasePlantilla) y las sesiones
// (ClaseProgramada) que ya existen.

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minutosDe = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const seSolapan = (a: number, aDur: number, b: number, bDur: number) => a < b + bDur && b < a + aDur;

type Db = Prisma.TransactionClient;

async function nombreInstructor(db: Db, entrenadorId: string) {
  const staff = await db.perfilStaff.findUnique({ where: { id: entrenadorId }, select: { usuario: { select: { nombreCompleto: true } } } });
  return staff?.usuario.nombreCompleto.split(' ')[0] ?? 'El instructor';
}

/**
 * Serie semanal: ¿el instructor ya da otra clase recurrente que se solapa en
 * alguno de esos días y horario, con vigencias que se cruzan? Devuelve el
 * mensaje ("Marta ya da Yoga los martes de 18:30 a 19:30.") o null.
 */
export async function choqueDeSerie(
  db: Db,
  datos: {
    entrenadorId?: string | null;
    diasSemana: number[];
    horaInicio: string; // "HH:MM"
    duracionMinutos?: number | null;
    vigenciaDesde: string | Date;
    vigenciaHasta?: string | Date | null;
    excluirIds?: string[];
  },
): Promise<string | null> {
  if (!datos.entrenadorId) return null;
  const inicio = Number(datos.horaInicio.slice(0, 2)) * 60 + Number(datos.horaInicio.slice(3, 5));
  const duracion = datos.duracionMinutos ?? 60;
  const desde = new Date(datos.vigenciaDesde);
  const hasta = datos.vigenciaHasta ? new Date(datos.vigenciaHasta) : null;

  const otras = await db.clasePlantilla.findMany({
    where: {
      entrenadorId: datos.entrenadorId,
      activa: true,
      diaSemana: { in: datos.diasSemana },
      ...(datos.excluirIds?.length ? { id: { notIn: datos.excluirIds } } : {}),
      ...(hasta ? { vigenciaDesde: { lte: hasta } } : {}),
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: desde } }],
    },
    select: { diaSemana: true, horaInicio: true, duracionMinutos: true, nombreClase: true },
    orderBy: { diaSemana: 'asc' },
  });
  const choque = otras.find((o) => seSolapan(inicio, duracion, minutosDe(o.horaInicio), o.duracionMinutos));
  if (!choque) return null;
  const ini = minutosDe(choque.horaInicio);
  return `${await nombreInstructor(db, datos.entrenadorId)} ya da ${choque.nombreClase} los ${DIAS_PLURAL[choque.diaSemana]} de ${hhmm(ini)} a ${hhmm(ini + choque.duracionMinutos)}.`;
}

/**
 * Sesión puntual: ¿el instructor ya tiene otra sesión activa que se solapa
 * ese día? Devuelve el mensaje o null.
 */
export async function choqueDeSesion(
  db: Db,
  datos: { entrenadorId?: string | null; fechaHora: string | Date; duracionMinutos?: number | null; excluirClaseId?: string },
  zonaHoraria: string | null | undefined,
): Promise<string | null> {
  if (!datos.entrenadorId) return null;
  const inicio = new Date(datos.fechaHora);
  const duracion = datos.duracionMinutos ?? 60;
  const fin = new Date(inicio.getTime() + duracion * 60_000);

  // Ninguna clase dura más de 24 h: basta con mirar las que empiezan en ese rango.
  const candidatas = await db.claseProgramada.findMany({
    where: {
      entrenadorId: datos.entrenadorId,
      estado: 'ACTIVO',
      fechaHora: { gte: new Date(inicio.getTime() - 24 * 3600_000), lt: fin },
      ...(datos.excluirClaseId ? { id: { not: datos.excluirClaseId } } : {}),
    },
    select: { fechaHora: true, duracionMinutos: true, nombreClase: true },
  });
  const choque = candidatas.find((c) => c.fechaHora.getTime() + c.duracionMinutos * 60_000 > inicio.getTime());
  if (!choque) return null;
  const local = aHoraLocal(choque.fechaHora, zonaHoraria);
  const dia = local.fechaSolo.toISOString().slice(5, 10).split('-').reverse().join('/');
  return `${await nombreInstructor(db, datos.entrenadorId)} ya da ${choque.nombreClase} el ${dia} de ${hhmm(local.minutosDelDia)} a ${hhmm(local.minutosDelDia + choque.duracionMinutos)}.`;
}

// ---------------------------------------------------------------------------
// Choques de sala (fase 6, DB-2): dos clases no pueden usar la misma sala a
// la vez, sea cual sea el instructor.
// ---------------------------------------------------------------------------

async function nombreSala(db: Db, salaId: string) {
  const sala = await db.sala.findUnique({ where: { id: salaId }, select: { nombre: true } });
  return sala?.nombre ?? 'La sala';
}

/** Serie semanal: ¿otra clase recurrente usa esa sala en esos días y horario? */
export async function choqueDeSalaSerie(
  db: Db,
  datos: {
    salaId?: string | null;
    diasSemana: number[];
    horaInicio: string; // "HH:MM"
    duracionMinutos?: number | null;
    vigenciaDesde: string | Date;
    vigenciaHasta?: string | Date | null;
    excluirIds?: string[];
  },
): Promise<string | null> {
  if (!datos.salaId) return null;
  const inicio = Number(datos.horaInicio.slice(0, 2)) * 60 + Number(datos.horaInicio.slice(3, 5));
  const duracion = datos.duracionMinutos ?? 60;
  const desde = new Date(datos.vigenciaDesde);
  const hasta = datos.vigenciaHasta ? new Date(datos.vigenciaHasta) : null;

  const otras = await db.clasePlantilla.findMany({
    where: {
      salaId: datos.salaId,
      activa: true,
      diaSemana: { in: datos.diasSemana },
      ...(datos.excluirIds?.length ? { id: { notIn: datos.excluirIds } } : {}),
      ...(hasta ? { vigenciaDesde: { lte: hasta } } : {}),
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: desde } }],
    },
    select: { diaSemana: true, horaInicio: true, duracionMinutos: true, nombreClase: true },
    orderBy: { diaSemana: 'asc' },
  });
  const choque = otras.find((o) => seSolapan(inicio, duracion, minutosDe(o.horaInicio), o.duracionMinutos));
  if (!choque) return null;
  const ini = minutosDe(choque.horaInicio);
  return `${await nombreSala(db, datos.salaId)} ya tiene ${choque.nombreClase} los ${DIAS_PLURAL[choque.diaSemana]} de ${hhmm(ini)} a ${hhmm(ini + choque.duracionMinutos)}.`;
}

/** Sesión puntual: ¿otra sesión activa usa esa sala a esa hora? */
export async function choqueDeSalaSesion(
  db: Db,
  datos: { salaId?: string | null; fechaHora: string | Date; duracionMinutos?: number | null; excluirClaseId?: string },
  zonaHoraria: string | null | undefined,
): Promise<string | null> {
  if (!datos.salaId) return null;
  const inicio = new Date(datos.fechaHora);
  const fin = new Date(inicio.getTime() + (datos.duracionMinutos ?? 60) * 60_000);
  const candidatas = await db.claseProgramada.findMany({
    where: {
      salaId: datos.salaId,
      estado: 'ACTIVO',
      fechaHora: { gte: new Date(inicio.getTime() - 24 * 3600_000), lt: fin },
      ...(datos.excluirClaseId ? { id: { not: datos.excluirClaseId } } : {}),
    },
    select: { fechaHora: true, duracionMinutos: true, nombreClase: true },
  });
  const choque = candidatas.find((c) => c.fechaHora.getTime() + c.duracionMinutos * 60_000 > inicio.getTime());
  if (!choque) return null;
  const local = aHoraLocal(choque.fechaHora, zonaHoraria);
  const dia = local.fechaSolo.toISOString().slice(5, 10).split('-').reverse().join('/');
  return `${await nombreSala(db, datos.salaId)} ya tiene ${choque.nombreClase} el ${dia} de ${hhmm(local.minutosDelDia)} a ${hhmm(local.minutosDelDia + choque.duracionMinutos)}.`;
}
