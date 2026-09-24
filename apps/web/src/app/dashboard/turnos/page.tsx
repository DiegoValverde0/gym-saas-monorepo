"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { Protect } from '@/components/ui/protect';
import { PapeleraToggle } from '@/components/ui/papelera-toggle';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, Plus, Edit, Trash2, Search, ArchiveRestore } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ESTADO_VARIANT: Record<string, "default" | "success" | "destructive" | "outline"> = {
  PROGRAMADO: 'default',
  COMPLETADO: 'success',
  AUSENTE: 'destructive',
  CANCELADO: 'default',
};

interface Sucursal {
  id: string;
  nombre: string;
}

interface UsuarioStaff {
  nombreCompleto: string;
}

interface Staff {
  id: string;
  usuario?: UsuarioStaff;
}

interface Turno {
  id: string;
  staffId: string;
  sucursalId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  estado: string;
  motivoAusencia?: string;
  staff?: Staff;
  sucursal?: Sucursal;
}

interface TurnoFormValues {
  staffId: string;
  sucursalId: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  estado: string;
  motivoAusencia: string;
}

const dateInputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function TurnosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const userSucursalId = user?.sucursalId;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTurno, setEditingTurno] = useState<Turno | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', description: '', onConfirm: () => {} });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<TurnoFormValues>({
    defaultValues: {
      staffId: '',
      sucursalId: '',
      fecha: '',
      horaEntrada: '',
      horaSalida: '',
      estado: 'PROGRAMADO',
      motivoAusencia: '',
    },
  });

  const { data: turnos, isLoading } = useQuery({
    queryKey: ['turnos', activeTenantId, showDeleted],
    queryFn: async () => unwrapList(await apiGet(showDeleted ? '/turnos?deleted=true' : '/turnos')),
    enabled: !!token,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  });

  const { data: personal } = useQuery({
    queryKey: ['personal', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/personal')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: TurnoFormValues) => {
      const payload = { ...values };
      if (userSucursalId) payload.sucursalId = userSucursalId;
      return editingTurno ? apiPatch(`/turnos/${editingTurno.id}`, payload) : apiPost('/turnos', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turnos'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Éxito', description: 'Turno guardado correctamente.', variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem, restoreItem, isRestoring } = useSoftDelete({
    queryKey: ['turnos', activeTenantId, showDeleted],
    endpoint: 'turnos',
    modelName: 'turnoTrabajo',
    itemName: 'El turno',
  });

  const handleAddNew = () => {
    setEditingTurno(null);
    form.reset({
      staffId: '',
      sucursalId: userSucursalId || '',
      fecha: '',
      horaEntrada: '',
      horaSalida: '',
      estado: 'PROGRAMADO',
      motivoAusencia: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (turno: Turno) => {
    setEditingTurno(turno);
    form.reset({
      staffId: turno.staffId,
      sucursalId: turno.sucursalId,
      fecha: turno.fecha ? new Date(turno.fecha).toISOString().split('T')[0] : '',
      horaEntrada: turno.horaEntrada ? new Date(turno.horaEntrada).toISOString().substring(11, 16) : '',
      horaSalida: turno.horaSalida ? new Date(turno.horaSalida).toISOString().substring(11, 16) : '',
      estado: turno.estado || 'PROGRAMADO',
      motivoAusencia: turno.motivoAusencia || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (turnoOrId: Turno | string) => {
    const id = typeof turnoOrId === 'string' ? turnoOrId : turnoOrId.id;
    setConfirmConfig({
      title: '¿Eliminar turno?',
      description: 'Podrás deshacerlo en los próximos segundos.',
      onConfirm: () => deleteItem(id),
    });
    setConfirmOpen(true);
  };

  if (!token) return null;

  const personalList = unwrapList(personal);
  const filteredTurnos = (unwrapList(turnos) as Turno[]).filter((t: Turno) => {
    if (!searchTerm) return true;
    return t.staff?.usuario?.nombreCompleto?.toLowerCase().includes(searchTerm.toLowerCase());
  });


  return (
    <Protect permission="turnos:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Turnos de Trabajo</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Horario de staff por sucursal.</p>
        </div>


        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Turnos día por día, generados solos a partir del horario semanal de cada persona (se edita en Equipo).
            Acá se registran las excepciones: marca un turno como Ausente o Cancelado, o agrega uno extra.
          </p>

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

            <Protect permission="turnos:crear" fallbackType="hide">
              <TenantRequiredButton onClick={handleAddNew} icon={<Plus className="mr-2 h-4 w-4" />} label="Nuevo Turno" />
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
        ) : filteredTurnos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {searchTerm ? 'Ningún turno coincide con la búsqueda' : 'No hay turnos registrados'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Prueba con otro nombre.' : 'Programa el primer turno de tu staff.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTurnos.map((t: Turno) => (
                <TableRow key={t.id} className={showDeleted ? "bg-rose-50/40 dark:bg-rose-500/20 opacity-80" : ""}>
                  <TableCell>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{t.staff?.usuario?.nombreCompleto}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{t.sucursal?.nombre}</span>
                  </TableCell>
                  <TableCell>
                    {/* fecha es @db.Date (sin hora) guardada como medianoche UTC; se
                        formatea en UTC para no mostrar un día antes según el huso
                        horario local del navegador. */}
                    <span className="text-xs text-slate-600 dark:text-slate-400">{new Date(t.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {new Date(t.horaEntrada).toISOString().substring(11, 16)} - {new Date(t.horaSalida).toISOString().substring(11, 16)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_VARIANT[t.estado] || 'default'}>{t.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {showDeleted ? (
                        <Protect permission="sistema:restaurar">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => restoreItem(t.id)} 
                            disabled={isRestoring}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 h-8 px-3"
                          >
                            <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                          </Button>
                        </Protect>
                      ) : (
                        <>
                          <Protect permission="turnos:actualizar">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Protect>
                          <Protect permission="turnos:eliminar">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400">
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
      </div>

      <GlobalFormModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingTurno ? 'Editar Turno' : 'Nuevo Turno'}
        description={editingTurno ? 'Modifica los datos del turno.' : 'Programa un turno de trabajo.'}
        form={form as any}
        sections={[
          {
            fields: [
              {
                name: 'staffId',
                label: 'Staff',
                type: 'select',
                placeholder: 'Selecciona un integrante del staff',
                options: (personalList as Staff[]).map((p: Staff) => ({ label: p.usuario?.nombreCompleto || 'Sin nombre', value: p.id })),
                colSpan: 2,
              },
              ...(!userSucursalId
                ? [{
                    name: 'sucursalId',
                    label: 'Sucursal',
                    type: 'select' as const,
                    placeholder: 'Selecciona una sucursal',
                    options: (unwrapList(sucursales) as Sucursal[]).map((s: Sucursal) => ({ label: s.nombre, value: s.id })),
                    colSpan: 2 as const,
                  }]
                : []),
              {
                name: 'fecha',
                label: 'Fecha',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha</label>
                    <input type="date" {...f.register('fecha')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'estado', label: 'Estado', type: 'select', options: [
                { label: 'Programado', value: 'PROGRAMADO' },
                { label: 'Completado', value: 'COMPLETADO' },
                { label: 'Ausente', value: 'AUSENTE' },
                { label: 'Cancelado', value: 'CANCELADO' },
              ] },
              {
                name: 'horaEntrada',
                label: 'Hora de Entrada',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hora de Entrada</label>
                    <input type="time" {...f.register('horaEntrada')} className={dateInputClass} />
                  </div>
                ),
              },
              {
                name: 'horaSalida',
                label: 'Hora de Salida',
                type: 'custom',
                renderCustom: (f: any) => (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hora de Salida</label>
                    <input type="time" {...f.register('horaSalida')} className={dateInputClass} />
                  </div>
                ),
              },
              { name: 'motivoAusencia', label: 'Motivo de Ausencia (Opcional)', type: 'text', colSpan: 2 },
            ],
          },
        ]}
        onSubmit={saveMutation.mutateAsync as any}
        isPending={saveMutation.isPending}
        submitLabel="Guardar Turno"
      />

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
