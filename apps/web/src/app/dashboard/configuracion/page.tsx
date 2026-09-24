"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPut } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building, Settings, Globe, Briefcase, Mail, Phone, DollarSign, Clock, Layers, Users, CheckCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

const organizacionSchema = z.object({
  nombre: z.string().min(3, "El nombre debe tener al menos 3 caracteres").max(150),
  razonSocial: z.string().max(200).optional().or(z.literal('')),
  identificacionFiscal: z.string().max(50).optional().or(z.literal('')),
  telefono: z.string().max(30).optional().or(z.literal('')),
  emailContacto: z.string().email("Correo inválido").max(150).optional().or(z.literal('')),
  moneda: z.string().length(3, "La moneda debe ser un código de 3 letras").optional(),
  zonaHoraria: z.string().max(50).optional(),
  configuracion: z.object({
    modulos: z.object({
      puntoVenta: z.boolean(),
      clasesGrupales: z.boolean(),
      controlPersonal: z.boolean(),
      reportesAvanzados: z.boolean(),
      controlGastos: z.boolean(),
    }),
    requerimientosCliente: z.object({
      exigirDni: z.boolean(),
      exigirCorreo: z.boolean(),
      exigirTelefono: z.boolean(),
      exigirHuella: z.boolean(),
    }),
    requerimientosClase: z.object({
      exigirTurnoEntrenador: z.boolean(),
    }),
    preferenciasOperativas: z.object({
      renovacionAutomaticaPlanes: z.boolean(),
      impresionTickets: z.string(),
      notificacionesWhatsapp: z.boolean(),
    })
  })
});

type OrganizacionFormValues = z.infer<typeof organizacionSchema>;

