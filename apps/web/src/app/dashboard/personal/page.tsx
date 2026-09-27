"use client";

import { Ayuda } from '@/components/ui/ayuda';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { refrescarAcceso, useAuth } from '@/hooks/use-auth';
import { useSucursalActiva } from '@/hooks/use-sucursal-activa';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { descripcionRol, nombreRol, ordenRol } from '@/lib/roles';
import { apiGet, apiPatch, apiPost, unwrapList } from '@/lib/api-client';
import { useForm, Controller, UseFormReturn, FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { FormSection, GlobalFormModal } from '@/components/ui/global-form-modal';
import { useModoUso } from '@/hooks/use-modo-uso';
import { Protect } from '@/components/ui/protect';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserCog, Plus, Edit, Trash2, Search, ArchiveRestore, Copy, Wand2, KeyRound, LogOut, X, Hash } from 'lucide-react';
import { PinDialog } from './PinDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';

const TIPO_CONTRATACION_LABEL: Record<string, string> = {
  PLANILLA: 'Planilla',
  INDEPENDIENTE: 'Independiente',
  VOLUNTARIO: 'Voluntario',
};

// Orden de la grilla: lunes primero. El valor es el diaSemana del backend (0 = domingo).
const DIAS_GRILLA = [
  { dia: 1, label: 'Lunes', corto: 'Lun' },
  { dia: 2, label: 'Martes', corto: 'Mar' },
  { dia: 3, label: 'Miércoles', corto: 'Mié' },
  { dia: 4, label: 'Jueves', corto: 'Jue' },
  { dia: 5, label: 'Viernes', corto: 'Vie' },
  { dia: 6, label: 'Sábado', corto: 'Sáb' },
  { dia: 0, label: 'Domingo', corto: 'Dom' },
];
const DIA_CORTO: Record<number, string> = Object.fromEntries(DIAS_GRILLA.map((d) => [d.dia, d.corto]));

// Roles globales que no corresponden a un empleado (el backend también los rechaza).
const ROLES_NO_ASIGNABLES = ['SUPERADMIN', 'CLIENTE'];

// Roles que no dan clases: para ellos no se pregunta qué disciplinas imparte.
const ROLES_SIN_CLASES = ['ADMIN_GYM', 'RECEPCIONISTA'];

// Plantillas rápidas de horario (plan de simplificación, 6.3). Días 1..5 = lunes a viernes.
const PLANTILLAS_HORARIO = [
  { etiqueta: 'Lunes a viernes, 8 a 16', dias: [1, 2, 3, 4, 5], entrada: '08:00', salida: '16:00' },
  { etiqueta: 'Mañanas, lunes a sábado (6 a 14)', dias: [1, 2, 3, 4, 5, 6], entrada: '06:00', salida: '14:00' },
  { etiqueta: 'Tardes, lunes a sábado (14 a 22)', dias: [1, 2, 3, 4, 5, 6], entrada: '14:00', salida: '22:00' },
];

// Contraseña inicial fácil de dictar o enviar por WhatsApp: sin caracteres
// que se confunden (0/O, 1/l/I).
function generarContrasena() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const azar = (conjunto: string, n: number) => {
    const valores = crypto.getRandomValues(new Uint32Array(n));
    return Array.from(valores, (v) => conjunto[v % conjunto.length]).join('');
  };
  return `${azar(letras, 4)}${azar(numeros, 4)}${azar(letras, 2)}`;
}

interface Rol { id: string; nombre: string; }
interface Sucursal { id: string; nombre: string; }
interface Disciplina { id: string; nombre: string; }

interface Staff {
  id: string;
  usuarioId: string;
  tipoContratacion: string;
  costoPorHora: number | string;
  comisionPorcentaje?: number | string | null;
  estado: string;
  ultimaActividad?: string | null;
  tienePin?: boolean;
  usuario?: {
    nombreCompleto: string;
    correo: string;
    telefono?: string | null;
    asignacionesAcceso?: { id: string; rolId: string; sucursalId: string | null; rol?: { nombre: string } }[];
  };
  staffDisciplinas?: { disciplinaId: string; disciplina?: Disciplina }[];
  turnosPlantilla?: { diaSemana: number; horaEntrada: string; horaSalida: string; sucursalId: string }[];
}

interface ResumenHorario {
  turnosCreados: number;
  turnosActualizados: number;
  turnosEliminados: number;
  turnosConservados: number;
}

