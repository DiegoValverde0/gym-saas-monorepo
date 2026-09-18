// Clasificación de clientes por historial de membresías (reportería +
// GET /clientes). Puro y sin acceso a DB a propósito: se le pasa el array de
// membresías ya resuelto (Prisma select mínimo: estado/fechaInicio/fechaFin)
// para poder reusarlo tanto por cliente individual (ClientesService) como en
// el agregado del dashboard (DashboardService) sin duplicar la consulta.
//
// Decisiones de diseño que vale la pena dejar explícitas (el pedido original
// no las cubre del todo, o asume un modelo de estados distinto al real):
//
// 1. "Encolado" NO es "ACTIVA con fechaInicio futura". En este sistema, una
//    membresía pagada cuyo inicio cae en el futuro nace en estado EN_ESPERA,
//    no ACTIVA (ver membresia.service.ts: el encolamiento automático evita
//    solapar accesos ya pagados, y la promueve a ACTIVA cuando le toca). Por
//    eso "Activo - Encolado" se basa en EN_ESPERA, el estado real que usa el
//    resto del sistema. CONGELADA (pausada, no vencida) se cuenta también
//    como "encolado": el cliente sigue teniendo una membresía vigente en
//    términos de negocio, solo que pausada, así que no debería caer en
//    ninguno de los baldes de "inactivo" de abajo.
// 2. El conteo histórico para "Abandono Temprano" (=1) y "Churn" (3+) SOLO
//    cuenta membresías con `pagada: true` (transaccion.service.ts la marca
//    en el momento del cobro). Es clave filtrar así y no por `estado`:
//    - Una PENDIENTE_PAGO nunca cobrada no es una membresía "adquirida" --
//      es una venta que ni siquiera se concretó.
//    - El flujo de "editar" una venta PENDIENTE_PAGO (ver membresia-wizard-modal.tsx)
//      cancela la anterior y crea una nueva por debajo (membresia.service.ts,
//      create(), paso 1) -- sin este filtro, cada corrección de un cobro
//      antes de pagar sumaría una fila CANCELADA fantasma al historial e
//      inflaría artificialmente el abandono/churn de alguien que ni
//      siquiera empezó a entrenar.
//    Con este filtro, "Vencido Reciente" queda como el balde general para
//    todo inactivo con historial pagado que no cae en 1 ni en 3+ (ej.
//    exactamente 2, o un estado de la última membresía que no sea
//    exactamente VENCIDA/AGOTADA, como una CANCELADA ya pagada).
export type SegmentoCliente =
  | 'PROSPECTO'
  | 'ACTIVO_VIGENTE'
  | 'ACTIVO_ENCOLADO'
  | 'INACTIVO_VENCIDO_RECIENTE'
  | 'INACTIVO_ABANDONO_TEMPRANO'
  | 'INACTIVO_CHURN';

export interface MembresiaParaSegmento {
  estado: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  pagada: boolean;
}

export function calcularSegmentoCliente(membresias: MembresiaParaSegmento[]): SegmentoCliente {
  const hoy = new Date();

  const tieneVigente = membresias.some(
    (m) => m.estado === 'ACTIVA' && m.fechaInicio <= hoy && (!m.fechaFin || m.fechaFin >= hoy),
  );
  if (tieneVigente) return 'ACTIVO_VIGENTE';

  const tieneEncolada = membresias.some((m) => m.estado === 'EN_ESPERA' || m.estado === 'CONGELADA');
  if (tieneEncolada) return 'ACTIVO_ENCOLADO';

  const historicoPagado = membresias.filter((m) => m.pagada).length;
  if (historicoPagado === 0) return 'PROSPECTO';
  if (historicoPagado === 1) return 'INACTIVO_ABANDONO_TEMPRANO';
  if (historicoPagado >= 3) return 'INACTIVO_CHURN';
  return 'INACTIVO_VENCIDO_RECIENTE';
}

export const SEGMENTOS_CLIENTE: SegmentoCliente[] = [
  'PROSPECTO',
  'ACTIVO_VIGENTE',
  'ACTIVO_ENCOLADO',
  'INACTIVO_VENCIDO_RECIENTE',
  'INACTIVO_ABANDONO_TEMPRANO',
  'INACTIVO_CHURN',
];
