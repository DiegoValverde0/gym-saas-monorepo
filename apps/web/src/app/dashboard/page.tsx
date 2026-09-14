"use client";

import { useQuery } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Protect } from '@/components/ui/protect';
import { Users, Wallet, Activity, Clock, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
          Command Center
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Métricas y estado general del gimnasio en tiempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* KPI: Clientes Activos (Vista Operativa) */}
        <Protect permission="clientes:leer">
            <Card className="border-indigo-100 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-zinc-700">Clientes Activos</CardTitle>
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Users className="h-4 w-4 text-indigo-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-black text-indigo-950">
                {loadingKpis ? '...' : kpis?.clientesActivos}
                </div>
                <p className="text-xs text-zinc-500 font-medium">De {kpis?.clientesTotales} registrados en total</p>
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Asistencias Hoy (Vista Operativa) */}
        <Protect permission="asistencias:leer">
            <Card className="border-emerald-100 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-zinc-700">Asistencias Hoy</CardTitle>
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-emerald-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-black text-emerald-950">
                {loadingKpis ? '...' : kpis?.asistenciasHoy}
                </div>
                <p className="text-xs text-zinc-500 font-medium">Accesos registrados hoy</p>
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Alerta Membresías (Vista Operativa) */}
        <Protect permission="membresias:leer">
            <Card className="border-amber-100 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-zinc-700">Próximos a Vencer</CardTitle>
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-black text-amber-950">
                {loadingKpis ? '...' : kpis?.membresiasPorVencer}
                </div>
                <p className="text-xs text-zinc-500 font-medium">Membresías expiran en 5 días</p>
            </CardContent>
            </Card>
        </Protect>

        {/* KPI: Ingresos del Mes (Vista Financiera) */}
        <Protect permission="transacciones:leer">
            <Card className="bg-zinc-950 border-zinc-900 shadow-lg overflow-hidden relative text-white">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-cyan-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold text-zinc-300">Ingresos Hoy</CardTitle>
                <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-black text-white">
                {loadingKpis ? '...' : `Bs. ${Number(kpis?.ingresosHoy || 0).toFixed(2)}`}
                </div>
                <div className="text-xs text-emerald-400 font-medium flex items-center mt-1 gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Mes: Bs. {Number(kpis?.ingresosMes || 0).toFixed(2)}
                </div>
            </CardContent>
            </Card>
        </Protect>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        
        {/* GRÁFICO FINANCIERO */}
        <Protect permission="transacciones:leer">
            <Card className="lg:col-span-2 shadow-sm border-zinc-200">
            <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-800">Ingresos (Últimos 7 días)</CardTitle>
                <CardDescription>Rendimiento económico reciente.</CardDescription>
            </CardHeader>
            <CardContent>
                {loadingCharts ? (
                    <div className="h-[300px] flex items-center justify-center text-zinc-400">Cargando gráfica...</div>
                ) : (
                    <div className="h-[300px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <Line type="monotone" dataKey="Ingresos" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                <CartesianGrid stroke="#e4e4e7" strokeDasharray="5 5" vertical={false} />
                                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Bs ${value}`} dx={-10} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any) => [`Bs. ${Number(value || 0).toFixed(2)}`, 'Ingreso']}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
            </Card>
        </Protect>

        {/* ACTIVIDAD RECIENTE */}
        <Protect permission="membresias:leer">
            <Card className="lg:col-span-1 shadow-sm border-zinc-200 flex flex-col">
            <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-800">Actividad Reciente</CardTitle>
                <CardDescription>Últimas membresías procesadas.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                {loadingRecent ? (
                    <div className="flex items-center justify-center text-zinc-400 h-full">Cargando...</div>
                ) : (
                    <div className="space-y-4">
                        {recent?.length === 0 ? (
                            <p className="text-zinc-500 text-sm text-center">No hay actividad reciente.</p>
                        ) : (
                            recent?.map((item: any) => (
                                <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-zinc-100 last:border-0">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.estado === 'ACTIVA' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        {item.estado === 'ACTIVA' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-zinc-900 truncate">{item.cliente?.nombre}</p>
                                        <p className="text-xs text-zinc-500 truncate">{item.plan?.nombre}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold text-zinc-900">Bs. {item.montoFinal}</p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.estado === 'ACTIVA' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {item.estado}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </CardContent>
            </Card>
        </Protect>

      </div>
    </div>
  );
}
