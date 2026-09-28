import { Prisma } from '@prisma/client';

// Lista de espera de clases (fase 6, DB-3). Cuando se libera un cupo (una
// reserva confirmada se cancela o la sesión gana capacidad), suben a
// CONFIRMADA las reservas EN_ESPERA en orden de llegada, mientras haya lugar.
// Devuelve quiénes subieron: el nombre, para avisar en pantalla, y la
// reserva y el cliente, para el aviso automático "¡Ya tienes lugar!".
export interface Promovido {
  reservaId: string;
  clienteId: string;
  nombre: string;
}

export async function promoverListaEspera(tx: Prisma.TransactionClient, claseId: string): Promise<Promovido[]> {
  const clase = await tx.claseProgramada.findUnique({ where: { id: claseId }, select: { capacidadMaxima: true, estado: true, fechaHora: true } });
  if (!clase || clase.estado !== 'ACTIVO' || clase.fechaHora <= new Date()) return [];

  const ocupados = await tx.reservaClase.count({ where: { claseId, estado: { in: ['CONFIRMADA', 'ASISTIO'] } } });
  const libres = clase.capacidadMaxima - ocupados;
  if (libres <= 0) return [];

  const enEspera = await tx.reservaClase.findMany({
    where: { claseId, estado: 'EN_ESPERA' },
    orderBy: { fechaReserva: 'asc' },
    take: libres,
    select: { id: true, clienteId: true, cliente: { select: { nombre: true } } },
  });
  if (enEspera.length === 0) return [];
  await tx.reservaClase.updateMany({ where: { id: { in: enEspera.map((r) => r.id) } }, data: { estado: 'CONFIRMADA' } });
  return enEspera.map((r) => ({ reservaId: r.id, clienteId: r.clienteId, nombre: r.cliente.nombre }));
}