export default function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();

  const { data: organizacion, isLoading, isError } = useQuery({
    queryKey: ['organizacion'],
    queryFn: async () => apiGet('/organizaciones/me/info'),
    enabled: !!token,
  });

  const form = useForm<OrganizacionFormValues>({
    resolver: zodResolver(organizacionSchema),
    values: organizacion ? {
      nombre: (organizacion as any).nombre || '',
      razonSocial: (organizacion as any).razonSocial || '',
      identificacionFiscal: (organizacion as any).identificacionFiscal || '',
      telefono: (organizacion as any).telefono || '',
      emailContacto: (organizacion as any).emailContacto || '',
      moneda: (organizacion as any).moneda || 'BOB',
      zonaHoraria: (organizacion as any).zonaHoraria || 'America/La_Paz',
      configuracion: {
        modulos: {
          puntoVenta: (organizacion as any).configuracion?.modulos?.puntoVenta ?? true,
          clasesGrupales: (organizacion as any).configuracion?.modulos?.clasesGrupales ?? false,
          controlPersonal: (organizacion as any).configuracion?.modulos?.controlPersonal ?? false,
          reportesAvanzados: (organizacion as any).configuracion?.modulos?.reportesAvanzados ?? true,
          controlGastos: (organizacion as any).configuracion?.modulos?.controlGastos ?? false,
        },
        requerimientosCliente: {
          exigirDni: (organizacion as any).configuracion?.requerimientosCliente?.exigirDni ?? false,
          exigirCorreo: (organizacion as any).configuracion?.requerimientosCliente?.exigirCorreo ?? false,
          exigirTelefono: (organizacion as any).configuracion?.requerimientosCliente?.exigirTelefono ?? false,
          exigirHuella: (organizacion as any).configuracion?.requerimientosCliente?.exigirHuella ?? false,
        },
        requerimientosClase: {
          exigirTurnoEntrenador: (organizacion as any).configuracion?.requerimientosClase?.exigirTurnoEntrenador ?? false,
        },
        preferenciasOperativas: {
          renovacionAutomaticaPlanes: (organizacion as any).configuracion?.preferenciasOperativas?.renovacionAutomaticaPlanes ?? true,
          impresionTickets: (organizacion as any).configuracion?.preferenciasOperativas?.impresionTickets ?? 'NINGUNA',
          notificacionesWhatsapp: (organizacion as any).configuracion?.preferenciasOperativas?.notificacionesWhatsapp ?? false,
        }
      }
    } : undefined,
    defaultValues: {
      nombre: '',
      razonSocial: '',
      identificacionFiscal: '',
      telefono: '',
      emailContacto: '',
      moneda: 'BOB',
      zonaHoraria: 'America/La_Paz',
      configuracion: {
        modulos: {
          puntoVenta: true,
          clasesGrupales: false,
          controlPersonal: false,
          reportesAvanzados: true,
          controlGastos: false,
        },
        requerimientosCliente: {
          exigirDni: false,
          exigirCorreo: false,
          exigirTelefono: false,
          exigirHuella: false,
        },
        requerimientosClase: {
          exigirTurnoEntrenador: false,
        },
        preferenciasOperativas: {
          renovacionAutomaticaPlanes: true,
          impresionTickets: 'NINGUNA',
          notificacionesWhatsapp: false,
        }
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: OrganizacionFormValues) => apiPut('/organizaciones/me/info', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizacion'] });
      toast({
        title: 'Organización actualizada',
        description: 'Los cambios se han guardado correctamente.',
        variant: 'success'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al actualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: OrganizacionFormValues) => {
    updateMutation.mutate(values);
  };

  if (!token) return null;
  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-4 bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50">
        No se pudo cargar la información de la organización.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 pb-12">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Configuración Global</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Administra los datos comerciales, módulos activos y políticas de tu franquicia o gimnasio.
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-8">
        <Tabs defaultValue="empresa" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-slate-100 dark:bg-slate-800 p-1 mb-8">
            <TabsTrigger value="empresa" className="data-[state=active]:bg-white dark:bg-slate-900 data-[state=active]:shadow-sm">Perfil</TabsTrigger>
            <TabsTrigger value="modulos" className="data-[state=active]:bg-white dark:bg-slate-900 data-[state=active]:shadow-sm">Módulos</TabsTrigger>
            <TabsTrigger value="politicas" className="data-[state=active]:bg-white dark:bg-slate-900 data-[state=active]:shadow-sm">Políticas</TabsTrigger>
          </TabsList>
          
          <TabsContent value="empresa" className="space-y-6 mt-4">
            {/* Datos Generales / Comerciales */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <Building className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Datos Comerciales
                </CardTitle>
                <CardDescription>
                  Información de contacto y nombre comercial de tu gimnasio.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="nombre" className="font-semibold text-slate-700 dark:text-slate-300">Nombre de la Organización / Marca</Label>
                  <Input
                    id="nombre"
                    placeholder={isLoading ? "Cargando..." : "Ej. Gym Manager Fitness"}
                    {...form.register('nombre')}
                    disabled={isLoading || updateMutation.isPending}
                    className="max-w-md bg-slate-50 dark:bg-slate-900 focus-visible:ring-indigo-500"
                  />
                  {form.formState.errors.nombre && (
                    <p className="text-sm text-red-500 dark:text-red-400">{form.formState.errors.nombre.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="telefono" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Teléfono
                  </Label>
                  <Input
                    id="telefono"
                    placeholder="Ej. +591 71234567"
                    {...form.register('telefono')}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emailContacto" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Correo de Contacto
                  </Label>
                  <Input
                    id="emailContacto"
                    type="email"
                    placeholder="contacto@gym.com"
                    {...form.register('emailContacto')}
                    disabled={isLoading || updateMutation.isPending}
                  />
                  {form.formState.errors.emailContacto && (
                    <p className="text-sm text-red-500 dark:text-red-400">{form.formState.errors.emailContacto.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Datos Fiscales */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <Briefcase className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Datos Fiscales y Legales
                </CardTitle>
                <CardDescription>
                  Información utilizada para facturación y recibos oficiales.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="razonSocial" className="font-semibold text-slate-700 dark:text-slate-300">Razón Social</Label>
                  <Input
                    id="razonSocial"
                    placeholder="Ej. Inversiones Fitness SRL"
                    {...form.register('razonSocial')}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="identificacionFiscal" className="font-semibold text-slate-700 dark:text-slate-300">NIT / Identificación Fiscal</Label>
                  <Input
                    id="identificacionFiscal"
                    placeholder="Ej. 12345678013"
                    {...form.register('identificacionFiscal')}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Regionalización */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <Globe className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Regionalización
                </CardTitle>
                <CardDescription>
                  Ajustes de moneda y zona horaria para reportes y pagos.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="moneda" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Moneda
                  </Label>
                  <Input
                    id="moneda"
                    placeholder="Ej. BOB, USD, MXN"
                    {...form.register('moneda')}
                    disabled={isLoading || updateMutation.isPending}
                    className="uppercase"
                    maxLength={3}
                  />
                  {form.formState.errors.moneda && (
                    <p className="text-sm text-red-500 dark:text-red-400">{form.formState.errors.moneda.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zonaHoraria" className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Zona Horaria
                  </Label>
                  <Input
                    id="zonaHoraria"
                    placeholder="Ej. America/La_Paz"
                    {...form.register('zonaHoraria')}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modulos" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <Layers className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Módulos Activos
                </CardTitle>
                <CardDescription>
                  Enciende o apaga partes del sistema según las necesidades de tu gimnasio.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-slate-900 dark:text-white">Punto de Venta e Inventario</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Activa las funciones de cajas, productos y ventas de artículos sueltos.</p>
                  </div>
                  <Switch 
                    checked={form.watch('configuracion.modulos.puntoVenta')} 
                    onCheckedChange={(c) => form.setValue('configuracion.modulos.puntoVenta', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-slate-900 dark:text-white">Clases Grupales y Disciplinas</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Permite gestionar horarios, entrenadores y capacidad para clases de zumba, spinning, etc.</p>
                  </div>
                  <Switch 
                    checked={form.watch('configuracion.modulos.clasesGrupales')} 
                    onCheckedChange={(c) => form.setValue('configuracion.modulos.clasesGrupales', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-slate-900 dark:text-white">Control de Personal</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Habilita la gestión de asistencias, turnos laborales y permisos para tus empleados.</p>
                  </div>
                  <Switch 
                    checked={form.watch('configuracion.modulos.controlPersonal')} 
                    onCheckedChange={(c) => form.setValue('configuracion.modulos.controlPersonal', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-slate-900 dark:text-white">Reportes Avanzados</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Activa proyecciones financieras y métricas complejas en el panel de inicio.</p>
                  </div>
                  <Switch
                    checked={form.watch('configuracion.modulos.reportesAvanzados')}
                    onCheckedChange={(c) => form.setValue('configuracion.modulos.reportesAvanzados', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-slate-900 dark:text-white">Control de Gastos</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Habilita el catálogo de proveedores y el registro de gastos puntuales y recurrentes (alquiler, nómina, servicios).</p>
                  </div>
                  <Switch
                    checked={form.watch('configuracion.modulos.controlGastos')}
                    onCheckedChange={(c) => form.setValue('configuracion.modulos.controlGastos', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="politicas" className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <ShieldCheck className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Políticas de Registro de Clientes
                </CardTitle>
                <CardDescription>
                  Define qué datos son estrictamente obligatorios al inscribir a una nueva persona.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2">
                <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                  <Switch 
                    checked={form.watch('configuracion.requerimientosCliente.exigirDni')} 
                    onCheckedChange={(c) => form.setValue('configuracion.requerimientosCliente.exigirDni', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label className="font-medium text-slate-900 dark:text-white">Exigir Carnet / NIT</Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Si está inactivo, se pueden crear clientes anónimos fiscalmente.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                  <Switch 
                    checked={form.watch('configuracion.requerimientosCliente.exigirCorreo')} 
                    onCheckedChange={(c) => form.setValue('configuracion.requerimientosCliente.exigirCorreo', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label className="font-medium text-slate-900 dark:text-white">Exigir Correo Electrónico</Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Útil para enviar recibos. Se puede desactivar para gimnasios de barrio.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                  <Switch 
                    checked={form.watch('configuracion.requerimientosCliente.exigirTelefono')} 
                    onCheckedChange={(c) => form.setValue('configuracion.requerimientosCliente.exigirTelefono', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label className="font-medium text-slate-900 dark:text-white">Exigir Teléfono Celular</Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Obliga a tener un medio de contacto rápido.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 opacity-60">
                  <Switch 
                    checked={form.watch('configuracion.requerimientosCliente.exigirHuella')} 
                    onCheckedChange={(c) => form.setValue('configuracion.requerimientosCliente.exigirHuella', c, { shouldDirty: true })}
                    disabled={true} // Desactivado por ahora hasta integrar molinete
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label className="font-medium text-slate-900 dark:text-white">Exigir Huella / Biometría</Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Requiere enrolar la huella antes de habilitar planes. (Próximamente)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900 rounded-t-xl border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800 dark:text-slate-100">
                  <Clock className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Políticas de Programación de Clases
                </CardTitle>
                <CardDescription>
                  Define qué tan estricta es la validación entre los turnos de tus entrenadores y las clases que se programan.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid gap-4 grid-cols-1">
                <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                  <Switch
                    checked={form.watch('configuracion.requerimientosClase.exigirTurnoEntrenador')}
                    onCheckedChange={(c) => form.setValue('configuracion.requerimientosClase.exigirTurnoEntrenador', c, { shouldDirty: true })}
                    disabled={isLoading || updateMutation.isPending}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label className="font-medium text-slate-900 dark:text-white">Exigir turno registrado para programar una clase</Label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Si está inactivo (recomendado para gimnasios pequeños), solo se muestra una advertencia cuando el entrenador
                      no tiene turno en ese horario, pero la clase se puede guardar igual. Actívalo en franquicias donde la cobertura
                      de turnos debe ser estricta: bloqueará el guardado hasta asignar un turno al entrenador en ese horario.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end sticky bottom-6 z-10 bg-white dark:bg-slate-900/80 backdrop-blur-sm p-4 -mx-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Button 
            type="submit" 
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 rounded-full px-8 font-bold"
            disabled={updateMutation.isPending || isLoading || !form.formState.isDirty}
          >
            {updateMutation.isPending ? 'Guardando Cambios...' : 'Guardar Configuración'}
          </Button>
        </div>
      </form>
    </div>
  );
}
