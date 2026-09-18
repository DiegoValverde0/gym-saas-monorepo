import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, ArrowLeft, Save, CalendarClock } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const planSchema = z.object({
  nombre: z.string({ message: "El nombre es obligatorio" }).min(3, "Mínimo 3 caracteres"),
  tipoPlan: z.enum(['TIEMPO', 'SESIONES', 'VISITA']),
  duracionDias: z.coerce.number().min(1).optional().or(z.literal('')),
  limiteDiasSemana: z.coerce.number().optional().or(z.literal('')),
  diasPermitidos: z.array(z.number()).default([]),
  cantidadSesiones: z.coerce.number().optional().or(z.literal('')),
  horaInicioAcceso: z.string().optional(),
  horaFinAcceso: z.string().optional(),
  esRenovableAutomaticamente: z.boolean().default(false),
  precio: z.coerce.number().min(0, "El precio no puede ser negativo"),
  estado: z.string().default('ACTIVO'),
});

type PlanFormValues = z.infer<typeof planSchema>;

const DAYS_OF_WEEK = [
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
  { label: 'Domingo', value: 0 },
];

interface PlanWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PlanFormValues) => void;
  initialData?: any;
  isPending?: boolean;
}

export function PlanWizardModal({ isOpen, onClose, onSubmit, initialData, isPending }: PlanWizardModalProps) {
  const [step, setStep] = useState(1);
  
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema) as any,
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      tipoPlan: 'TIEMPO',
      duracionDias: 30,
      cantidadSesiones: '',
      limiteDiasSemana: '',
      diasPermitidos: [],
      horaInicioAcceso: '',
      horaFinAcceso: '',
      esRenovableAutomaticamente: false,
      precio: 0,
      estado: 'ACTIVO',
    }
  });

  const watchTipoPlan = form.watch('tipoPlan');

  const parseTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString; // fallback just in case it's already HH:mm
    return date.toISOString().substring(11, 16);
  };

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      if (initialData) {
        form.reset({
          nombre: initialData.nombre,
          tipoPlan: initialData.tipoPlan,
          duracionDias: initialData.duracionDias || '',
          cantidadSesiones: initialData.cantidadSesiones || '',
          limiteDiasSemana: initialData.limiteDiasSemana || '',
          diasPermitidos: initialData.diasPermitidos || [],
          horaInicioAcceso: parseTime(initialData.horaInicioAcceso),
          horaFinAcceso: parseTime(initialData.horaFinAcceso),
          esRenovableAutomaticamente: initialData.esRenovableAutomaticamente || false,
          precio: Number(initialData.precio),
          estado: initialData.estado || 'ACTIVO',
        });
      } else {
        form.reset({
          nombre: '',
          tipoPlan: 'TIEMPO',
          duracionDias: 30,
          cantidadSesiones: '',
          limiteDiasSemana: '',
          diasPermitidos: [],
          horaInicioAcceso: '',
          horaFinAcceso: '',
          esRenovableAutomaticamente: false,
          precio: 0,
          estado: 'ACTIVO',
        });
      }
    }
  }, [isOpen, initialData, form]);

  const nextStep = async () => {
    // Validate current step fields before proceeding
    let fieldsToValidate: (keyof PlanFormValues)[] = [];
    if (step === 1) fieldsToValidate = ['nombre', 'tipoPlan', 'precio', 'estado'];
    if (step === 2) fieldsToValidate = watchTipoPlan === 'TIEMPO' ? ['duracionDias'] : watchTipoPlan === 'SESIONES' ? ['cantidadSesiones'] : [];
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) setStep(step + 1);
  };
  
  const prevStep = () => setStep(step - 1);

  // Defensa contra envío prematuro: la única vía normal para llegar acá es
  // el botón "Guardar Plan" del paso 3 (ver también el onKeyDown del <form>
  // más abajo, que evita que Enter en el paso 2 -- que en los planes "Por
  // Tiempo"/"Por Sesiones" tiene un solo input numérico visible -- dispare el
  // envío implícito nativo del navegador y salte los pasos siguientes). Este
  // era el mismo bug encontrado y corregido en membresia-wizard-modal.tsx.
  const onFinalSubmit = form.handleSubmit((values) => {
    if (step !== 3) return;
    onSubmit(values);
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden">
        {/* Misma barra gris + puntos de progreso que el resto de los
            formularios paginados de la app (ver membresia-wizard-modal.tsx,
            global-form-modal.tsx, arqueo-caja-wizard.tsx). */}
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <div>
            <DialogTitle className="text-xl">{initialData ? 'Editar Plan' : 'Nuevo Plan'}</DialogTitle>
            <DialogDescription className="mt-1">
              Paso {step}: {['Información', 'Reglas de Duración', 'Restricciones'][step - 1]}
            </DialogDescription>
          </div>
          <div className="flex gap-2 shrink-0 pl-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`w-3 h-3 rounded-full ${step >= s ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
            ))}
          </div>
        </div>

        {/* Formulario */}
        <div className="px-6 py-6">
          <form
            onSubmit={onFinalSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && step !== 3) {
                e.preventDefault();
              }
            }}
            className="space-y-6"
          >

            {/* Paso 1: Información Básica */}
            <div className={step === 1 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 space-y-2">
                  <Label>Nombre del Plan <span className="text-red-500">*</span></Label>
                  <Input placeholder="Ej. Plan Mensual Ilimitado" {...form.register('nombre')} className="bg-white" />
                  {form.formState.errors.nombre && <p className="text-sm text-red-500">{form.formState.errors.nombre.message}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label>Tipo de Plan</Label>
                  <Controller
                    control={form.control}
                    name="tipoPlan"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(val) => {
                        field.onChange(val);
                        // Reset defaults on change
                        if (val === 'TIEMPO') form.setValue('duracionDias', 30);
                        if (val === 'SESIONES') form.setValue('cantidadSesiones', 12);
                      }}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TIEMPO">Por Tiempo</SelectItem>
                          <SelectItem value="SESIONES">Por Sesiones</SelectItem>
                          <SelectItem value="VISITA">Pase de Visita</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Precio Total <span className="text-red-500">*</span></Label>
                  <Input type="number" step="0.01" placeholder="0.00" {...form.register('precio')} className="bg-white" />
                  {form.formState.errors.precio && <p className="text-sm text-red-500">{form.formState.errors.precio.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Controller
                    control={form.control}
                    name="estado"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVO">Activo</SelectItem>
                          <SelectItem value="INACTIVO">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2 flex flex-col justify-center mt-2 p-4 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="cursor-pointer font-semibold text-slate-700">Renovación Automática</Label>
                    <Controller
                      control={form.control}
                      name="esRenovableAutomaticamente"
                      render={({ field }) => (
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                  </div>
                  <p className="text-xs text-slate-500">El plan se renovará automáticamente al vencer.</p>
                </div>
              </div>
            </div>

            {/* Paso 2: Reglas de Duración */}
            <div className={step === 2 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}>
              <div className="space-y-6">
                {watchTipoPlan === 'TIEMPO' && (
                  <div className="space-y-2 p-4 bg-white border border-slate-200 rounded-lg">
                    <Label className="text-lg">Duración (Días)</Label>
                    <p className="text-sm text-slate-500 mb-4">Ingresa la cantidad de días de vigencia (Ej. 30 para un mes, 365 para anual).</p>
                    <Input type="number" placeholder="Ej. 30" {...form.register('duracionDias')} className="max-w-[200px] text-lg bg-slate-50" />
                    {form.formState.errors.duracionDias && <p className="text-sm text-red-500">{form.formState.errors.duracionDias.message}</p>}
                  </div>
                )}

                {watchTipoPlan === 'SESIONES' && (
                  <div className="space-y-2 p-4 bg-white border border-slate-200 rounded-lg">
                    <Label className="text-lg">Cantidad de Sesiones</Label>
                    <p className="text-sm text-slate-500 mb-4">Ingresa el total de ingresos o clases permitidas.</p>
                    <Input type="number" placeholder="Ej. 12" {...form.register('cantidadSesiones')} className="max-w-[200px] text-lg bg-slate-50" />
                    {form.formState.errors.cantidadSesiones && <p className="text-sm text-red-500">{form.formState.errors.cantidadSesiones.message}</p>}
                  </div>
                )}

                {watchTipoPlan === 'VISITA' && (
                  <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-lg">
                    <CalendarClock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Los pases de visita son para un único ingreso al día de su compra.</p>
                    <p className="text-sm">No requieren configurar reglas de duración adicionales.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Paso 3: Restricciones de Acceso */}
            <div className={step === 3 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 bg-white p-4 border border-slate-200 rounded-lg col-span-2 sm:col-span-1">
                    <Label>Límite días por semana (Opcional)</Label>
                    <p className="text-xs text-slate-500 mb-2">Ej. 3 (Si es un plan de 3 veces por semana).</p>
                    <Input type="number" placeholder="Ej. 3" {...form.register('limiteDiasSemana')} className="bg-slate-50" />
                  </div>
                  
                  <div className="space-y-2 bg-white p-4 border border-slate-200 rounded-lg col-span-2 sm:col-span-1">
                    <Label>Horario Restringido</Label>
                    <p className="text-xs text-slate-500 mb-2">Solo podrá ingresar en este rango (Opcional).</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Hora Inicio</Label>
                        <Input type="time" {...form.register('horaInicioAcceso')} className="bg-slate-50" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Hora Fin</Label>
                        <Input type="time" {...form.register('horaFinAcceso')} className="bg-slate-50" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 col-span-2 bg-white p-4 border border-slate-200 rounded-lg">
                    <Label className="text-zinc-700 font-semibold">Días de acceso permitido (vacío = Todos los días)</Label>
                    <div className="flex flex-wrap gap-4 pt-2">
                      <Controller
                        control={form.control}
                        name="diasPermitidos"
                        render={({ field }) => (
                          <>
                            {DAYS_OF_WEEK.map((day) => {
                              const isChecked = Array.isArray(field.value) && field.value.includes(day.value);
                              return (
                                <div key={day.value} className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                                  <Checkbox 
                                    id={`day-${day.value}`} 
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...(field.value || []), day.value]);
                                      } else {
                                        field.onChange((field.value || []).filter((v: number) => v !== day.value));
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`day-${day.value}`} className="cursor-pointer font-medium text-slate-600">{day.label}</Label>
                                </div>
                              )
                            })}
                          </>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </form>
        </div>

        {/* Botonera inferior */}
        <div className="px-6 py-4 flex justify-between items-center border-t border-slate-200">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 1 ? onClose : prevStep}
            disabled={isPending}
          >
            {step === 1 ? 'Cancelar' : (
              <>
                <ArrowLeft className="w-4 h-4 mr-2" /> Atrás
              </>
            )}
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={nextStep}>
              Siguiente <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button type="button" onClick={onFinalSubmit} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              {isPending ? 'Guardando...' : 'Guardar Plan'} <Save className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
