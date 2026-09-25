import { Prisma } from '@prisma/client';
import { aHoraLocal } from './zona-horaria.util';

// Quién puede reservar una clase (plan de simplificación, 8.4, nivel A): las
// reglas son por disciplina y viven en Organizacion.configuracion.accesoClases
// (sin cambio de base de datos).
//  - ABIERTA: cualquier cliente, incluso sin membresía (clase de prueba, evento).
//  - MIEMBROS: cualquier membresía activa en la fecha de la clase (por defecto).
//  - PLANES: solo membresías de los planes listados.
// Decisión D2: la membresía de cualquier sucursal sirve; no se filtra por sede.
export const MODOS_ACCESO_CLASE = ['ABIERTA', 'MIEMBROS', 'PLANES'] as const;
export type ModoAccesoClase = (typeof MODOS_ACCESO_CLASE)[number];

export interface ReglaAccesoClase {
  modo: ModoAccesoClase;
  planIds?: string[];
}

export interface AccesoClases {
  porDefecto: ModoAccesoClase;
  porDisciplina: Record<string, ReglaAccesoClase>;
}

export function leerAccesoClases(configuracion: unknown): AccesoClases {
  const guardado = (configuracion as { accesoClases?: Partial<AccesoClases> } | null)?.accesoClases;
  const porDefecto = MODOS_ACCESO_CLASE.includes(guardado?.porDefecto as ModoAccesoClase) ? (guardado!.porDefecto as ModoAccesoClase) : 'MIEMBROS';
  return { porDefecto, porDisciplina: guardado?.porDisciplina ?? {} };
}

export function reglaDeDisciplina(acceso: AccesoClases, disciplinaId: string | null | undefined): ReglaAccesoClase {
  return (disciplinaId && acceso.porDisciplina[disciplinaId]) || { modo: acceso.porDefecto };
}

// Decisión D4: por defecto asistir a una clase NO descuenta sesiones (solo el
// ingreso al gimnasio). En experto se puede activar.
export function descontarSesionEnClase(configuracion: unknown): boolean {
  return (configuracion as { clases?: { descontarSesionEnClase?: boolean } } | null)?.clases?.descontarSesionEnClase === true;
}

export interface EvaluacionReserva {
  permitido: boolean;
  motivo: string | null;
  membresiaId: string | null;
}

/**
 * ¿Puede este cliente reservar esta clase? Devuelve el motivo en lenguaje
 * claro si no puede ("El plan Mensual Básico de Juan no incluye Spinning").
 * `db` es el cliente con RLS (extendedClient o su transacción).
 */
export async function evaluarReserva(
  db: Prisma.TransactionClient,
  clienteId: string,
  clase: { disciplinaId: string | null; fechaHora: Date; disciplina?: { nombre: string } | null; nombreClase: string },
  configuracion: unknown,
  zonaHoraria: string | null | undefined,
): Promise<EvaluacionReserva> {
  const regla = reglaDeDisciplina(leerAccesoClases(configuracion), clase.disciplinaId);
  if (regla.modo === 'ABIERTA') return { permitido: true, motivo: null, membresiaId: null };

  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } });
  if (!cliente) return { permitido: false, motivo: 'El cliente no existe.', membresiaId: null };
  const nombre = cliente.nombre.split(' ')[0];

  // Membresía vigente en la FECHA de la clase (fechaInicio/fechaFin son fechas
  // "de reloj" guardadas a medianoche UTC). EN_ESPERA sirve si ya empezó para
  // ese día (una renovación comprada por adelantado).
  const fechaClase = aHoraLocal(clase.fechaHora, zonaHoraria).fechaSolo;
  const membresias = await db.membresia.findMany({
    where: {
      clienteId,
      estado: { in: ['ACTIVA', 'EN_ESPERA'] },
      fechaInicio: { lte: fechaClase },
      OR: [{ fechaFin: null }, { fechaFin: { gte: fechaClase } }],
    },
    select: { id: true, planId: true, plan: { select: { nombre: true } } },
  });
  if (membresias.length === 0) {
    const dia = fechaClase.toISOString().slice(0, 10).split('-').reverse().join('/');
    return { permitido: false, motivo: `${nombre} no tiene una membresía activa para el ${dia}.`, membresiaId: null };
  }

  if (regla.modo === 'MIEMBROS') return { permitido: true, motivo: null, membresiaId: membresias[0].id };

  const permitidos = new Set(regla.planIds ?? []);
  const valida = membresias.find((m) => permitidos.has(m.planId));
  if (valida) return { permitido: true, motivo: null, membresiaId: valida.id };
  const clasesDe = clase.disciplina?.nombre ?? clase.nombreClase;
  const planes = [...new Set(membresias.map((m) => m.plan.nombre))].join(' ni el plan ');
  return { permitido: false, motivo: `El plan ${planes} de ${nombre} no incluye ${clasesDe}.`, membresiaId: null };
}
