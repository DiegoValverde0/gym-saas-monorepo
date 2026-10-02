"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Protect } from '@/components/ui/protect';
import { PrimerosPasos } from '@/components/ui/primeros-pasos';
import { PorVencer } from '@/components/ui/por-vencer';
import { ResumenHoy } from '@/components/ui/resumen-hoy';
import { useModoUso } from '@/hooks/use-modo-uso';
import { AccionesRapidas } from '@/components/ui/acciones-rapidas';
import { Indicadores, IndicadoresCargando, Kpis } from '@/components/inicio/indicadores';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export default function DashboardPage() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();
  // Dashboard por modo (plan 11.13): en simple, lo del día y a quién avisar.
  const { esSimple } = useModoUso();

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis', activeTenantId],
    queryFn: async () => apiGet<Kpis>('/dashboard/kpis'),
    enabled: !!token,
  });

  const { data: chartData, isLoading: loadingCharts } = useQuery({
    queryKey: ['dashboard-charts', activeTenantId],
    queryFn: async () => apiGet('/dashboard/charts'),
    enabled: !!token,
  });

  if (!token) return null;

  const clientesActivos = kpis?.clientes.activos || 0;
  const clientesTotales = kpis?.clientes.totales || 0;
  const clientesInactivos = Math.max(0, clientesTotales - clientesActivos);

  const pieData = [
    { name: 'Activos', value: clientesActivos, color: '#10b981' },
    { name: 'Inactivos', value: clientesInactivos, color: '#f43f5e' }
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Inicio
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Lo que pasa hoy en tu gimnasio.
        </p>
      </div>

      {/* Indicadores con comparación y tendencia (docs/plan-inicio.md, fase 1): lo primero que se ve. */}
      {!esSimple && (kpis ? <Indicadores kpis={kpis} /> : <IndicadoresCargando />)}

      <PrimerosPasos />

      {/* data-recorrido: lo que resalta la guía del modo simple (components/ui/recorrido.tsx). */}
      <div data-recorrido="acciones"><AccionesRapidas /></div>

      {esSimple && <div data-recorrido="resumen"><ResumenHoy /></div>}

      <div data-recorrido="por-vencer"><PorVencer /></div>

      {!esSimple && (<>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        
        {/* GRÁFICO FINANCIERO */}
        <Protect permission="transacciones:leer">
            <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
                <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">Ingresos (Últimos 7 días)</CardTitle>
                <CardDescription className="dark:text-slate-400">Rendimiento económico reciente.</CardDescription>
            </CardHeader>
            <CardContent>
                {loadingCharts ? (
                    <div className="h-[300px] flex items-center justify-center text-slate-400 dark:text-slate-500">Cargando gráfica...</div>
                ) : (
                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={(chartData as any[]) || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <Line type="monotone" dataKey="Ingresos" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: 'var(--color-background, #fff)' }} activeDot={{ r: 6 }} />
                                <CartesianGrid stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="5 5" vertical={false} />
                                <XAxis dataKey="name" stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Bs ${value}`} dx={-10} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' }}
                                    formatter={(value: any) => [`Bs. ${Number(value || 0).toFixed(2)}`, 'Ingreso']}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
            </Card>
        </Protect>

        <div className="lg:col-span-1 space-y-6 flex flex-col h-full">
          {/* CLIENTES PIE CHART */}
          <Protect permission="clientes:leer">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900 flex-1">
              <CardHeader>
                  <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">Estado de Clientes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                  {!kpis ? (
                      <div className="h-[200px] w-full rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse"></div>
                  ) : clientesTotales === 0 ? (
                      <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">Sin clientes</div>
                  ) : (
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                  )}
              </CardContent>
            </Card>
          </Protect>
        </div>
      </div>
      </>)}
    </div>
  );
}
