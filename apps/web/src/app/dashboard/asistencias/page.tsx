"use client";

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { Protect } from '@/components/ui/protect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, UserCheck, UserX, Clock, Ban, CheckCircle2, Play, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function AsistenciasPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const { token, user } = useAuth();
  const userSucursalId = user?.sucursalId;

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [motivoForzado, setMotivoForzado] = useState('');
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Fetch Clientes for search
  const { data: clientes } = useQuery({
    queryKey: ['clientes', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/clientes')),
    enabled: !!token,
  });

  // Fetch Activas (Inside gym)
  const { data: activas, isLoading: loadingActivas } = useQuery({
    queryKey: ['asistencias_activas', activeTenantId],
    queryFn: async () => {
      if (!activeTenantId || activeTenantId === 'all') return [];
      // Reutilizamos tenantId como sucursalId para este prototipo (Asumiendo 1 a 1
      // de Organizacion-Sucursal o que TenantId = SucursalId en UI)
      return unwrapList(await apiGet(`/asistencias/activas/${activeTenantId}`));
    },
    enabled: !!token && !!activeTenantId && activeTenantId !== 'all',
  });

  // Validation Check (Dry Run)
  const validateMutation = useMutation({
    mutationFn: async (clienteId: string) => apiPost('/asistencias/validate', { clienteId }),
  });

  // CheckIn
  const checkinMutation = useMutation({
    mutationFn: async ({ forzar, motivo }: { forzar: boolean, motivo?: string }) => {
      const payload = {
          clienteId: selectedCliente.id,
          sucursalId: selectedCliente.sucursalBaseId || userSucursalId || activeTenantId,
          tipoAsistencia: 'MIEMBRO',
          forzarIngreso: forzar,
          motivoForzado: motivo
      };
      return apiPost('/asistencias/checkin', payload);
    },
    onSuccess: () => {
        toast({ title: 'Ingreso Registrado', variant: 'success' });
        queryClient.invalidateQueries({ queryKey: ['asistencias_activas'] });
        handleResetSearch();
    },
    onError: (err: any) => {
        toast({ title: 'Acceso Denegado', description: err.message, variant: 'destructive' });
    }
  });

  // Checkout
  const checkoutMutation = useMutation({
      mutationFn: async (id: string) => apiPatch(`/asistencias/checkout/${id}`),
      onSuccess: () => {
          toast({ title: 'Salida Registrada', variant: 'default' });
          queryClient.invalidateQueries({ queryKey: ['asistencias_activas'] });
      }
  });

  const handleResetSearch = () => {
      setSearchTerm('');
      setSelectedCliente(null);
      setMotivoForzado('');
      validateMutation.reset();
  }

  const handleSelectCliente = (c: any) => {
      setSelectedCliente(c);
      validateMutation.mutate(c.id);
  }

  const handleForzarIngreso = () => {
      if (!motivoForzado.trim()) {
          toast({ title: 'Falta Motivo', description: 'Debes escribir por qué estás forzando el acceso.', variant: 'destructive' });
          return;
      }
      setConfirmConfig({
          title: '¿Forzar Ingreso?',
          description: `Estás a punto de permitir el paso a ${selectedCliente.nombre} saltando las reglas del sistema. Esto quedará registrado en tu auditoría.`,
          onConfirm: () => checkinMutation.mutate({ forzar: true, motivo: motivoForzado })
      });
      setConfirmOpen(true);
  }

  const clientesList = clientes || [];
  const filteredClientes = useMemo(() => {
    if (!debouncedSearch) return [];
    const lower = debouncedSearch.toLowerCase();
    return clientesList.filter((c: any) => 
        c.nombre.toLowerCase().includes(lower) || 
        (c.numeroDocumento && c.numeroDocumento.includes(lower))
    ).slice(0, 10);
  }, [debouncedSearch, clientesList]);

  const activasList = activas || [];

  if (!token) return null;
  const isInvalidTenant = (!activeTenantId || activeTenantId === 'all') && !userSucursalId;

  return (
    <Protect permission="asistencias:leer" fallbackType="redirect">
      <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Control de Acceso</h2>
          <p className="text-zinc-500 mt-1">Registra las entradas y salidas de los miembros.</p>
        </div>

        {isInvalidTenant ? (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 text-amber-800 flex items-start gap-4">
              <Info className="w-6 h-6 shrink-0" />
              <div>
                  <h3 className="font-bold text-lg">Selecciona un Gimnasio/Sucursal</h3>
                  <p className="mt-1">Para operar el control de accesos, debes seleccionar el contexto de la sucursal en el menú superior izquierdo. (Modo SuperAdmin)</p>
              </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* PANEL IZQUIERDO: CHECK-IN */}
              <div className="lg:col-span-5 space-y-6">
                  <Card className="border-2 border-indigo-100 shadow-sm">
                      <CardHeader className="bg-indigo-50/50 pb-4 border-b border-indigo-50">
                          <CardTitle className="text-xl text-indigo-950 flex items-center gap-2">
                              <Play className="w-5 h-5 text-indigo-600" />
                              Registrar Ingreso
                          </CardTitle>
                          <CardDescription>Busca al cliente para validar su pase</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                          
                          {!selectedCliente ? (
                              <div className="space-y-4">
                                  <div className="relative">
                                      <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                                      <Input 
                                          placeholder="Buscar por Nombre o DNI..." 
                                          className="pl-10 py-6 text-lg bg-zinc-50 border-zinc-200 focus-visible:ring-indigo-500"
                                          value={searchTerm}
                                          onChange={(e) => setSearchTerm(e.target.value)}
                                      />
                                  </div>
                                  <div className="divide-y border rounded-lg overflow-hidden bg-white">
                                      {debouncedSearch && filteredClientes.length === 0 && (
                                          <div className="p-4 text-center text-zinc-500">No se encontraron clientes</div>
                                      )}
                                      {filteredClientes.map((c: any) => (
                                          <div 
                                              key={c.id}
                                              onClick={() => handleSelectCliente(c)}
                                              className="p-4 cursor-pointer hover:bg-indigo-50 transition-colors flex items-center justify-between"
                                          >
                                              <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 font-bold">
                                                      {c.nombre.charAt(0)}
                                                  </div>
                                                  <div>
                                                      <p className="font-bold text-zinc-900">{c.nombre}</p>
                                                      <p className="text-xs text-zinc-500">{c.numeroDocumento}</p>
                                                  </div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ) : (
                              <div className="space-y-6 animate-in slide-in-from-right-4">
                                  <div className="flex items-center gap-4">
                                      <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-2xl">
                                          {selectedCliente.nombre.charAt(0)}
                                      </div>
                                      <div>
                                          <p className="font-bold text-xl text-zinc-900">{selectedCliente.nombre}</p>
                                          <p className="text-sm text-zinc-500">{selectedCliente.numeroDocumento}</p>
                                      </div>
                                  </div>

                                  {/* SEMÁFORO */}
                                  {validateMutation.isPending ? (
                                      <div className="h-24 bg-zinc-100 animate-pulse rounded-xl"></div>
                                  ) : validateMutation.data ? (
                                      validateMutation.data.allowed ? (
                                          <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-5 text-emerald-900 space-y-4">
                                              <div className="flex items-center gap-3">
                                                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                                  <h3 className="font-bold text-xl">ACCESO PERMITIDO</h3>
                                              </div>
                                              <p className="text-emerald-700 font-medium">El cliente cumple con todas las reglas de su plan.</p>
                                              {validateMutation.data.tipoPlan === 'SESIONES' && (
                                                  <p className="text-sm bg-emerald-200/50 inline-block px-3 py-1 rounded-full font-bold">
                                                      Sesiones Restantes: {validateMutation.data.sesionesRestantes}
                                                  </p>
                                              )}
                                              <Button 
                                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-lg"
                                                  onClick={() => checkinMutation.mutate({ forzar: false })}
                                                  disabled={checkinMutation.isPending}
                                              >
                                                  {checkinMutation.isPending ? 'Registrando...' : 'Confirmar Ingreso'}
                                              </Button>
                                          </div>
                                      ) : (
                                          <div className="bg-red-50 border-2 border-red-500 rounded-xl p-5 text-red-900 space-y-4">
                                              <div className="flex items-center gap-3">
                                                  <Ban className="w-8 h-8 text-red-600" />
                                                  <h3 className="font-bold text-xl">ACCESO DENEGADO</h3>
                                              </div>
                                              <p className="text-red-700 font-bold text-lg">{validateMutation.data.reason}</p>
                                              
                                              <div className="pt-4 border-t border-red-200 space-y-3">
                                                  <p className="text-sm font-semibold text-red-800">Cortesía / Forzar Ingreso</p>
                                                  <Input 
                                                      placeholder="Motivo de la excepción (Obligatorio)..." 
                                                      className="bg-white border-red-300 focus-visible:ring-red-500"
                                                      value={motivoForzado}
                                                      onChange={(e) => setMotivoForzado(e.target.value)}
                                                  />
                                                  <Button 
                                                      variant="destructive" 
                                                      className="w-full font-bold"
                                                      onClick={handleForzarIngreso}
                                                      disabled={checkinMutation.isPending}
                                                  >
                                                      Forzar Ingreso Bajo mi Responsabilidad
                                                  </Button>
                                              </div>
                                          </div>
                                      )
                                  ) : null}

                                  <Button variant="ghost" className="w-full text-zinc-500" onClick={handleResetSearch}>
                                      Cancelar / Buscar otro cliente
                                  </Button>
                              </div>
                          )}

                      </CardContent>
                  </Card>
              </div>

              {/* PANEL DERECHO: LISTA DE ADENTRO */}
              <div className="lg:col-span-7">
                  <Card className="h-full border-zinc-200 shadow-sm">
                      <CardHeader className="pb-4 border-b border-zinc-100 flex flex-row justify-between items-center">
                          <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                  <UserCheck className="w-5 h-5 text-emerald-500" />
                                  Personas en las Instalaciones
                              </CardTitle>
                              <CardDescription>Clientes que han hecho Check-In hoy.</CardDescription>
                          </div>
                          <div className="bg-zinc-100 text-zinc-600 font-bold px-4 py-1.5 rounded-full text-sm">
                              {activasList.length} Adentro
                          </div>
                      </CardHeader>
                      <CardContent className="p-0">
                          {loadingActivas ? (
                              <div className="p-8 text-center text-zinc-400">Cargando...</div>
                          ) : activasList.length === 0 ? (
                              <div className="p-12 text-center text-zinc-400 flex flex-col items-center">
                                  <UserX className="w-12 h-12 mb-3 text-zinc-300" />
                                  <p className="font-medium">El gimnasio está vacío.</p>
                              </div>
                          ) : (
                              <div className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto">
                                  {activasList.map((a: any) => (
                                      <div key={a.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                                          <div className="flex items-center gap-4">
                                              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                                                  {a.cliente?.nombre?.charAt(0) || 'V'}
                                              </div>
                                              <div>
                                                  <p className="font-bold text-zinc-900">{a.cliente?.nombre || a.nombreVisitante}</p>
                                                  <div className="flex gap-3 text-xs text-zinc-500 font-medium mt-0.5">
                                                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Ingreso: {new Date(a.fechaHoraIngreso).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                      <span className="text-indigo-600">{a.membresia?.plan?.nombre || 'Pase/Cortesía'}</span>
                                                  </div>
                                              </div>
                                          </div>
                                          <Button 
                                              variant="outline" 
                                              size="sm" 
                                              onClick={() => checkoutMutation.mutate(a.id)}
                                              disabled={checkoutMutation.isPending}
                                              className="border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                                          >
                                              Checkout
                                          </Button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </CardContent>
                  </Card>
              </div>

          </div>
        )}
        
        <GlobalConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmConfig.title}
          description={confirmConfig.description}
          onConfirm={confirmConfig.onConfirm}
          isDestructive={true}
        />
      </div>
    </Protect>
  );
}
