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
// Fase 6 (DB-1): regla propia de una sesión (copiada de su clase), con los
// planes de la clase. null si la sesión usa la regla de su disciplina.
export async function reglaPropiaDeSesion(db: Prisma.TransactionClient, claseId: string): Promise<ReglaAccesoClase | null> {
  const sesion = await db.claseProgramada.findUnique({ where: { id: claseId }, select: { acceso: true, clasePlantillaId: true } });
  if (!sesion?.acceso) return null;
  if (sesion.acceso !== 'PLANES') return { modo: sesion.acceso };
  const planes = sesion.clasePlantillaId
    ? await db.clasePlantillaPlan.findMany({ where: { clasePlantillaId: sesion.clasePlantillaId }, select: { planId: true } })
    : [];
  return { modo: 'PLANES', planIds: planes.map((p) => p.planId) };
}

export interface MembresiaParaReserva {
  id: string;
  planId: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  plan: { nombre: string };
}

/**
 * La decisión en sí, sin consultas: con la regla que aplica, las membresías
 * ACTIVA/EN_ESPERA del cliente y la fecha "de reloj" de la clase. La usan
 * evaluarReserva (una clase) y el portal del cliente (muchas clases a la vez).
 * `persona`: 'tercera' para recepción ("Juan no tiene..."), 'segunda' para el
 * propio cliente en el portal ("No tienes...").
 */
export function decidirReserva(
  regla: ReglaAccesoClase,
  membresias: MembresiaParaReserva[],
  fechaClase: Date,
  nombreCliente: string,
  clasesDe: string,
  persona: 'tercera' | 'segunda' = 'tercera',
): EvaluacionReserva {
  if (regla.modo === 'ABIERTA') return { permitido: true, motivo: null, membresiaId: null };
  const nombre = nombreCliente.split(' ')[0];
  const tu = persona === 'segunda';

  // Membresía vigente en la FECHA de la clase (fechaInicio/fechaFin son fechas
  // "de reloj" guardadas a medianoche UTC). EN_ESPERA sirve si ya empezó para
  // ese día (una renovación comprada por adelantado).
  const vigentes = membresias.filter((m) => m.fechaInicio <= fechaClase && (!m.fechaFin || m.fechaFin >= fechaClase));
  if (vigentes.length === 0) {
    const dia = fechaClase.toISOString().slice(0, 10).split('-').reverse().join('/');
    const motivo = tu ? `No tienes una membresía activa para el ${dia}.` : `${nombre} no tiene una membresía activa para el ${dia}.`;
    return { permitido: false, motivo, membresiaId: null };
  }

  if (regla.modo === 'MIEMBROS') return { permitido: true, motivo: null, membresiaId: vigentes[0].id };

  const permitidos = new Set(regla.planIds ?? []);
  const valida = vigentes.find((m) => permitidos.has(m.planId));
  if (valida) return { permitido: true, motivo: null, membresiaId: valida.id };
  const planes = [...new Set(vigentes.map((m) => m.plan.nombre))].join(' ni el plan ');
  const motivo = tu ? `Tu plan ${planes} no incluye ${clasesDe}.` : `El plan ${planes} de ${nombre} no incluye ${clasesDe}.`;
  return { permitido: false, motivo, membresiaId: null };
}

export async function evaluarReserva(
  db: Prisma.TransactionClient,
  clienteId: string,
  clase: { id?: string; disciplinaId: string | null; fechaHora: Date; disciplina?: { nombre: string } | null; nombreClase: string },
  configuracion: unknown,
  zonaHoraria: string | null | undefined,
): Promise<EvaluacionReserva> {
  const propia = clase.id ? await reglaPropiaDeSesion(db, clase.id) : null;
  const regla = propia ?? reglaDeDisciplina(leerAccesoClases(configuracion), clase.disciplinaId);
  if (regla.modo === 'ABIERTA') return { permitido: true, motivo: null, membresiaId: null };

  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } });
  if (!cliente) return { permitido: false, motivo: 'El cliente no existe.', membresiaId: null };

  const fechaClase = aHoraLocal(clase.fechaHora, zonaHoraria).fechaSolo;
  const membresias = await db.membresia.findMany({
    where: {
      clienteId,
      estado: { in: ['ACTIVA', 'EN_ESPERA'] },
      fechaInicio: { lte: fechaClase },
      OR: [{ fechaFin: null }, { fechaFin: { gte: fechaClase } }],
    },
    select: { id: true, planId: true, fechaInicio: true, fechaFin: true, plan: { select: { nombre: true } } },
  });
  const clasesDe = propia ? clase.nombreClase : clase.disciplina?.nombre ?? clase.nombreClase;
  return decidirReserva(regla, membresias, fechaClase, cliente.nombre, clasesDe);
}
