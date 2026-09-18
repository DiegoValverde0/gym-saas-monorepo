"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Receipt, Plus, Edit, Trash2, Search, ArchiveRestore, Repeat, Sparkles, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

const CATEGORIAS_EGRESO = [
  { label: 'Alquiler', value: 'ALQUILER' },
  { label: 'Servicios Básicos', value: 'SERVICIOS_BASICOS' },
  { label: 'Nómina', value: 'NOMINA' },
  { label: 'Insumos', value: 'INSUMOS' },
  { label: 'Mantenimiento', value: 'MANTENIMIENTO' },
  { label: 'Impuestos', value: 'IMPUESTOS' },
  { label: 'Otro Gasto', value: 'OTRO_GASTO' },
];

const METODOS_PAGO = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'QR', value: 'QR' },
  { label: 'Pago Móvil', value: 'PAGO_MOVIL' },
  { label: 'Otro', value: 'OTRO' },
];

interface Proveedor {
  id: string;
  nombre: string;
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface CuentaBancaria {
  id: string;
  banco: string;
  numeroCuenta: string;
}

interface Gasto {
  id: string;
  tipo: string;
  proveedorId?: string | null;
  beneficiario?: string | null;
  montoTotal: number | string;
  fechaHora: string;
  proveedor?: { nombre: string };
  sucursal?: { nombre: string };
  detalles?: { tipoConcepto: string; descripcionLibre?: string | null }[];
}

interface GastoFormValues {
  sucursalId: string;
  proveedorId: string;
  beneficiario: string;
  tipoConcepto: string;
  descripcion: string;
  monto: number | string;
  metodoPago: string;
  cuentaBancariaId: string;
}

interface GastoPlantilla {
  id: string;
  sucursalId: string;
  proveedorId?: string | null;
  beneficiario?: string | null;
  tipoConcepto: string;
  descripcion?: string | null;
  monto: number | string;
  metodoPago: string;
  cuentaBancariaId: string;
  diaDelMes: number;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
  activa: boolean;
  proveedor?: { nombre: string };
  sucursal?: { nombre: string };
  cuentaBancaria?: { banco: string; numeroCuenta: string };
}

interface GastoPlantillaFormValues {
  sucursalId: string;
  proveedorId: string;
  beneficiario: string;
  tipoConcepto: string;
  descripcion: string;
  monto: number | string;
  metodoPago: string;
  cuentaBancariaId: string;
  diaDelMes: number | string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  activa: boolean;
}

const dateInputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const gastoSchema = z.object({
  sucursalId: z.string().optional(),
  proveedorId: z.string().optional(),
  beneficiario: z.string().optional(),
  tipoConcepto: z.string().min(1, 'Selecciona una categoría'),
  descripcion: z.string().optional(),
  monto: z.union([z.string(), z.number()]).refine((v) => Number(v) > 0, 'El monto debe ser mayor a 0'),
  metodoPago: z.string().min(1, 'Selecciona un método de pago'),
  cuentaBancariaId: z.string().min(1, 'Selecciona una cuenta o caja destino'),
});

const gastoPlantillaSchema = gastoSchema.extend({
  diaDelMes: z.union([z.string(), z.number()]).refine((v) => Number(v) >= 1 && Number(v) <= 31, 'Debe ser un día entre 1 y 31'),
  vigenciaDesde: z.string().min(1, 'Selecciona la fecha de inicio'),
  vigenciaHasta: z.string().optional(),
  activa: z.boolean().optional(),
});

export default function GastosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const userSucursalId = user?.sucursalId;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const form = useForm<GastoFormValues>({
    resolver: zodResolver(gastoSchema) as any,
    defaultValues: {
      sucursalId: userSucursalId || '',
      proveedorId: '',
      beneficiario: '',
      tipoConcepto: '',
      descripcion: '',
      monto: '',
      metodoPago: 'EFECTIVO',
      cuentaBancariaId: '',
    },
  });

