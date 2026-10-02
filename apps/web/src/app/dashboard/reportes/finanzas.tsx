"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, unwrapList } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { useListaPaginada } from '@/hooks/use-lista-paginada';
import { Paginacion } from '@/components/ui/paginacion';
import { NOMBRE_CONCEPTO } from '@/lib/formato';
import { BotonCsv, NOMBRE_PAGO, SelectorRango, TablaSimple, bs } from './compartido';
import { Tile, cargando, qs, useRango } from './vistas';

interface Financiero {
  desde: string;
  hasta: string;
  ingresos: number;
  egresos: number;
  resultado: number;
  porConcepto: { tipo: 'INGRESO' | 'EGRESO'; concepto: string; monto: number }[];
  porMes: { mes: string; ingresos: number; egresos: number; resultado: number }[];
  porFormaPago: { metodo: string; ingresos: number; egresos: number }[];
  porCuenta: { cuenta: string; ingresos: number; egresos: number; neto: number }[];
}

const nombreMes = (mes: string) => {
  const texto = new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const porcentaje = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '-');

/** Experto: estado financiero del período (plan 11.8). */
export function VistaFinanzas({ sucursalId }: { sucursalId: string | null }) {
  const r = useRango();
  const { data } = useQuery({
    queryKey: ['reportes', 'financiero', sucursalId, r.desde, r.hasta],
    queryFn: async () => apiGet<Financiero>(`/reportes/financiero?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`),
  });
  // Costo estimado del equipo (horas trabajadas × costo por hora): solo para
  // quien puede ver las jornadas, igual que la pestaña Equipo.
  const { hasPermission } = usePermissions();
  const modulos = useModulosActivos();
  const verCosto = modulos.controlPersonal && hasPermission('turnos:leer');
  const { data: equipo } = useQuery({
    queryKey: ['reportes', 'equipo', sucursalId, r.desde, r.hasta],
    queryFn: async () => apiGet<{ filas: { costo: number }[] }>(`/reportes/equipo?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`),
    enabled: verCosto,
  });
  const costoEquipo = equipo?.filas.reduce((s, f) => s + f.costo, 0) ?? 0;

  const ingresosConcepto = data?.porConcepto.filter((c) => c.tipo === 'INGRESO') ?? [];
  const gastosConcepto = data?.porConcepto.filter((c) => c.tipo === 'EGRESO') ?? [];
  const margen = data && data.ingresos > 0 ? Math.round((data.resultado / data.ingresos) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorRango valor={r.preset} onChange={r.setPreset} />
        {data && (
          <BotonCsv
            nombre={`finanzas-${data.desde}-${data.hasta}`}
            columnas={['Tipo', 'Concepto', 'Monto']}
            filas={[
              ...data.porConcepto.map((c) => [c.tipo === 'INGRESO' ? 'Ingreso' : 'Gasto', NOMBRE_CONCEPTO[c.concepto] ?? c.concepto, c.monto]),
              ['', 'Total ingresos', data.ingresos],
              ['', 'Total gastos', data.egresos],
              ['', 'Resultado', data.resultado],
            ]}
          />
        )}
      </div>

      {!data ? cargando : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${verCosto ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <Tile titulo="Ingresos" valor={bs(data.ingresos)} />
            <Tile titulo="Gastos" valor={bs(data.egresos)} />
            <Tile titulo="Resultado" valor={bs(data.resultado)} detalle={margen !== null ? `Margen: ${margen}% de lo cobrado` : undefined} />
            {verCosto && (
              <Tile
                titulo="Costo del equipo"
                valor={bs(costoEquipo)}
                detalle={costoEquipo > 0 ? `Estimado, sin registrar como gasto. Con él: ${bs(data.resultado - costoEquipo)}` : 'Sin horas con costo en este período'}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">De dónde vino el dinero</p>
              <TablaSimple
                columnas={[{ titulo: 'Concepto' }, { titulo: 'Monto', derecha: true }, { titulo: '%', derecha: true }]}
                filas={ingresosConcepto.map((c) => [NOMBRE_CONCEPTO[c.concepto] ?? c.concepto, bs(c.monto), porcentaje(c.monto, data.ingresos)])}
                vacio="No hubo ingresos en este período."
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">En qué se gastó</p>
              <TablaSimple
                columnas={[{ titulo: 'Categoría' }, { titulo: 'Monto', derecha: true }, { titulo: '%', derecha: true }]}
                filas={gastosConcepto.map((c) => [NOMBRE_CONCEPTO[c.concepto] ?? c.concepto, bs(c.monto), porcentaje(c.monto, data.egresos)])}
                vacio="No hubo gastos en este período."
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mes a mes</p>
            <TablaSimple
              columnas={[{ titulo: 'Mes' }, { titulo: 'Ingresos', derecha: true }, { titulo: 'Gastos', derecha: true }, { titulo: 'Resultado', derecha: true }]}
              filas={data.porMes.map((m) => [
                nombreMes(m.mes),
                bs(m.ingresos),
                bs(m.egresos),
                <span key="r" className={m.resultado < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'font-semibold'}>{bs(m.resultado)}</span>,
              ])}
              vacio="Sin movimientos en este período."
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Por forma de pago</p>
              <TablaSimple
                columnas={[{ titulo: 'Forma' }, { titulo: 'Entró', derecha: true }, { titulo: 'Salió', derecha: true }]}
                filas={data.porFormaPago.map((f) => [NOMBRE_PAGO[f.metodo] ?? f.metodo, bs(f.ingresos), bs(f.egresos)])}
                vacio="Sin pagos en este período."
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Por cuenta</p>
              <TablaSimple
                columnas={[{ titulo: 'Cuenta' }, { titulo: 'Entró', derecha: true }, { titulo: 'Salió', derecha: true }, { titulo: 'Neto', derecha: true }]}
                filas={data.porCuenta.map((c) => [c.cuenta, bs(c.ingresos), bs(c.egresos), bs(c.neto)])}
                vacio="Sin pagos en este período."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actividad (auditoría)
// ---------------------------------------------------------------------------

const TIPOS_ACTIVIDAD: { valor: string; nombre: string }[] = [
  { valor: 'eliminar', nombre: 'Eliminaciones' },
  { valor: 'restaurar', nombre: 'Restauraciones' },
  { valor: 'dar_acceso', nombre: 'Accesos dados' },
  { valor: 'cambiar_acceso', nombre: 'Accesos cambiados' },
  { valor: 'revocar_acceso', nombre: 'Accesos quitados' },
  { valor: 'editar_rol', nombre: 'Roles editados' },
  { valor: 'cambiar_precio', nombre: 'Cambios de precio' },
  { valor: 'cambiar_configuracion', nombre: 'Cambios de configuración' },
  { valor: 'forzar_ingreso', nombre: 'Ingresos forzados' },
  { valor: 'cerrar_caja_con_diferencia', nombre: 'Cierres de caja con diferencia' },
  { valor: 'abrir_caja_con_diferencia', nombre: 'Aperturas de caja con diferencia' },
  { valor: 'pin_kiosco', nombre: 'PIN del kiosco' },
  { valor: 'restablecer_contrasena', nombre: 'Contraseñas restablecidas' },
  { valor: 'compartir_reportes', nombre: 'Reportes compartidos' },
  { valor: 'exportar_reporte', nombre: 'Reportes exportados' },
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS_ACTIVIDAD.map((t) => [t.valor, t.nombre]));

interface FilaActividad { id: string; fechaHora: string; accion: string; descripcion: string; persona: string; ipOrigen: string | null }

const selectClase = 'h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-700 dark:text-slate-200';

/** Experto: quién hizo qué y cuándo (auditoría, plan 11.8). */
export function VistaActividad() {
  const { token } = useAuth();
  const r = useRango();
  const [accion, setAccion] = useState('');
  const [usuarioId, setUsuarioId] = useState('');

  // Personas con acceso a la organización, para filtrar.
  const { data: personas = [] } = useQuery({
    queryKey: ['usuarios', 'actividad'],
    queryFn: async () => unwrapList<{ usuario?: { id: string; nombreCompleto: string } }>(await apiGet('/usuario')),
    enabled: !!token,
  });
  const opcionesPersona = [...new Map(personas.filter((p) => p.usuario).map((p) => [p.usuario!.id, p.usuario!.nombreCompleto])).entries()];

  const lista = useListaPaginada<FilaActividad>({
    entidad: 'auditoria',
    ruta: '/auditoria',
    filtros: { desde: r.desde, hasta: r.hasta, accion: accion || undefined, usuarioId: usuarioId || undefined },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorRango valor={r.preset} onChange={r.setPreset} />
        <select aria-label="Tipo de acción" value={accion} onChange={(e) => setAccion(e.target.value)} className={selectClase}>
          <option value="">Todas las acciones</option>
          {TIPOS_ACTIVIDAD.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
        </select>
        <select aria-label="Persona" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={selectClase}>
          <option value="">Todas las personas</option>
          {opcionesPersona.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </div>

      {lista.cargando ? cargando : (
        <TablaSimple
          columnas={[{ titulo: 'Cuándo' }, { titulo: 'Quién' }, { titulo: 'Qué hizo' }]}
          filas={lista.items.map((f) => [
            <span key="f" className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
              {new Date(f.fechaHora).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>,
            f.persona,
            <span key="d" className="block">
              {f.descripcion}
              <span className="ml-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">{NOMBRE_TIPO[f.accion] ?? f.accion}</span>
            </span>,
          ])}
          vacio="No hay actividad registrada con estos filtros."
        />
      )}

      <Paginacion
        pagina={lista.pagina}
        totalPaginas={lista.totalPaginas}
        total={lista.total}
        porPagina={lista.porPagina}
        onCambiar={lista.setPagina}
        nombre={['acción', 'acciones']}
        actualizando={lista.actualizando}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Se anotan las eliminaciones y restauraciones, los cambios de accesos, roles, precios y configuración, los ingresos forzados y los cierres de caja con diferencia.
      </p>
    </div>
  );
}
