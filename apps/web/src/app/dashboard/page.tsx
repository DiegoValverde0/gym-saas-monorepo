"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Protect } from '@/components/ui/protect';
import { Users, Wallet, Activity, Clock, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface MembresiaReciente {
  id: string;
  estado: string;
  montoFinal: number | string;
  cliente?: { nombre: string };
  plan?: { nombre: string };
}

export default function DashboardPage() {
  const { token } = useAuth();
  const { activeTenantId } = useTenantStore();

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ['dashboard-kpis', activeTenantId],
    queryFn: async () => apiGet('/dashboard/kpis'),
    enabled: !!token,
  });

  const { data: chartData, isLoading: loadingCharts } = useQuery({
    queryKey: ['dashboard-charts', activeTenantId],
    queryFn: async () => apiGet('/dashboard/charts'),
    enabled: !!token,
  });

  const { data: recent, isLoading: loadingRecent } = useQuery({
    queryKey: ['dashboard-recent', activeTenantId],
    queryFn: async () => apiGet('/dashboard/recent-activity'),
    enabled: !!token,
  });

  if (!token) return null;

  const clientesActivos = (kpis as any)?.clientesActivos || 0;
  const clientesTotales = (kpis as any)?.clientesTotales || 0;
  const clientesInactivos = Math.max(0, clientesTotales - clientesActivos);

  const pieData = [
    { name: 'Activos', value: clientesActivos, color: '#10b981' },
    { name: 'Inactivos', value: clientesInactivos, color: '#f43f5e' }
  ];

  const KpiSkeleton = () => (
    <div className="h-10 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-md mt-2"></div>
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Command Center
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Métricas y estado general del gimnasio en tiempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* KPI: Clientes Activos (Vista Operativa) */}
        <Protect permission="clientes:leer">
            <Card className="border-indigo-100 dark:border-indigo-900/50 dark:bg-slate-900 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300">Clientes Activos</CardTitle>
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center">
                    <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
            </CardHeader>
            <CardContent>
                {loadingKpis ? <KpiSkeleton /> : (
                  <>
                    <div className="text-2xl font-black text-indigo-950 dark:text-indigo-100 mt-2">
                      {clientesActivos}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">De {clientesTotales} registrados en total</p>
                  </>
                )}
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Asistencias Hoy (Vista Operativa) */}
        <Protect permission="asistencias:leer">
            <Card className="border-emerald-100 dark:border-emerald-900/50 dark:bg-slate-900 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300">Asistencias Hoy</CardTitle>
                <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
            </CardHeader>
            <CardContent>
                {loadingKpis ? <KpiSkeleton /> : (
                  <>
                    <div className="text-2xl font-black text-emerald-950 dark:text-emerald-100 mt-2">
                      {(kpis as any)?.asistenciasHoy}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Accesos registrados hoy</p>
                  </>
                )}
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Alerta Membresías (Vista Operativa) */}
        <Protect permission="membresias:leer">
            <Card className="border-amber-100 dark:border-amber-900/50 dark:bg-slate-900 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300">Próximos a Vencer</CardTitle>
                <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
            </CardHeader>
            <CardContent>
                {loadingKpis ? <KpiSkeleton /> : (
                  <>
                    <div className="text-2xl font-black text-amber-950 dark:text-amber-100 mt-2">
                      {(kpis as any)?.membresiasPorVencer}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Membresías expiran en 5 días</p>
                  </>
                )}
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Ingresos del Mes (Vista Financiera) */}
        <Protect permission="transacciones:leer">
            <Card className="bg-slate-900 dark:bg-slate-950 border-slate-800 dark:border-slate-900 shadow-lg overflow-hidden relative text-white">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-cyan-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-slate-300">Ingresos Hoy</CardTitle>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                </div>
            </CardHeader>
            <CardContent>
                {loadingKpis ? <KpiSkeleton /> : (
                  <>
                    <div className="text-2xl font-black text-white mt-2">
                      Bs. {Number((kpis as any)?.ingresosHoy || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-emerald-400 font-medium flex items-center mt-1 gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Mes: Bs. {Number((kpis as any)?.ingresosMes || 0).toFixed(2)}
                    </div>
                  </>
                )}
            </CardContent>
            </Card>
        </Protect>
      </div>

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
                  {loadingKpis ? (
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
    </div>
  );
}