  const { data: gastos, isLoading } = useQuery({
    queryKey: ['gastos', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/transacciones?tipo=EGRESO')),
    enabled: !!token,
  });

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/proveedores')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const { data: cuentas } = useQuery({
    queryKey: ['cuentas', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/cuentas-bancarias')),
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: GastoFormValues) => {
      const monto = Number(values.monto);
      const payload: Record<string, unknown> = {
        sucursalId: userSucursalId || values.sucursalId || undefined,
        tipo: 'EGRESO',
        proveedorId: values.proveedorId || undefined,
        beneficiario: values.beneficiario || undefined,
        montoTotal: monto,
        detalles: [
          {
            tipoConcepto: values.tipoConcepto,
            descripcionLibre: values.descripcion || undefined,
            cantidad: 1,
            precioUnitario: monto,
            subtotal: monto,
          },
        ],
        pagos: [{ metodoPago: values.metodoPago, monto, cuentaBancariaId: values.cuentaBancariaId }],
      };
      return apiPost('/transacciones', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Gasto registrado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleAddNew = () => {
    form.reset({
      sucursalId: userSucursalId || '',
      proveedorId: '',
      beneficiario: '',
      tipoConcepto: '',
      descripcion: '',
      monto: '',
      metodoPago: 'EFECTIVO',
      cuentaBancariaId: '',
    });
    setIsDialogOpen(true);
  };

  // ---- Gastos recurrentes (mensuales): mismo concepto que las plantillas de
  // turno/clase, pero sin proyección hacia adelante -- ver gasto-plantilla.service.ts.
  const [isPlantillaDialogOpen, setIsPlantillaDialogOpen] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<GastoPlantilla | null>(null);
  const [showDeletedPlantillas, setShowDeletedPlantillas] = useState(false);
  const [confirmPlantillaConfig, setConfirmPlantillaConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmPlantillaOpen, setConfirmPlantillaOpen] = useState(false);

  const plantillaForm = useForm<GastoPlantillaFormValues>({
    resolver: zodResolver(gastoPlantillaSchema) as any,
    defaultValues: {
      sucursalId: userSucursalId || '',
      proveedorId: '',
      beneficiario: '',
      tipoConcepto: '',
      descripcion: '',
      monto: '',
      metodoPago: 'TRANSFERENCIA',
      cuentaBancariaId: '',
      diaDelMes: 1,
      vigenciaDesde: new Date().toISOString().split('T')[0],
      vigenciaHasta: '',
      activa: true,
    },
  });

  const { data: plantillas, isLoading: isLoadingPlantillas } = useQuery({
    queryKey: ['gastos-plantilla', activeTenantId, showDeletedPlantillas],
    queryFn: async () => unwrapList(await apiGet(showDeletedPlantillas ? '/gastos-plantilla?deleted=true' : '/gastos-plantilla')),
    enabled: !!token,
  });

  const savePlantillaMutation = useMutation({
    mutationFn: async (values: GastoPlantillaFormValues) => {
      const payload: Record<string, unknown> = {
        sucursalId: userSucursalId || values.sucursalId,
        proveedorId: values.proveedorId || undefined,
        beneficiario: values.beneficiario || undefined,
        tipoConcepto: values.tipoConcepto,
        descripcion: values.descripcion || undefined,
        monto: Number(values.monto),
        metodoPago: values.metodoPago,
        cuentaBancariaId: values.cuentaBancariaId,
        diaDelMes: Number(values.diaDelMes),
        vigenciaDesde: values.vigenciaDesde,
        activa: values.activa,
      };
      // Enviar explícitamente `null` (no omitir la clave) cuando se limpia el
      // campo, para que un PATCH pueda borrar una vigenciaHasta existente en
      // vez de dejarla intacta -- mismo patrón que el bug de `correo` en clientes.
      payload.vigenciaHasta = values.vigenciaHasta || null;
      return editingPlantilla
        ? apiPatch(`/gastos-plantilla/${editingPlantilla.id}`, payload)
        : apiPost('/gastos-plantilla', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-plantilla'] });
      setIsPlantillaDialogOpen(false);
      plantillaForm.reset();
      toast({ title: 'Éxito', description: 'Gasto recurrente guardado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem: deletePlantilla, restoreItem: restorePlantilla, isRestoring: isRestoringPlantilla } = useSoftDelete({
    queryKey: ['gastos-plantilla', activeTenantId, showDeletedPlantillas],
    endpoint: 'gastos-plantilla',
    modelName: 'gastoPlantilla',
    itemName: 'El gasto recurrente',
  });

  const generarMutation = useMutation({
    mutationFn: async () => apiPost('/gastos-plantilla/generar', {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      const creados = data?.gastosGenerados ?? 0;
      toast({
        title: 'Gastos generados',
        description: creados > 0
          ? `Se registraron ${creados} gasto(s) recurrentes que correspondían al día de hoy.`
          : 'Ninguna plantilla activa correspondía generarse hoy, o ya se generó el gasto de este mes.',
        variant: 'success',
      });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleAddNewPlantilla = () => {
    setEditingPlantilla(null);
    plantillaForm.reset({
      sucursalId: userSucursalId || '',
      proveedorId: '',
      beneficiario: '',
      tipoConcepto: '',
      descripcion: '',
      monto: '',
      metodoPago: 'TRANSFERENCIA',
      cuentaBancariaId: '',
      diaDelMes: 1,
      vigenciaDesde: new Date().toISOString().split('T')[0],
      vigenciaHasta: '',
      activa: true,
    });
    setIsPlantillaDialogOpen(true);
  };

  const handleEditPlantilla = (plantilla: GastoPlantilla) => {
    setEditingPlantilla(plantilla);
    plantillaForm.reset({
      sucursalId: plantilla.sucursalId,
      proveedorId: plantilla.proveedorId || '',
      beneficiario: plantilla.beneficiario || '',
      tipoConcepto: plantilla.tipoConcepto,
      descripcion: plantilla.descripcion || '',
      monto: plantilla.monto,
      metodoPago: plantilla.metodoPago,
      cuentaBancariaId: plantilla.cuentaBancariaId,
      diaDelMes: plantilla.diaDelMes,
      vigenciaDesde: plantilla.vigenciaDesde ? new Date(plantilla.vigenciaDesde).toISOString().split('T')[0] : '',
      vigenciaHasta: plantilla.vigenciaHasta ? new Date(plantilla.vigenciaHasta).toISOString().split('T')[0] : '',
      activa: plantilla.activa,
    });
    setIsPlantillaDialogOpen(true);
  };

  const handleDeletePlantilla = (id: string) => {
    setConfirmPlantillaConfig({
      title: '¿Eliminar gasto recurrente?',
      description: 'No borra los gastos ya generados, solo detiene nuevas generaciones. Podrás deshacerlo en los próximos segundos.',
      onConfirm: () => deletePlantilla(id),
    });
    setConfirmPlantillaOpen(true);
  };

  const handleDeleteGasto = () => {
    toast({
      title: 'No disponible',
      description: 'Un gasto ya registrado no se puede anular desde acá -- afecta saldos contables ya movidos. Contacta a soporte si necesitas revertirlo.',
      variant: 'destructive',
    });
  };

  if (!token) return null;

  const proveedoresList = unwrapList(proveedores) as Proveedor[];
  const cuentasList = unwrapList(cuentas) as CuentaBancaria[];
  const gastosList = (unwrapList(gastos) as Gasto[]).filter((g) => {
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return (g.beneficiario || g.proveedor?.nombre || '').toLowerCase().includes(lower);
  });
  const plantillaList = unwrapList(plantillas) as GastoPlantilla[];

  const labelCategoria = (value: string) => CATEGORIAS_EGRESO.find((c) => c.value === value)?.label || value;

  const proveedorOptions = [{ label: 'Sin proveedor (beneficiario libre)', value: '' }, ...proveedoresList.map((p) => ({ label: p.nombre, value: p.id }))];
  const cuentaOptions = cuentasList.map((c) => ({ label: `${c.banco} - ${c.numeroCuenta}`, value: c.id }));

  return (
    <Protect permission="transacciones:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Gastos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Alquiler, servicios, nómina, insumos y cualquier egreso del negocio.</p>
        </div>

        <Tabs defaultValue="gastos" className="w-full">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="gastos" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
              <Receipt className="h-4 w-4 mr-1.5" /> Gastos
            </TabsTrigger>
            <TabsTrigger value="plantillas" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
              <Repeat className="h-4 w-4 mr-1.5" /> Gastos recurrentes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gastos" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                Gastos puntuales. Para alquiler, nómina o suscripciones que se repiten cada mes, definilos una vez en
                &quot;Gastos recurrentes&quot;.
              </p>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar por beneficiario..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
                  />
                </div>

                <Protect permission="transacciones:crear" fallbackType="hide">
                  <TenantRequiredButton onClick={handleAddNew} icon={<Plus className="mr-2 h-4 w-4" />} label="Nuevo Gasto" />
                </Protect>
              </div>
            </div>

            {isLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
              </div>
            ) : gastosList.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
                  <Receipt className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {searchTerm ? 'Ningún gasto coincide con la búsqueda' : 'No hay gastos registrados'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {searchTerm ? 'Prueba con otro nombre.' : 'Registra el primer gasto del negocio.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beneficiario</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastosList.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{g.proveedor?.nombre || g.beneficiario || 'Sin especificar'}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{labelCategoria(g.detalles?.[0]?.tipoConcepto || '')}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{g.sucursal?.nombre}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(g.fechaHora).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-rose-600 dark:text-rose-400">- ${Number(g.montoTotal).toFixed(2)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Protect permission="transacciones:eliminar" fallbackType="hide">
                          <Button variant="ghost" size="icon" onClick={handleDeleteGasto} className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Protect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="plantillas" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                Define un gasto que se repite cada mes (alquiler, nómina, suscripciones). El sistema lo registra solo el día
                que corresponde -- nunca por adelantado.
              </p>

              <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
                <PapeleraToggle showDeleted={showDeletedPlantillas} setShowDeleted={setShowDeletedPlantillas} />

                <Protect permission="transacciones:crear" fallbackType="hide">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-1 pr-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Revisa tus plantillas activas y, si hoy es el día del mes que le corresponde a alguna y todavía no se
                          generó su gasto de este mes, lo registra ahora. Esto mismo corre automáticamente todas las noches;
                          el botón es para no esperar hasta entonces.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Button
                      variant="outline"
                      onClick={() => generarMutation.mutate()}
                      disabled={generarMutation.isPending}
                      className="border-none shadow-none text-indigo-700 dark:text-indigo-400"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {generarMutation.isPending ? 'Generando...' : 'Generar gastos del mes ahora'}
                    </Button>
                  </div>
                </Protect>

                <Protect permission="transacciones:crear" fallbackType="hide">
                  <TenantRequiredButton onClick={handleAddNewPlantilla} icon={<Plus className="mr-2 h-4 w-4" />} label="Nuevo Gasto Recurrente" />
                </Protect>
              </div>
            </div>

            {isLoadingPlantillas ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex justify-center">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
              </div>
            ) : plantillaList.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
                  <Repeat className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-slate-900 dark:text-white">No hay gastos recurrentes registrados</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Ej. &quot;Alquiler, día 5 de cada mes&quot; o &quot;Internet, día 10 de cada mes&quot;.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beneficiario</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Día del mes</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillaList.map((p) => (
                    <TableRow key={p.id} className={showDeletedPlantillas ? 'bg-rose-50/40 dark:bg-rose-500/20 opacity-80' : ''}>
                      <TableCell>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.proveedor?.nombre || p.beneficiario || 'Sin especificar'}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{labelCategoria(p.tipoConcepto)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">Día {p.diaDelMes}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-rose-600 dark:text-rose-400">- ${Number(p.monto).toFixed(2)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{p.cuentaBancaria?.banco}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.activa ? 'success' : 'outline'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {showDeletedPlantillas ? (
                            <Protect permission="sistema:restaurar">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => restorePlantilla(p.id)}
                                disabled={isRestoringPlantilla}
                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                              >
                                <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                              </Button>
                            </Protect>
                          ) : (
                            <>
                              <Protect permission="transacciones:actualizar" fallbackType="hide">
                                <Button variant="ghost" size="icon" onClick={() => handleEditPlantilla(p)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Protect>
                              <Protect permission="transacciones:eliminar" fallbackType="hide">
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePlantilla(p.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </Protect>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Nuevo Gasto"
        description="Registra un egreso puntual del negocio."
        form={form as any}
        sections={[
          {
            fields: [
              { name: 'tipoConcepto', label: 'Categoría', type: 'select', options: CATEGORIAS_EGRESO, colSpan: 2 },
              { name: 'proveedorId', label: 'Proveedor (Opcional)', type: 'select', options: proveedorOptions },
              { name: 'beneficiario', label: 'Beneficiario (si no hay proveedor)', type: 'text', placeholder: 'Ej. Ferretería El Tornillo' },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: (unwrapList(sucursales) as Sucursal[]).map((s) => ({ label: s.nombre, value: s.id })),
                    colSpan: 2 as const,
                  }]
                : []),
              { name: 'monto', label: 'Monto', type: 'number', allowDecimals: true },
              { name: 'metodoPago', label: 'Método de Pago', type: 'select', options: METODOS_PAGO },
              { name: 'cuentaBancariaId', label: 'Cuenta / Caja Destino', type: 'select', options: cuentaOptions, colSpan: 2 },
              { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={saveMutation.mutateAsync as any}
        isPending={saveMutation.isPending}
        submitLabel="Registrar Gasto"
      />

      <GlobalFormModal
        open={isPlantillaDialogOpen}
        onOpenChange={setIsPlantillaDialogOpen}
        title={editingPlantilla ? 'Editar Gasto Recurrente' : 'Nuevo Gasto Recurrente'}
        description={editingPlantilla ? 'Ajusta el monto, día o cuenta de este gasto mensual.' : 'Define un egreso que se repite cada mes.'}
        form={plantillaForm as any}
        sections={[
          {
            fields: [
              { name: 'tipoConcepto', label: 'Categoría', type: 'select', options: CATEGORIAS_EGRESO, colSpan: 2 },
              { name: 'proveedorId', label: 'Proveedor (Opcional)', type: 'select', options: proveedorOptions },
              { name: 'beneficiario', label: 'Beneficiario (si no hay proveedor)', type: 'text', placeholder: 'Ej. Arrendador' },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: (unwrapList(sucursales) as Sucursal[]).map((s) => ({ label: s.nombre, value: s.id })),
                    colSpan: 2 as const,
                  }]
                : []),
              { name: 'monto', label: 'Monto Mensual', type: 'number', allowDecimals: true },
              { name: 'metodoPago', label: 'Método de Pago', type: 'select', options: METODOS_PAGO },
              { name: 'cuentaBancariaId', label: 'Cuenta / Caja Destino', type: 'select', options: cuentaOptions, colSpan: 2 },
              {
                name: 'diaDelMes',
                label: 'Día del Mes',
                type: 'number',
                description: 'Si el mes no llega a ese día (ej. 31 en febrero), se genera el último día del mes.',
              },
              {
                name: 'activa',
                label: 'Estado',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Gasto recurrente activo</label>
                    <div className="flex items-center h-10">
                      <Switch checked={f.watch('activa')} onCheckedChange={(c: boolean) => f.setValue('activa', c, { shouldDirty: true })} />
                    </div>
                  </div>
                ),
              },
              {
                name: 'vigenciaDesde',
                label: 'Vigente desde',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vigente desde</label>
                    <input type="date" {...f.register('vigenciaDesde')} className={dateInputClass} />
                  </div>
                ),
              },
              {
                name: 'vigenciaHasta',
                label: 'Vigente hasta (Opcional)',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vigente hasta (Opcional)</label>
                    <input type="date" {...f.register('vigenciaHasta')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={savePlantillaMutation.mutateAsync as any}
        isPending={savePlantillaMutation.isPending}
        submitLabel="Guardar Gasto Recurrente"
      />

      <GlobalConfirmDialog
        open={confirmPlantillaOpen}
        onOpenChange={setConfirmPlantillaOpen}
        title={confirmPlantillaConfig.title}
        description={confirmPlantillaConfig.description}
        onConfirm={confirmPlantillaConfig.onConfirm}
        isDestructive={true}
      />
    </Protect>
  );
}
