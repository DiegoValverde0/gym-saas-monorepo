"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPost, apiPut, unwrapList } from '@/lib/api-client';
import { nombreRol } from '@/lib/roles';
import { ArchiveRestore, BarChart3, Copy, Folder, FolderLock, FolderOpen, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useCatalogo, fechaCorta } from './datos';
import { claseCampo } from './editor-filtros';
import { Carpeta, ReporteGuardado } from './tipos';

type Vista = 'todos' | 'recientes' | 'mios' | 'compartidos' | 'plantillas' | 'papelera';

const ROLES_OCULTOS = ['SUPERADMIN', 'CLIENTE'];

function DialogoCarpeta({ carpeta, abierto, cerrar }: { carpeta: Carpeta | null; abierto: boolean; cerrar: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [nombre, setNombre] = useState(carpeta?.nombre ?? '');
  const [compartida, setCompartida] = useState(carpeta?.visibilidad === 'COMPARTIDA');
  const [roles, setRoles] = useState<string[]>(carpeta?.roles.map((r) => r.id) ?? []);
  const { data: todos } = useQuery({
    queryKey: ['roles-para-compartir'],
    queryFn: async () => unwrapList<{ id: string; nombre: string }>(await apiGet('/roles')),
    enabled: abierto && hasPermission('roles:leer'),
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { nombre: nombre.trim(), visibilidad: compartida ? 'COMPARTIDA' : 'PRIVADA', rolesIds: compartida ? roles : [] };
      return carpeta ? apiPut(`/reporteria/carpetas/${carpeta.id}`, cuerpo) : apiPost('/reporteria/carpetas', cuerpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporteria-carpetas'] });
      queryClient.invalidateQueries({ queryKey: ['reporteria-reportes'] });
      toast({ title: carpeta ? 'Carpeta guardada' : 'Carpeta creada', variant: 'success' });
      cerrar();
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{carpeta ? 'Editar carpeta' : 'Nueva carpeta'}</DialogTitle>
          <DialogDescription>Ordena tus reportes y, si quieres, compártelos con el equipo.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Reportes de recepción" maxLength={100} required autoFocus />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={compartida} onChange={(e) => setCompartida(e.target.checked)} />
            Compartirla con el equipo
          </label>
          {compartida && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Con quién (si no eliges, la ve todo el equipo que usa la reportería):</p>
              {(todos ?? [])
                .filter((r) => !ROLES_OCULTOS.includes(r.nombre))
                .map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-indigo-600"
                      checked={roles.includes(r.id)}
                      onChange={(e) => setRoles(e.target.checked ? [...roles, r.id] : roles.filter((x) => x !== r.id))}
                    />
                    {nombreRol(r.nombre)}
                  </label>
                ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending || !nombre.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inicio de la reportería (docs/plan-reporteria.md, fase 4): reportes por
 * vista y carpeta, buscador y acciones.
 */
export default function ReporteriaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { data: catalogo } = useCatalogo();
  const simple = catalogo?.modo === 'simple';
  const [vista, setVista] = useState<Vista>('todos');
  const [carpetaId, setCarpetaId] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const busqueda = useDebounce(buscar.trim(), 300);
  const [editandoCarpeta, setEditandoCarpeta] = useState<Carpeta | null | 'nueva'>(null);
  const [borrar, setBorrar] = useState<{ tipo: 'reporte' | 'carpeta'; id: string; nombre: string } | null>(null);

  const puedeCrear = hasPermission('reportes:crear') && !simple;
  const vistaReal: Vista = simple ? 'plantillas' : vista;

  const { data: carpetas } = useQuery({ queryKey: ['reporteria-carpetas'], queryFn: () => apiGet<Carpeta[]>('/reporteria/carpetas') });
  const { data: reportes, isLoading } = useQuery({
    queryKey: ['reporteria-reportes', vistaReal, carpetaId, busqueda],
    queryFn: () => {
      const q = new URLSearchParams();
      if (vistaReal === 'papelera') q.set('papelera', 'true');
      else q.set('vista', vistaReal);
      if (carpetaId) q.set('carpetaId', carpetaId);
      if (busqueda) q.set('buscar', busqueda);
      return apiGet<ReporteGuardado[]>(`/reporteria/reportes?${q}`);
    },
  });

  const recargar = () => {
    queryClient.invalidateQueries({ queryKey: ['reporteria-reportes'] });
    queryClient.invalidateQueries({ queryKey: ['reporteria-carpetas'] });
  };
  const accion = useMutation({
    mutationFn: ({ ruta, metodo }: { ruta: string; metodo: 'post' | 'delete' }) => (metodo === 'delete' ? apiDelete(ruta) : apiPost(ruta, {})),
    onSuccess: recargar,
    onError: (err: Error) => toast({ title: 'No se pudo', description: err.message, variant: 'destructive' }),
  });
  const duplicar = useMutation({
    mutationFn: (id: string) => apiPost<ReporteGuardado>(`/reporteria/reportes/${id}/duplicar`, {}),
    onSuccess: (r) => {
      recargar();
      router.push(`/dashboard/reporteria/${r.id}/editar`);
    },
    onError: (err: Error) => toast({ title: 'No se pudo duplicar', description: err.message, variant: 'destructive' }),
  });

  const vistas: { valor: Vista; nombre: string }[] = simple
    ? [{ valor: 'plantillas', nombre: 'Reportes listos' }]
    : [
        { valor: 'todos', nombre: 'Todos' },
        { valor: 'recientes', nombre: 'Recientes' },
        ...(puedeCrear ? [{ valor: 'mios' as Vista, nombre: 'Mis reportes' }] : []),
        { valor: 'compartidos', nombre: 'Compartidos conmigo' },
        { valor: 'plantillas', nombre: 'Plantillas' },
        ...(hasPermission('reportes:eliminar') ? [{ valor: 'papelera' as Vista, nombre: 'Papelera' }] : []),
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{simple ? 'Reportes listos' : 'Reportería avanzada'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {simple ? 'Reportes listos para usar. Para armar los tuyos, cambia a modo intermedio.' : 'Arma, guarda y repite tus reportes.'}
          </p>
        </div>
        {puedeCrear && (
          <Link href="/dashboard/reporteria/nuevo" className={buttonVariants()}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo reporte
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {!simple && (
          <aside className="shrink-0 space-y-1 lg:w-56">
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Carpetas</p>
              {puedeCrear && (
                <button type="button" onClick={() => setEditandoCarpeta('nueva')} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Nueva carpeta">
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCarpetaId(null)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${!carpetaId ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
            >
              <FolderOpen className="h-4 w-4" /> Todas
            </button>
            {(carpetas ?? []).map((c) => (
              <div key={c.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setCarpetaId(c.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${carpetaId === c.id ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  title={c.visibilidad === 'COMPARTIDA' ? `Compartida con ${c.roles.length ? c.roles.map((r) => nombreRol(r.nombre)).join(', ') : 'todo el equipo'}` : 'Privada'}
                >
                  {c.visibilidad === 'COMPARTIDA' ? <Users className="h-4 w-4 shrink-0" /> : <FolderLock className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{c.nombre}</span>
                  <span className="ml-auto text-xs text-slate-400">{c.cantidadReportes}</span>
                </button>
                {c.puedeEditar && (
                  <button type="button" onClick={() => setEditandoCarpeta(c)} className="rounded p-1 text-slate-400 opacity-0 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100" aria-label={`Editar ${c.nombre}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {c.puedeEliminar && (
                  <button type="button" onClick={() => setBorrar({ tipo: 'carpeta', id: c.id, nombre: c.nombre })} className="rounded p-1 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Eliminar ${c.nombre}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </aside>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
              {vistas.map((v) => (
                <button
                  key={v.valor}
                  type="button"
                  role="tab"
                  aria-selected={vistaReal === v.valor}
                  onClick={() => setVista(v.valor)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${vistaReal === v.valor ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  {v.nombre}
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar reporte" className={`${claseCampo} w-full pl-8`} />
            </div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : !reportes || reportes.length === 0 ? (
            <EmptyState
              icon={busqueda ? Search : vistaReal === 'papelera' ? Trash2 : BarChart3}
              title={busqueda ? 'Ningún reporte coincide' : vistaReal === 'papelera' ? 'La papelera está vacía' : 'Todavía no hay reportes aquí'}
              description={
                busqueda
                  ? 'Prueba con otra palabra.'
                  : simple
                    ? 'Los reportes listos aparecerán aquí.'
                    : 'Arma uno nuevo: elige qué quieres ver, las columnas y los filtros, y guárdalo para repetirlo cuando quieras.'
              }
              actionLabel={puedeCrear && !busqueda && vistaReal !== 'papelera' ? 'Nuevo reporte' : undefined}
              onAction={() => router.push('/dashboard/reporteria/nuevo')}
              isSearch={!!busqueda}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-4 py-2.5">Reporte</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">Carpeta</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">{vistaReal === 'papelera' ? 'Eliminado' : 'Última vez'}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {reportes.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2.5">
                        {vistaReal === 'papelera' ? (
                          <span className="font-medium text-slate-900 dark:text-white">{r.nombre}</span>
                        ) : (
                          <Link href={`/dashboard/reporteria/${r.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                            {r.nombre}
                          </Link>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.esPlantilla ? 'Plantilla' : r.esMio ? 'Creado por mí' : `De ${r.creadoPor ?? '—'}`}
                          {r.descripcion ? ` · ${r.descripcion}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.tipo.nombre}</td>
                      <td className="hidden px-4 py-2.5 text-slate-600 dark:text-slate-300 md:table-cell">
                        {r.carpeta ? (
                          <span className="inline-flex items-center gap-1">
                            <Folder className="h-3.5 w-3.5" /> {r.carpeta.nombre}
                          </span>
                        ) : r.esPlantilla ? '—' : 'Mis reportes'}
                      </td>
                      <td className="hidden px-4 py-2.5 text-slate-500 dark:text-slate-400 md:table-cell">
                        {vistaReal === 'papelera' ? fechaCorta(r.eliminadoEl) : fechaCorta(r.ultimaEjecucion)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {vistaReal === 'papelera' ? (
                            <Button size="sm" variant="outline" onClick={() => accion.mutate({ ruta: `/reporteria/reportes/${r.id}/restaurar`, metodo: 'post' })}>
                              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Restaurar
                            </Button>
                          ) : (
                            <>
                              {r.puedeEditar && (
                                <Link href={`/dashboard/reporteria/${r.id}/editar`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800" aria-label={`Editar ${r.nombre}`} title="Editar">
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              )}
                              {/* Lo de modo experto se copia (para cambiarlo) solo en modo experto. */}
                              {puedeCrear && (catalogo?.avanzado || !r.usaModoExperto) && (
                                <button type="button" onClick={() => duplicar.mutate(r.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800" aria-label={`Duplicar ${r.nombre}`} title="Duplicar">
                                  <Copy className="h-4 w-4" />
                                </button>
                              )}
                              {r.puedeEliminar && (
                                <button type="button" onClick={() => setBorrar({ tipo: 'reporte', id: r.id, nombre: r.nombre })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800" aria-label={`Eliminar ${r.nombre}`} title="Eliminar">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editandoCarpeta && (
        <DialogoCarpeta
          key={editandoCarpeta === 'nueva' ? 'nueva' : editandoCarpeta.id}
          carpeta={editandoCarpeta === 'nueva' ? null : editandoCarpeta}
          abierto
          cerrar={() => setEditandoCarpeta(null)}
        />
      )}
      <GlobalConfirmDialog
        open={!!borrar}
        onOpenChange={(a) => !a && setBorrar(null)}
        title={borrar?.tipo === 'carpeta' ? '¿Eliminar la carpeta?' : '¿Eliminar el reporte?'}
        description={
          borrar?.tipo === 'carpeta'
            ? `Se elimina la carpeta "${borrar?.nombre}". Tiene que estar vacía.`
            : `"${borrar?.nombre}" va a la papelera; lo puedes restaurar después.`
        }
        confirmText="Eliminar"
        isDestructive
        onConfirm={() => {
          if (!borrar) return;
          accion.mutate({ ruta: borrar.tipo === 'carpeta' ? `/reporteria/carpetas/${borrar.id}` : `/reporteria/reportes/${borrar.id}`, metodo: 'delete' });
          if (borrar.tipo === 'carpeta' && carpetaId === borrar.id) setCarpetaId(null);
          setBorrar(null);
        }}
      />
    </div>
  );
}
