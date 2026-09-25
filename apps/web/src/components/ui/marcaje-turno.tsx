"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api-client';

interface MiJornada {
  id: string;
  horaEntrada: string;
  horaSalida: string;
  horaIngresoReal?: string | null;
  horaSalidaReal?: string | null;
}

// Las horas de la jornada vienen como @db.Time (1970-01-01THH:MM:00Z): se muestran tal cual.
const horaReloj = (iso: string) => new Date(iso).toISOString().substring(11, 16);

/**
 * "Marcar entrada / salida" en la barra superior (plan 7.4 y 13.10), visible
 * para cualquier persona del equipo con jornada hoy, en cualquier pantalla y
 * también en el celular (decisión D7: se marca con la propia sesión, sin PIN).
 * Si no es del equipo o no trabaja hoy, no se muestra nada.
 */
export function MarcajeTurno() {
  const { token, user, isSuperAdmin } = useAuth();
  const { controlPersonal } = useModulosActivos();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jornada } = useQuery({
    queryKey: ['mi-turno-hoy', user?.sub],
    queryFn: async () => apiGet<MiJornada>('/turnos/mi-turno/hoy'),
    enabled: !!token && !isSuperAdmin && controlPersonal,
    retry: false, // 404 = no es del equipo o no tiene jornada hoy
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const marcar = useMutation({
    mutationFn: async (accion: 'ingreso' | 'salida') => apiPost(`/turnos/mi-turno/marcar-${accion}`),
    onSuccess: (_r, accion) => {
      toast({ title: accion === 'ingreso' ? 'Entrada marcada' : 'Salida marcada', description: '¡Gracias!', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['mi-turno-hoy'] });
      queryClient.invalidateQueries({ queryKey: ['jornadas'] });
    },
    onError: (err: Error) => toast({ title: 'No se pudo marcar', description: err.message, variant: 'destructive' }),
  });

  if (!jornada || jornada.horaSalidaReal) return null;
  const horario = `${horaReloj(jornada.horaEntrada)}–${horaReloj(jornada.horaSalida)}`;

  return !jornada.horaIngresoReal ? (
    <Button
      size="sm"
      onClick={() => marcar.mutate('ingreso')}
      disabled={marcar.isPending}
      title={`Tu jornada de hoy: ${horario}`}
      className="bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      <LogIn className="h-4 w-4 sm:mr-1.5" />
      <span className="hidden sm:inline">Marcar entrada</span>
      <span className="sm:hidden ml-1">Entrada</span>
    </Button>
  ) : (
    <Button size="sm" variant="outline" onClick={() => marcar.mutate('salida')} disabled={marcar.isPending} title={`Tu jornada de hoy: ${horario}`}>
      <LogOut className="h-4 w-4 sm:mr-1.5" />
      <span className="hidden sm:inline">Marcar salida</span>
      <span className="sm:hidden ml-1">Salida</span>
    </Button>
  );
}