// "hace 5 min", "hace 3 h", "hace 2 días"; null = nunca entró (o hace más de 90 días).
function haceCuanto(iso?: string | null): string {
  if (!iso) return 'Sin actividad reciente';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'Activo ahora';
  if (min < 60) return `Activo hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `Activo hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Activo hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

const horaDe = (iso: string) => new Date(iso).toISOString().substring(11, 16);

// Un día admite un segundo bloque (turno partido, 6–10 y 16–20; plan 13.8).
const diaSchema = z.object({
  activo: z.boolean(),
  entrada: z.string(),
  salida: z.string(),
  partido: z.boolean(),
  entrada2: z.string(),
  salida2: z.string(),
});

const miembroSchema = z
  .object({
    modo: z.enum(['crear', 'editar']),
    nombreCompleto: z.string().trim().min(2, 'Ingresa el nombre completo'),
    // Opcionales: en edición el correo va deshabilitado (react-hook-form entrega
    // undefined para campos disabled) y la contraseña no se muestra.
    correo: z.string().optional(),
    contrasena: z.string().optional(),
    telefono: z.string(),
    rolId: z.string().min(1, 'Elige un rol'),
    sucursalAccesoId: z.string(),
    tipoContratacion: z.string(),
    estado: z.string(),
    costoPorHora: z.union([z.string(), z.number()]),
    comisionPorcentaje: z.union([z.string(), z.number()]),
    disciplinaIds: z.array(z.string()),
    horarioSucursalId: z.string(),
    dias: z.array(diaSchema).length(7),
  })
  .superRefine((v, ctx) => {
    if (v.modo === 'crear') {
      if (!z.string().email().safeParse(v.correo ?? '').success) {
        ctx.addIssue({ code: 'custom', path: ['correo'], message: 'Correo inválido' });
      }
      if ((v.contrasena ?? '').length < 8) {
        ctx.addIssue({ code: 'custom', path: ['contrasena'], message: 'Mínimo 8 caracteres' });
      }
    }
    const activos = v.dias.filter((d) => d.activo);
    if (activos.length > 0 && !v.sucursalAccesoId && !v.horarioSucursalId) {
      ctx.addIssue({ code: 'custom', path: ['horarioSucursalId'], message: 'Elige en qué sucursal trabaja' });
    }
    v.dias.forEach((d, i) => {
      if (!d.activo) return;
      if (!d.entrada || !d.salida || d.salida <= d.entrada) {
        ctx.addIssue({ code: 'custom', path: ['dias', i, 'salida'], message: 'La salida debe ser posterior a la entrada' });
      }
      if (d.partido) {
        if (!d.entrada2 || !d.salida2 || d.salida2 <= d.entrada2) {
          ctx.addIssue({ code: 'custom', path: ['dias', i, 'salida2'], message: 'En el segundo horario, la salida debe ser posterior a la entrada' });
        } else if (d.entrada2 < d.salida) {
          ctx.addIssue({ code: 'custom', path: ['dias', i, 'salida2'], message: 'El segundo horario debe empezar después de que termine el primero' });
        }
      }
    });
  });

type MiembroFormValues = z.infer<typeof miembroSchema>;

const diasVacios = () =>
  Array.from({ length: 7 }, () => ({ activo: false, entrada: '08:00', salida: '16:00', partido: false, entrada2: '16:00', salida2: '20:00' }));

// "Lun, Mié, Vie · 06:00–14:00" (agrupa días con el mismo horario; un turno
// partido se muestra "06:00–10:00 y 16:00–20:00").
function resumirHorario(bloques: Staff['turnosPlantilla']): string[] {
  if (!bloques || bloques.length === 0) return [];
  const porDia = new Map<number, string[]>();
  for (const b of [...bloques].sort((x, y) => horaDe(x.horaEntrada).localeCompare(horaDe(y.horaEntrada)))) {
    porDia.set(b.diaSemana, [...(porDia.get(b.diaSemana) || []), `${horaDe(b.horaEntrada)}–${horaDe(b.horaSalida)}`]);
  }
  const grupos = new Map<string, number[]>();
  for (const [dia, tramos] of porDia) {
    const clave = tramos.join(' y ');
    grupos.set(clave, [...(grupos.get(clave) || []), dia]);
  }
  const orden = (d: number) => (d === 0 ? 7 : d);
  return [...grupos.entries()].map(([horas, dias]) => `${dias.sort((a, b) => orden(a) - orden(b)).map((d) => DIA_CORTO[d]).join(', ')} · ${horas}`);
}

export default function PersonalPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  // Quien tiene acceso limitado a una sucursal solo puede dar acceso a esa
  // (el backend lo exige igual): el selector de sucursal desaparece.
  const miSucursalId = user?.sucursalId ?? null;
  const { sucursalId: sucursalActiva } = useSucursalActiva();
  const modulos = useModulosActivos();
  const { modo } = useModoUso();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pinDe, setPinDe] = useState<{ id: string; nombre: string; tienePin: boolean } | null>(null);
  const [editingPersonal, setEditingPersonal] = useState<Staff | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });

  const valoresIniciales = (): MiembroFormValues => ({
    modo: 'crear',
    nombreCompleto: '',
    correo: '',
    contrasena: '',
    telefono: '',
    rolId: '',
    sucursalAccesoId: '',
    tipoContratacion: 'PLANILLA',
    estado: 'ACTIVO',
    costoPorHora: 0,
    comisionPorcentaje: '',
    disciplinaIds: [],
    horarioSucursalId: '',
    dias: diasVacios(),
  });

  const form = useForm<MiembroFormValues>({ resolver: zodResolver(miembroSchema), defaultValues: valoresIniciales() });

  const { data: personal, isLoading } = useQuery({
    queryKey: ['personal', activeTenantId, showDeleted],
    queryFn: async () => unwrapList<Staff>(await apiGet(showDeleted ? '/personal?deleted=true' : '/personal')),
    enabled: !!token,
  });

  const { data: roles } = useQuery({
    queryKey: ['roles', activeTenantId],
    queryFn: async () => unwrapList<Rol>(await apiGet('/roles')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList<Sucursal>(await apiGet('/sucursales')),
    enabled: !!token,
  });

  const { data: disciplinas } = useQuery({
    queryKey: ['disciplinas', activeTenantId],
    queryFn: async () => unwrapList<Disciplina>(await apiGet('/disciplinas')),
    enabled: !!token,
  });

  const rolesAsignables = (roles || [])
    .filter((r) => !ROLES_NO_ASIGNABLES.includes(r.nombre))
    .sort((a, b) => ordenRol(a.nombre) - ordenRol(b.nombre));
  const sucursalesList = sucursales || [];
  const nombreSucursal = (id?: string | null) => sucursalesList.find((s) => s.id === id)?.nombre;
  const sucursalesAsignables = miSucursalId ? sucursalesList.filter((s) => s.id === miSucursalId) : sucursalesList;
  // Un solo campo "Sucursal" (3.1 y 6.3): si trabaja en una sucursal, esa es a
  // la vez su acceso y su lugar de trabajo. Solo con "Todas las sucursales" se
  // pregunta dónde trabaja habitualmente, para su horario.
  const eligeSucursal = sucursalesAsignables.length > 1;
  const accesoElegido = form.watch('sucursalAccesoId');
  const rolElegido = rolesAsignables.find((r) => r.id === form.watch('rolId'));
  const preguntaDisciplinas = modulos.clasesGrupales && !ROLES_SIN_CLASES.includes(rolElegido?.nombre ?? '');

  const describirResultado = (res: { horarioResumen?: ResumenHorario | null; usuarioExistente?: boolean }) => {
    const partes: string[] = [];
    const r = res.horarioResumen;
    if (r) {
      if (r.turnosCreados) partes.push(`${r.turnosCreados} turnos programados`);
      if (r.turnosActualizados) partes.push(`${r.turnosActualizados} actualizados`);
      if (r.turnosEliminados) partes.push(`${r.turnosEliminados} quitados`);
      if (r.turnosConservados) partes.push(`${r.turnosConservados} conservados porque tienen clases asignadas`);
    }
    let texto = partes.length ? `Horario aplicado: ${partes.join(', ')}.` : '';
    if (res.usuarioExistente) texto += ' Ese correo ya tenía una cuenta: seguirá usando su contraseña actual.';
    return texto.trim() || undefined;
  };

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['personal'] });
    queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    queryClient.invalidateQueries({ queryKey: ['turnos'] });
    queryClient.invalidateQueries({ queryKey: ['turnos-plantilla'] });
    // Si la persona editada es uno mismo, la barra superior y el menú se
    // actualizan en el acto (useAvisoCambioAcceso muestra el aviso).
    refrescarAcceso(queryClient);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      editingPersonal
        ? apiPatch<{ horarioResumen?: ResumenHorario }>(`/personal/${editingPersonal.id}/equipo`, payload)
        : apiPost<{ horarioResumen?: ResumenHorario; usuarioExistente?: boolean }>('/personal/equipo', payload),
    onSuccess: (res) => {
      invalidar();
      setIsDialogOpen(false);
      setEditingPersonal(null);
      toast({
        title: editingPersonal ? 'Cambios guardados' : 'Persona agregada al equipo',
        description: describirResultado(res || {}),
        variant: 'success',
      });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // Acciones de soporte (plan 6.6 d).
  const [contrasenaTemporal, setContrasenaTemporal] = useState<{ nombre: string; contrasena: string } | null>(null);
  const cerrarSesionesMutation = useMutation({
    mutationFn: async (staff: Staff) => apiPost(`/personal/${staff.id}/cerrar-sesiones`, {}),
    onSuccess: (_res, staff) =>
      toast({ title: 'Sesiones cerradas', description: `${staff.usuario?.nombreCompleto} tendrá que volver a iniciar sesión en todos sus dispositivos.`, variant: 'success' }),
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });
  const restablecerMutation = useMutation({
    mutationFn: async (staff: Staff) => apiPost<{ contrasenaTemporal: string }>(`/personal/${staff.id}/restablecer-contrasena`, {}),
    onSuccess: (res, staff) => setContrasenaTemporal({ nombre: staff.usuario?.nombreCompleto || '', contrasena: res.contrasenaTemporal }),
    onError: (err: Error) => toast({ title: 'No se pudo restablecer', description: err.message, variant: 'destructive' }),
  });
  const confirmarSoporte = (staff: Staff, accion: 'sesiones' | 'contrasena') => {
    const nombre = staff.usuario?.nombreCompleto;
    setConfirmConfig(
      accion === 'sesiones'
        ? {
            title: '¿Cerrar sus sesiones?',
            description: `${nombre} saldrá del sistema en todos sus dispositivos (por ejemplo, si perdió el celular). Podrá volver a entrar con su contraseña.`,
            onConfirm: () => cerrarSesionesMutation.mutate(staff),
          }
        : {
            title: '¿Restablecer su contraseña?',
            description: `Se generará una contraseña temporal para ${nombre} y se cerrarán sus sesiones abiertas. Su contraseña actual deja de funcionar.`,
            onConfirm: () => restablecerMutation.mutate(staff),
          },
    );
    setConfirmOpen(true);
  };

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['personal', activeTenantId, showDeleted],
    endpoint: 'personal',
    modelName: 'perfilStaff',
    itemName: 'La persona del equipo',
  });

  const onSubmit = (values: MiembroFormValues) => {
    const diasActivos = values.dias
      .map((d, dia) => ({ ...d, dia }))
      .filter((d) => d.activo)
      .flatMap((d) => [
        { diaSemana: d.dia, horaEntrada: d.entrada, horaSalida: d.salida },
        ...(d.partido ? [{ diaSemana: d.dia, horaEntrada: d.entrada2, horaSalida: d.salida2 }] : []),
      ]);

    // En edición el horario solo se envía si se tocó (guardarlo re-sincroniza los turnos futuros).
    // Trabaja donde tiene acceso; con acceso a todas, donde se indicó.
    const horarioSucursalId = values.sucursalAccesoId || values.horarioSucursalId || sucursalActiva || sucursalesAsignables[0]?.id;
    const cambioSucursalHorario =
      !!editingPersonal && diasActivos.length > 0 && horarioSucursalId !== editingPersonal.turnosPlantilla?.[0]?.sucursalId;
    const horarioTocado = !!form.formState.dirtyFields.dias || cambioSucursalHorario;
    const enviarHorario = editingPersonal ? horarioTocado : diasActivos.length > 0;

    const base: Record<string, unknown> = {
      nombreCompleto: values.nombreCompleto.trim(),
      telefono: values.telefono.trim() || undefined,
      rolId: values.rolId,
      tipoContratacion: values.tipoContratacion,
      estado: values.estado,
      costoPorHora: Number(values.costoPorHora) || 0,
      comisionPorcentaje: values.comisionPorcentaje === '' ? undefined : Number(values.comisionPorcentaje),
      disciplinaIds: values.disciplinaIds,
      ...(enviarHorario && horarioSucursalId ? { horario: { sucursalId: horarioSucursalId, dias: diasActivos } } : {}),
    };

    if (editingPersonal) {
      // Con acceso limitado no se puede cambiar la sucursal de acceso: no se envía.
      saveMutation.mutate(miSucursalId ? base : { ...base, sucursalId: values.sucursalAccesoId || null });
    } else {
      saveMutation.mutate({
        ...base,
        correo: (values.correo ?? '').trim(),
        contrasena: values.contrasena,
        sucursalId: miSucursalId ?? (values.sucursalAccesoId || undefined),
      });
    }
  };

  const handleAddNew = () => {
    setEditingPersonal(null);
    const iniciales = valoresIniciales();
    // Por defecto trabaja en la sucursal activa. Con una sola sucursal no se
    // pregunta nada y queda con acceso a todas (sirve también si después se
    // abre otra sede).
    iniciales.sucursalAccesoId = miSucursalId ?? (eligeSucursal ? sucursalActiva ?? '' : '');
    iniciales.horarioSucursalId = miSucursalId ?? sucursalActiva ?? sucursalesAsignables[0]?.id ?? '';
    form.reset(iniciales);
    setIsDialogOpen(true);
  };

  const handleEdit = (staff: Staff) => {
    setEditingPersonal(staff);
    const asignacion = staff.usuario?.asignacionesAcceso?.[0];
    const dias = diasVacios();
    const bloques = [...(staff.turnosPlantilla || [])].sort((x, y) => horaDe(x.horaEntrada).localeCompare(horaDe(y.horaEntrada)));
    for (const b of bloques) {
      const dia = dias[b.diaSemana];
      if (!dia.activo) {
        dias[b.diaSemana] = { ...dia, activo: true, entrada: horaDe(b.horaEntrada), salida: horaDe(b.horaSalida) };
      } else if (!dia.partido) {
        dias[b.diaSemana] = { ...dia, partido: true, entrada2: horaDe(b.horaEntrada), salida2: horaDe(b.horaSalida) };
      }
    }
    form.reset({
      modo: 'editar',
      nombreCompleto: staff.usuario?.nombreCompleto || '',
      correo: staff.usuario?.correo || '',
      contrasena: '',
      telefono: staff.usuario?.telefono || '',
      rolId: asignacion?.rolId || '',
      sucursalAccesoId: asignacion?.sucursalId || '',
      tipoContratacion: staff.tipoContratacion || 'PLANILLA',
      estado: staff.estado || 'ACTIVO',
      costoPorHora: Number(staff.costoPorHora) || 0,
      comisionPorcentaje: staff.comisionPorcentaje != null ? String(Number(staff.comisionPorcentaje)) : '',
      disciplinaIds: (staff.staffDisciplinas || []).map((sd) => sd.disciplinaId),
      horarioSucursalId: staff.turnosPlantilla?.[0]?.sucursalId || sucursalActiva || sucursalesAsignables[0]?.id || '',
      dias,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (staff: Staff) => {
    setConfirmConfig({
      title: '¿Dar de baja?',
      description: `${staff.usuario?.nombreCompleto} dejará de tener acceso al sistema y su sesión se cerrará en su siguiente acción. Podrás deshacerlo en los próximos segundos.`,
      onConfirm: () => deleteItem(staff.id),
    });
    setConfirmOpen(true);
  };

  // Formulario según el modo de uso (plan de simplificación, 4.4 y 6.3):
  //  - Simple: una sola pantalla con nombre, correo, contraseña y rol (más
  //    disciplinas si da clases). Sin horario ni contratación; el teléfono y
  //    el estado van en "Más opciones".
  //  - Intermedio: los pasos de siempre; "Contratación y pagos" pasa a "Más
  //    opciones" al final.
  //  - Experto: todo a la vista.
  const seccionesSegunModo = (secciones: FormSection[]): FormSection[] => {
    const porTitulo = (t: string) => secciones.find((sec) => sec.title === t);
    const quien = porTitulo('¿Quién es?');
    const que = porTitulo('¿Qué hace y dónde?');
    const contratacion = porTitulo('Contratación y pagos');
    const cuando = porTitulo('¿Cuándo trabaja?');
    if (!quien || !que || !contratacion || !cuando) return secciones;
    if (modo === 'experto') return secciones;
    if (modo === 'intermedio') return [quien, que, cuando, { ...contratacion, plegable: true }];
    const telefono = quien.fields.filter((f) => f.name === 'telefono');
    const estado = editingPersonal ? contratacion.fields.filter((f) => f.name === 'estado') : [];
    return [
      {
        title: editingPersonal ? 'Datos y rol' : '¿Quién es y qué hace?',
        fields: [
          ...quien.fields.filter((f) => f.name !== 'telefono'),
          // Sin selector de sucursal: en simple se usa la predeterminada.
          ...que.fields.filter((f) => f.name !== 'sucursalAccesoId'),
        ],
      },
      { plegable: true, fields: [...telefono, ...estado] },
    ];
  };

  if (!token) return null;

  const filteredPersonal = (personal || []).filter((p) => {
    if (!searchTerm) return true;
    return p.usuario?.nombreCompleto?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // ------------------------------------------------------------------
  // Grilla del horario semanal (paso 3 del formulario)
  // ------------------------------------------------------------------
  const renderHorario = (f: UseFormReturn<FieldValues>) => {
    const dias = f.watch('dias') as MiembroFormValues['dias'];
    const errores = (f.formState.errors.dias as unknown as { salida?: { message?: string }; salida2?: { message?: string } }[] | undefined) || [];
    const copiarPrimerDia = () => {
      const primero = DIAS_GRILLA.map((d) => dias[d.dia]).find((d) => d.activo);
      if (!primero) return;
      DIAS_GRILLA.forEach(({ dia }) => {
        if (dias[dia].activo) {
          f.setValue(`dias.${dia}.entrada`, primero.entrada, { shouldDirty: true });
          f.setValue(`dias.${dia}.salida`, primero.salida, { shouldDirty: true });
          f.setValue(`dias.${dia}.partido`, primero.partido, { shouldDirty: true });
          f.setValue(`dias.${dia}.entrada2`, primero.entrada2, { shouldDirty: true });
          f.setValue(`dias.${dia}.salida2`, primero.salida2, { shouldDirty: true });
        }
      });
    };
    const inputHora = 'h-9 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-slate-900 px-2 text-sm disabled:opacity-40';
    const aplicarPlantilla = (plantilla: (typeof PLANTILLAS_HORARIO)[number] | null) => {
      DIAS_GRILLA.forEach(({ dia }) => {
        const activo = !!plantilla && plantilla.dias.includes(dia);
        f.setValue(`dias.${dia}.activo`, activo, { shouldDirty: true });
        f.setValue(`dias.${dia}.partido`, false, { shouldDirty: true });
        if (plantilla && activo) {
          f.setValue(`dias.${dia}.entrada`, plantilla.entrada, { shouldDirty: true });
          f.setValue(`dias.${dia}.salida`, plantilla.salida, { shouldDirty: true });
        }
      });
    };
    const chip = 'rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300';

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PLANTILLAS_HORARIO.map((pl) => (
            <button key={pl.etiqueta} type="button" className={chip} onClick={() => aplicarPlantilla(pl)}>{pl.etiqueta}</button>
          ))}
          <button type="button" className={chip} onClick={() => aplicarPlantilla(null)}>Sin horario fijo</button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Días y horas de trabajo <Ayuda tema="horario" /></p>
          <Button type="button" variant="ghost" size="sm" onClick={copiarPrimerDia} className="text-indigo-600 dark:text-indigo-400">
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar el primer horario a los días marcados
          </Button>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {DIAS_GRILLA.map(({ dia, label }) => {
            const activo = dias?.[dia]?.activo;
            const partido = dias?.[dia]?.partido;
            const error = errores[dia]?.salida?.message ?? (partido ? errores[dia]?.salida2?.message : undefined);
            return (
              <div key={dia} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <Controller
                    name={`dias.${dia}.activo`}
                    control={f.control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 w-32 cursor-pointer">
                        <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600" />
                        <span className={`text-sm font-medium ${activo ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>{label}</span>
                      </label>
                    )}
                  />
                  <input type="time" disabled={!activo} {...f.register(`dias.${dia}.entrada`)} className={inputHora} aria-label={`Entrada ${label}`} />
                  <span className="text-zinc-400">a</span>
                  <input type="time" disabled={!activo} {...f.register(`dias.${dia}.salida`)} className={inputHora} aria-label={`Salida ${label}`} />
                  {activo && !partido && (
                    <button
                      type="button"
                      onClick={() => f.setValue(`dias.${dia}.partido`, true, { shouldDirty: true })}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      title="Turno partido: agrega un segundo horario ese día (ej. 16:00 a 20:00)"
                    >
                      + Otro horario
                    </button>
                  )}
                </div>
                {activo && partido && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="w-32 text-xs text-zinc-500 dark:text-zinc-400 pl-7">y también</span>
                    <input type="time" {...f.register(`dias.${dia}.entrada2`)} className={inputHora} aria-label={`Entrada del segundo horario ${label}`} />
                    <span className="text-zinc-400">a</span>
                    <input type="time" {...f.register(`dias.${dia}.salida2`)} className={inputHora} aria-label={`Salida del segundo horario ${label}`} />
                    <button
                      type="button"
                      onClick={() => f.setValue(`dias.${dia}.partido`, false, { shouldDirty: true })}
                      className="text-zinc-400 hover:text-rose-600"
                      aria-label={`Quitar el segundo horario del ${label}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {activo && error && <p className="text-xs text-red-500 mt-1 ml-32 pl-3">{error}</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Las jornadas de las próximas semanas se generan solas a partir de este horario. Para vacaciones, enfermedad o un día libre, usa &quot;Registrar ausencia&quot; en Jornadas.
        </p>
      </div>
    );
  };

  return (
    <Protect permission="staff:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Equipo</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Entrenadores y personal: su acceso al sistema, disciplinas y horario semanal.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 shadow-xs"
              />
            </div>

            <PapeleraToggle showDeleted={showDeleted} setShowDeleted={setShowDeleted} />

            <Protect permission="staff:crear" fallbackType="hide">
              <TenantRequiredButton onClick={handleAddNew} icon={<Plus className="mr-2 h-4 w-4" />} label="Agregar al equipo" />
            </Protect>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={6} showAvatar={true} />
        ) : filteredPersonal.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={searchTerm ? 'Nadie encontrado' : 'Todavía no hay nadie en el equipo'}
            description={searchTerm ? 'Prueba con otro nombre.' : 'Agrega a tus entrenadores y personal: se crea su cuenta de acceso, sus disciplinas y su horario en un solo paso.'}
            actionLabel="Agregar al equipo"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={handleAddNew}
            permission="staff:crear"
            isSearch={!!searchTerm}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Disciplinas</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPersonal.map((p) => {
                const asignacion = p.usuario?.asignacionesAcceso?.[0];
                const horario = resumirHorario(p.turnosPlantilla);
                const sucursalHorario = nombreSucursal(p.turnosPlantilla?.[0]?.sucursalId);
                return (
                  <TableRow key={p.id} className={showDeleted ? 'bg-rose-50/40 dark:bg-rose-500/20 opacity-80' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                          {p.usuario?.nombreCompleto?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{p.usuario?.nombreCompleto}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{p.usuario?.correo}</p>
                          {!showDeleted && <p className="text-[11px] text-slate-400 dark:text-slate-500">{haceCuanto(p.ultimaActividad)}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{nombreRol(asignacion?.rol?.nombre) || '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{TIPO_CONTRATACION_LABEL[p.tipoContratacion] || p.tipoContratacion}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.staffDisciplinas || []).length === 0 ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Sin disciplinas</span>
                        ) : (
                          (p.staffDisciplinas || []).map((sd) => <Badge key={sd.disciplinaId} variant="default">{sd.disciplina?.nombre}</Badge>)
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {horario.length === 0 ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sin horario fijo</span>
                      ) : (
                        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                          {horario.map((h) => <p key={h}>{h}</p>)}
                          {sucursalHorario && sucursalesList.length > 1 && <p className="text-slate-500 dark:text-slate-400">{sucursalHorario}</p>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {showDeleted ? (
                          <Protect permission="sistema:restaurar">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restoreItem(p.id)}
                              disabled={isRestoring}
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                            >
                              <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                            </Button>
                          </Protect>
                        ) : (
                          <>
                            <Protect permission="staff:actualizar" fallbackType="hide">
                              <Button variant="ghost" size="icon" title="Cerrar sus sesiones" aria-label="Cerrar sus sesiones" onClick={() => confirmarSoporte(p, 'sesiones')} className="text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400">
                                <LogOut className="h-4 w-4" />
                              </Button>
                            </Protect>
                            {/* PIN de marcaje en la tablet (fase 6, DB-4). */}
                            {modulos.controlPersonal && (
                              <Protect permission="staff:actualizar" fallbackType="hide">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={p.tienePin ? 'PIN de marcaje (tiene uno)' : 'Asignar PIN de marcaje'}
                                  aria-label="PIN de marcaje"
                                  onClick={() => setPinDe({ id: p.id, nombre: p.usuario?.nombreCompleto?.split(' ')[0] ?? 'esta persona', tienePin: !!p.tienePin })}
                                  className={p.tienePin ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'}
                                >
                                  <Hash className="h-4 w-4" />
                                </Button>
                              </Protect>
                            )}
                            <Protect permission="usuarios:actualizar" fallbackType="hide">
                              <Button variant="ghost" size="icon" title="Restablecer contraseña" aria-label="Restablecer contraseña" onClick={() => confirmarSoporte(p, 'contrasena')} className="text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400">
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </Protect>
                            <Protect permission="staff:actualizar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Protect>
                            <Protect permission="staff:eliminar" fallbackType="hide">
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Protect>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingPersonal ? 'Editar persona del equipo' : 'Agregar al equipo'}
        description={editingPersonal ? 'Datos, acceso, disciplinas y horario semanal.' : 'Crea su cuenta de acceso, su perfil y su horario semanal en un solo paso.'}
        form={form as unknown as UseFormReturn<FieldValues>}
        multiStep
        maxWidthClass="sm:max-w-[640px]"
        sections={seccionesSegunModo([
          {
            title: '¿Quién es?',
            fields: [
              { name: 'nombreCompleto', label: 'Nombre completo', type: 'text', placeholder: 'Ej. Marta Rojas', colSpan: 2 },
              {
                name: 'correo',
                label: 'Correo (para iniciar sesión)',
                type: 'email',
                placeholder: 'marta@ejemplo.com',
                disabled: !!editingPersonal,
                description: editingPersonal ? 'El correo identifica la cuenta y no se puede cambiar.' : undefined,
              },
              ...(editingPersonal
                ? []
                : [{
                    name: 'contrasena',
                    label: '',
                    type: 'custom' as const,
                    renderCustom: (f: UseFormReturn<FieldValues>) => (
                      <div className="space-y-2">
                        <label htmlFor="contrasena-inicial" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contraseña inicial</label>
                        <div className="flex gap-2">
                          <input
                            id="contrasena-inicial"
                            type="text"
                            autoComplete="new-password"
                            placeholder="Mínimo 8 caracteres"
                            {...f.register('contrasena')}
                            className="h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-slate-900 px-3 text-sm font-mono"
                          />
                          <Button type="button" variant="outline" onClick={() => f.setValue('contrasena', generarContrasena(), { shouldValidate: true })}>
                            <Wand2 className="w-4 h-4 mr-1.5" /> Generar
                          </Button>
                        </div>
                        {f.formState.errors.contrasena?.message ? (
                          <p className="text-xs text-red-500">{String(f.formState.errors.contrasena.message)}</p>
                        ) : (
                          <p className="text-xs text-zinc-500">Cópiala y envíasela; podrá usarla para entrar.</p>
                        )}
                      </div>
                    ),
                  }]),
              { name: 'telefono', label: 'Teléfono (opcional)', type: 'text' },
            ],
          },
          {
            title: '¿Qué hace y dónde?',
            fields: [
              {
                name: 'rolId',
                label: 'Rol',
                type: 'select',
                options: rolesAsignables.map((r) => ({ value: r.id, label: nombreRol(r.nombre) })),
                description: descripcionRol(rolElegido?.nombre) ?? 'Define qué puede hacer en el sistema.',
              },
              ...(eligeSucursal
                ? [{
                    name: 'sucursalAccesoId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    options: [...sucursalesAsignables.map((s) => ({ value: s.id, label: s.nombre })), { value: '', label: 'Todas las sucursales' }],
                    description: accesoElegido
                      ? 'Trabaja en esta sucursal y solo verá sus datos.'
                      : 'Podrá trabajar en cualquier sucursal y ver los datos de todas.',
                  }]
                : []),
              ...(preguntaDisciplinas ? [{
                name: 'disciplinaIds',
                label: '',
                type: 'custom' as const,
                colSpan: 2 as const,
                renderCustom: (f: UseFormReturn<FieldValues>) => (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Disciplinas que imparte</p>
                    {(disciplinas || []).length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay disciplinas creadas todavía.</p>
                    ) : (
                      <Controller
                        name="disciplinaIds"
                        control={f.control}
                        render={({ field }) => (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                            {(disciplinas || []).map((disc) => (
                              <label key={disc.id} className="flex items-start space-x-3 cursor-pointer group">
                                <Checkbox
                                  checked={field.value?.includes(disc.id)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(checked ? [...(field.value || []), disc.id] : (field.value || []).filter((v: string) => v !== disc.id))
                                  }
                                  className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">{disc.nombre}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      />
                    )}
                  </div>
                ),
              }] : []),
            ],
          },
          {
            title: 'Contratación y pagos',
            fields: [
              {
                name: 'tipoContratacion',
                label: 'Tipo de contratación',
                type: 'select',
                options: [
                  { label: 'Planilla', value: 'PLANILLA' },
                  { label: 'Independiente', value: 'INDEPENDIENTE' },
                  { label: 'Voluntario', value: 'VOLUNTARIO' },
                ],
              },
              { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }] },
              { name: 'costoPorHora', label: 'Costo por hora', type: 'number', allowDecimals: true },
              { name: 'comisionPorcentaje', label: 'Comisión % (independiente)', type: 'number', allowDecimals: true },
            ],
          },
          {
            title: '¿Cuándo trabaja?',
            fields: [
              ...(eligeSucursal && !accesoElegido
                ? [{
                    name: 'horarioSucursalId',
                    label: '¿Dónde trabaja habitualmente?',
                    type: 'select' as const,
                    colSpan: 2 as const,
                    options: sucursalesAsignables.map((s) => ({ value: s.id, label: s.nombre })),
                  }]
                : []),
              { name: 'dias', label: '', type: 'custom', colSpan: 2, renderCustom: renderHorario },
            ],
          },
        ])}
        onSubmit={onSubmit as unknown as (v: FieldValues) => void}
        isPending={saveMutation.isPending}
        submitLabel={editingPersonal ? 'Guardar cambios' : 'Agregar al equipo'}
      />

      <PinDialog persona={pinDe} onClose={() => setPinDe(null)} />

      <Dialog open={!!contrasenaTemporal} onOpenChange={(abierto) => !abierto && setContrasenaTemporal(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Contraseña temporal</DialogTitle>
            <DialogDescription>
              Envíasela a {contrasenaTemporal?.nombre}. No se vuelve a mostrar: cópiala ahora.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-center font-mono text-2xl tracking-wider text-zinc-900 dark:text-white select-all">
            {contrasenaTemporal?.contrasena}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                const texto = `Tu contraseña temporal para entrar al sistema del gimnasio es: ${contrasenaTemporal?.contrasena}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
              }}
            >
              Enviar por WhatsApp
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard?.writeText(contrasenaTemporal?.contrasena ?? '').catch(() => {});
                toast({ title: 'Copiada', variant: 'success' });
              }}
            >
              <Copy className="w-4 h-4 mr-1.5" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GlobalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        isDestructive={true}
      />
    </Protect>
  );
}
