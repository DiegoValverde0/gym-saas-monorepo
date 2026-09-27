"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useModoUso } from '@/hooks/use-modo-uso';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { usePermissions } from '@/hooks/use-permissions';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { Protect } from '@/components/ui/protect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VistaAsistencia, VistaClases, VistaEquipo, VistaPlanes, VistaResumen } from './vistas';

/**
 * Reportes por modo (plan de simplificación, 11.8):
 *  - Simple: Hoy y Este mes.
 *  - Intermedio (con "Reportes avanzados" activo): por plan, por clase y
 *    asistencia por día y hora.
 *  - Experto: además, horas y costo del equipo, y descarga en CSV.
 */
export default function ReportesPage() {
  const { token } = useAuth();
  const { alMenos, esExperto } = useModoUso();
  const modulos = useModulosActivos();
  const { hasPermission } = usePermissions();
  const { sucursalId, sucursal, puedeElegir } = useSucursalActiva();
  const [todas, setTodas] = useState(false);
  const [vista, setVista] = useState('resumen');

  if (!token) return null;
  const filtro = todas ? null : sucursalId;
  const avanzados = modulos.reportesAvanzados && alMenos('intermedio');
  const pestanas = [
    { valor: 'resumen', nombre: 'Hoy y este mes', visible: true },
    { valor: 'planes', nombre: 'Por plan', visible: avanzados },
    { valor: 'clases', nombre: 'Clases', visible: avanzados && modulos.clasesGrupales && hasPermission('clases:leer') },
    { valor: 'asistencia', nombre: 'Asistencia', visible: avanzados && modulos.controlAcceso && hasPermission('asistencias:leer') },
    { valor: 'equipo', nombre: 'Equipo', visible: avanzados && esExperto && modulos.controlPersonal && hasPermission('turnos:leer') },
  ].filter((p) => p.visible);

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Reportes</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cuánto entró, cuánto salió y cómo se mueve tu gimnasio.</p>
          </div>
          {puedeElegir && (
            <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-medium" role="group" aria-label="Sucursal">
              <button type="button" aria-pressed={!todas} onClick={() => setTodas(false)} className={`rounded-md px-3 py-1.5 ${!todas ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                {sucursal?.nombre ?? 'Esta sucursal'}
              </button>
              <button type="button" aria-pressed={todas} onClick={() => setTodas(true)} className={`rounded-md px-3 py-1.5 ${todas ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                Todas las sucursales
              </button>
            </div>
          )}
        </div>

        {pestanas.length === 1 ? (
          <VistaResumen sucursalId={filtro} />
        ) : (
          <Tabs value={vista} onValueChange={setVista}>
            <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 flex-wrap h-auto">
              {pestanas.map((p) => <TabsTrigger key={p.valor} value={p.valor}>{p.nombre}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="resumen" className="mt-4"><VistaResumen sucursalId={filtro} /></TabsContent>
            <TabsContent value="planes" className="mt-4"><VistaPlanes sucursalId={filtro} csv={esExperto} /></TabsContent>
            <TabsContent value="clases" className="mt-4"><VistaClases sucursalId={filtro} csv={esExperto} /></TabsContent>
            <TabsContent value="asistencia" className="mt-4"><VistaAsistencia sucursalId={filtro} /></TabsContent>
            <TabsContent value="equipo" className="mt-4"><VistaEquipo sucursalId={filtro} /></TabsContent>
          </Tabs>
        )}
      </div>
    </Protect>
  );
}
