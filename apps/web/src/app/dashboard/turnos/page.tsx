"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { apiGet, unwrapList } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Protect } from '@/components/ui/protect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ayuda } from '@/components/ui/ayuda';
import { UserX } from 'lucide-react';
import { StaffBasico } from './compartido';
import { VistaHoy } from './VistaHoy';
import { VistaSemana } from './VistaSemana';
import { VistaAusencias } from './VistaAusencias';
import { AusenciaDialog } from './AusenciaDialog';

// "Hoy" local del navegador, solo como valor inicial del formulario de
// ausencia (el servidor calcula todo con la zona horaria de la organización).
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Jornadas del equipo (ex "Turnos", plan de simplificación 7.2). Las jornadas
 * se generan solas a partir del horario semanal de cada persona (Equipo); acá
 * se ve qué pasa hoy, se ajusta un día puntual y se registran ausencias.
 */
export default function JornadasPage() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  const { sucursalId } = useSucursalActiva();
  const [vista, setVista] = useState('hoy');
  const [ausencia, setAusencia] = useState<{ abierto: boolean; staffId: string | null }>({ abierto: false, staffId: null });

  const { data: personal } = useQuery({
    queryKey: ['personal', activeTenantId],
    queryFn: async () => unwrapList<StaffBasico>(await apiGet('/personal')),
    enabled: !!token,
  });
  const equipo = [...(personal ?? [])].sort((a, b) => (a.usuario?.nombreCompleto ?? '').localeCompare(b.usuario?.nombreCompleto ?? ''));

  if (!token) return null;

  return (
    <Protect permission="turnos:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Jornadas del equipo <Ayuda tema="jornada" /></h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Quién trabaja hoy, quién llegó y quién falta. Las jornadas salen solas del horario semanal de cada persona (en Equipo).
            </p>
          </div>
          <Protect permission="turnos:actualizar">
            <Button onClick={() => setAusencia({ abierto: true, staffId: null })} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <UserX className="mr-2 h-4 w-4" /> Registrar ausencia
            </Button>
          </Protect>
        </div>

        <Tabs value={vista} onValueChange={setVista}>
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="hoy">Hoy</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="ausencias">Ausencias</TabsTrigger>
          </TabsList>
          <TabsContent value="hoy" className="mt-4">
            <VistaHoy sucursalId={sucursalId} onRegistrarAusencia={(staffId) => setAusencia({ abierto: true, staffId })} />
          </TabsContent>
          <TabsContent value="semana" className="mt-4">
            <VistaSemana sucursalId={sucursalId} equipo={equipo} />
          </TabsContent>
          <TabsContent value="ausencias" className="mt-4">
            <VistaAusencias />
          </TabsContent>
        </Tabs>
      </div>

      <AusenciaDialog
        abierto={ausencia.abierto}
        onClose={() => setAusencia({ abierto: false, staffId: null })}
        hoy={hoyLocal()}
        equipo={equipo}
        staffIdInicial={ausencia.staffId}
      />
    </Protect>
  );
}
