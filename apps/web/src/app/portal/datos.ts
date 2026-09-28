"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

// Tipos y consultas del portal del cliente (API /portal, ver
// apps/api/src/modules/portal y docs/plan-portal-cliente.md).

export interface MembresiaPortal {
  planNombre: string;
  tipoPlan: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string | null;
  diasRestantes: number | null;
  sesionesRestantes: number | null;
}

export interface ProximaClase {
  reservaId: string;
  estado: 'CONFIRMADA' | 'EN_ESPERA';
  claseId: string;
  nombre: string;
  fechaHora: string;
  duracionMinutos: number;
  sucursal: string;
}

export interface Yo {
  nombre: string;
  correo: string | null;
  gimnasio: string;
  clasesActivas: boolean;
  membresia: MembresiaPortal | null;
  siguiente: { planNombre: string; fechaInicio: string } | null;
  proximasClases: ProximaClase[];
}

export interface ClasePortal {
  id: string;
  nombre: string;
  descripcion: string | null;
  disciplina: string | null;
  fechaHora: string;
  duracionMinutos: number;
  sucursal: string;
  sala: string | null;
  instructor: string | null;
  capacidad: number;
  cuposLibres: number;
  enEspera: number;
  miReserva: { id: string; estado: string; posicionEspera: number | null } | null;
  puedeReservar: boolean;
  motivo: string | null;
}

export interface Historial {
  membresias: (Omit<MembresiaPortal, 'diasRestantes'> & { id: string; monto: number; pagada: boolean })[];
  pagos: { id: string; fechaHora: string; monto: number; formasPago: string[]; concepto: string }[];
}

export interface Asistencia {
  id: string;
  ingreso: string;
  salida: string | null;
  sucursal: string;
}

export const useYo = (enabled = true) => useQuery({ queryKey: ['portal-yo'], queryFn: () => apiGet<Yo>('/portal/yo'), enabled });

export const CLAVE_CLASES = ['portal-clases'];

// Reservar, anotarse en espera y cancelar: mismo aviso y misma recarga desde
// Inicio y desde Clases.
export function useAccionesClase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const recargar = () => {
    queryClient.invalidateQueries({ queryKey: CLAVE_CLASES });
    queryClient.invalidateQueries({ queryKey: ['portal-yo'] });
  };
  const alFallar = (err: Error) => {
    toast({ title: 'No se pudo', description: err.message, variant: 'destructive' });
    recargar();
  };
  const reservar = useMutation({
    mutationFn: ({ claseId, listaEspera }: { claseId: string; listaEspera?: boolean }) =>
      apiPost<{ estado: string }>(`/portal/clases/${claseId}/reservar`, { listaEspera }),
    onSuccess: (res) => {
      toast({
        title: res.estado === 'EN_ESPERA' ? 'Estás en la lista de espera' : '¡Listo, tienes tu lugar!',
        description: res.estado === 'EN_ESPERA' ? 'Si alguien cancela, pasas a tener lugar y lo verás aquí.' : undefined,
        variant: 'success',
      });
      recargar();
    },
    onError: alFallar,
  });
  const cancelar = useMutation({
    mutationFn: (reservaId: string) => apiPost(`/portal/reservas/${reservaId}/cancelar`, {}),
    onSuccess: () => {
      toast({ title: 'Reserva cancelada', variant: 'success' });
      recargar();
    },
    onError: alFallar,
  });
  return { reservar, cancelar };
}

// Fechas: las de solo día (AAAA-MM-DD) son "de reloj" (medianoche UTC); las
// demás son instantes y se muestran en la hora del teléfono.
export const fechaDia = (iso: string, opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { ...opciones, timeZone: 'UTC' });
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const diaLargo = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === manana.toDateString()) return 'Mañana';
  const texto = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export const NOMBRE_ESTADO_MEMBRESIA: Record<string, string> = {
  ACTIVA: 'Activa',
  EN_ESPERA: 'Por empezar',
  CONGELADA: 'En pausa',
  VENCIDA: 'Vencida',
  AGOTADA: 'Sin sesiones',
  PENDIENTE_PAGO: 'Por pagar',
  CANCELADA: 'Anulada',
};
