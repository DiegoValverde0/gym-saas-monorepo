import { Prisma } from '@prisma/client';
import { verificarHash } from './contrasena.util';

// PIN de marcaje del equipo (fase 6, DB-4): 4 a 6 dígitos, único dentro de la
// organización (el PIN solo identifica a la persona en la tablet).
export const PIN_VALIDO = /^\d{4,6}$/;

type Db = Prisma.TransactionClient;

/**
 * Busca a la persona del equipo (activa) de la organización actual cuyo PIN
 * coincide. Los hashes llevan sal, así que se verifica uno por uno: son pocas
 * personas por gimnasio.
 */
export async function buscarStaffPorPin(db: Db, pin: string, excluirId?: string) {
  const conPin = await db.perfilStaff.findMany({
    where: { pinHash: { not: null }, estado: 'ACTIVO', ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true, usuarioId: true, organizacionId: true, pinHash: true, usuario: { select: { nombreCompleto: true } } },
  });
  for (const staff of conPin) {
    if (staff.pinHash && (await verificarHash(pin, staff.pinHash))) return staff;
  }
  return null;
}
