"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { BotonCsv, NOMBRE_PAGO, RangoPreset, SelectorRango, TablaSimple, bs, rangoDe } from './compartido';

interface Totales {
  ingresos: number;
  porFormaPago: Record<string, number>;
  ventas: number;
  gastos: number;
  membresiasVendidas: number;
  asistencias: number;
  clientesNuevos: number;
}

export const cargando = <div className="h-32 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />;
export const qs = (params: Record<string, string | null | undefined>) =>
  Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');

export function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{valor}</p>
      {detalle && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detalle}</div>}
    </div>
  );
}

// Cambio frente al mismo tramo del mes anterior: flecha + texto (nunca solo color).
function Cambio({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0) return <span>{actual > 0 ? 'Sin datos del mes pasado para comparar' : 'Igual que el mes pasado'}</span>;
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3" /> Igual que el mes pasado</span>;
  const sube = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${sube ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
      {sube ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {sube ? '+' : ''}{pct}% frente al mes pasado
    </span>
  );
}

/** Simple (plan 11.8): "Hoy" y "Este mes" frente al mismo tramo del mes pasado. */
export function VistaResumen({ sucursalId }: { sucursalId: string | null }) {
  const { data } = useQuery({
    queryKey: ['reportes', 'resumen', sucursalId],
    queryFn: async () => apiGet<{ hoy: Totales; mes: Totales; mesAnterior: Totales; diasDelMes: number }>(`/reportes/resumen?${qs({ sucursalId })}`),
    refetchInterval: 60 * 1000,
  });
  if (!data) return cargando;
  const formas = Object.entries(data.hoy.porFormaPago);
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Hoy</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            titulo="Cobrado"
            valor={bs(data.hoy.ingresos)}
            detalle={formas.length ? formas.map(([m, v]) => `${NOMBRE_PAGO[m] ?? m} ${bs(v)}`).join(' · ') : 'Todavía no hay cobros'}
          />
          <Tile titulo="Ventas" valor={String(data.hoy.ventas)} detalle={`${data.hoy.membresiasVendidas} de membresías`} />
          <Tile titulo="Ingresos al gimnasio" valor={String(data.hoy.asistencias)} />
          <Tile titulo="Gastos" valor={bs(data.hoy.gastos)} />
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Este mes <span className="font-normal text-slate-500 dark:text-slate-400">(primeros {data.diasDelMes} días, frente a los mismos días del mes pasado)</span>
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile titulo="Cobrado" valor={bs(data.mes.ingresos)} detalle={<Cambio actual={data.mes.ingresos} anterior={data.mesAnterior.ingresos} />} />
          <Tile titulo="Membresías vendidas" valor={String(data.mes.membresiasVendidas)} detalle={<Cambio actual={data.mes.membresiasVendidas} anterior={data.mesAnterior.membresiasVendidas} />} />
          <Tile titulo="Ingresos al gimnasio" valor={String(data.mes.asistencias)} detalle={<Cambio actual={data.mes.asistencias} anterior={data.mesAnterior.asistencias} />} />
          <Tile titulo="Gastos" valor={bs(data.mes.gastos)} detalle={`Queda ${bs(data.mes.ingresos - data.mes.gastos)} después de gastos`} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Clientes nuevos este mes: {data.mes.clientesNuevos}.</p>
      </section>
    </div>
  );
}

export function useRango() {
  const [preset, setPreset] = useState<RangoPreset>('mes');
  return { preset, setPreset, ...rangoDe(preset) };
}

/** Intermedio: membresías vendidas por plan. */
export function VistaPlanes({ sucursalId, csv }: { sucursalId: string | null; csv: boolean }) {
  const r = useRango();
  const { data } = useQuery({
    queryKey: ['reportes', 'planes', sucursalId, r.desde, r.hasta],
    queryFn: async () => apiGet<{ filas: { planId: string; plan: string; ventas: number; monto: number }[] }>(`/reportes/planes?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`),
  });
  const total = data?.filas.reduce((s, f) => s + f.monto, 0) ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorRango valor={r.preset} onChange={r.setPreset} />
        {csv && data && <BotonCsv nombre={`ventas-por-plan-${r.desde}`} columnas={['Plan', 'Ventas', 'Monto']} filas={data.filas.map((f) => [f.plan, f.ventas, f.monto])} />}
      </div>
      {!data ? cargando : (
        <TablaSimple
          columnas={[{ titulo: 'Plan' }, { titulo: 'Vendidas', derecha: true }, { titulo: 'Monto', derecha: true }, { titulo: '% del total', derecha: true }]}
          filas={data.filas.map((f) => [f.plan, f.ventas, bs(f.monto), total ? `${Math.round((f.monto / total) * 100)}%` : '—'])}
          vacio="No se vendieron membresías en este período."
        />
      )}
    </div>
  );
}

/** Intermedio: ocupación de las clases. */
export function VistaClases({ sucursalId, csv }: { sucursalId: string | null; csv: boolean }) {
  const r = useRango();
  const { data } = useQuery({
    queryKey: ['reportes', 'clases', sucursalId, r.desde, r.hasta],
    queryFn: async () =>
      apiGet<{ filas: { clase: string; disciplina: string | null; sesiones: number; cupos: number; reservas: number; asistieron: number; ocupacion: number }[] }>(
        `/reportes/clases?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`,
      ),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorRango valor={r.preset} onChange={r.setPreset} />
        {csv && data && (
          <BotonCsv
            nombre={`ocupacion-clases-${r.desde}`}
            columnas={['Clase', 'Sesiones', 'Cupos', 'Reservas', 'Asistieron', 'Ocupación %']}
            filas={data.filas.map((f) => [f.clase, f.sesiones, f.cupos, f.reservas, f.asistieron, f.ocupacion])}
          />
        )}
      </div>
      {!data ? cargando : (
        <TablaSimple
          columnas={[{ titulo: 'Clase' }, { titulo: 'Sesiones', derecha: true }, { titulo: 'Reservas / cupos', derecha: true }, { titulo: 'Asistieron', derecha: true }, { titulo: 'Ocupación', derecha: true }]}
          filas={data.filas.map((f) => [
            <span key="c">{f.clase}{f.disciplina && <span className="text-xs text-slate-500"> · {f.disciplina}</span>}</span>,
            f.sesiones,
            `${f.reservas} / ${f.cupos}`,
            f.asistieron,
            `${f.ocupacion}%`,
          ])}
          vacio="No hubo sesiones de clases en este período."
        />
      )}
    </div>
  );
}

// Lunes primero; el servidor usa 0 = domingo.
const DIAS = [
  { i: 1, n: 'Lun' }, { i: 2, n: 'Mar' }, { i: 3, n: 'Mié' }, { i: 4, n: 'Jue' }, { i: 5, n: 'Vie' }, { i: 6, n: 'Sáb' }, { i: 0, n: 'Dom' },
];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Intermedio: ingresos al gimnasio por día y hora. Mapa de calor de un solo
 * tono (claro = pocos, oscuro = muchos), con el valor en el tooltip de cada
 * celda y la hora pico escrita debajo.
 */
export function VistaAsistencia({ sucursalId }: { sucursalId: string | null }) {
  const r = useRango();
  const { data } = useQuery({
    queryKey: ['reportes', 'asistencia', sucursalId, r.desde, r.hasta],
    queryFn: async () => apiGet<{ total: number; matriz: number[][] }>(`/reportes/asistencia?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`),
  });

  let contenido: React.ReactNode = cargando;
  if (data) {
    const max = Math.max(0, ...data.matriz.flat());
    const conDatos = data.matriz.flatMap((fila) => fila.map((v, h) => (v > 0 ? h : -1))).filter((h) => h >= 0);
    const desde = conDatos.length ? Math.min(...conDatos) : 6;
    const hasta = conDatos.length ? Math.max(...conDatos) : 21;
    const horas = Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k);
    let pico = { dia: 0, hora: 0, valor: 0 };
    data.matriz.forEach((fila, d) => fila.forEach((v, h) => { if (v > pico.valor) pico = { dia: d, hora: h, valor: v }; }));

    contenido = data.total === 0 ? (
      <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">No hay ingresos registrados en este período.</p>
    ) : (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <table className="border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th />
                {horas.map((h) => <th key={h} className="px-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {DIAS.map((d) => (
                <tr key={d.i}>
                  <th className="pr-2 text-left text-xs font-medium text-slate-600 dark:text-slate-300">{d.n}</th>
                  {horas.map((h) => {
                    const v = data.matriz[d.i][h];
                    const texto = `${DIAS_LARGO[d.i]} de ${h}:00 a ${h + 1}:00 · ${v} ${v === 1 ? 'ingreso' : 'ingresos'}`;
                    return (
                      <td key={h} title={texto} aria-label={texto} className="h-7 w-7 min-w-7 rounded-[4px] bg-slate-100 dark:bg-slate-800 p-0">
                        {v > 0 && <div className="h-full w-full rounded-[4px] bg-indigo-600 dark:bg-indigo-400" style={{ opacity: 0.15 + 0.85 * (v / max) }} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>
            {data.total} ingresos. Hora con más gente: <strong className="text-slate-700 dark:text-slate-200">{DIAS_LARGO[pico.dia]} de {pico.hora}:00 a {pico.hora + 1}:00</strong> ({pico.valor}).
          </p>
          <div className="flex items-center gap-2" aria-hidden>
            <span>Menos</span>
            <span className="h-3 w-24 rounded-sm bg-gradient-to-r from-indigo-600/15 to-indigo-600 dark:from-indigo-400/15 dark:to-indigo-400" />
            <span>Más ({max})</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SelectorRango valor={r.preset} onChange={r.setPreset} />
      {contenido}
    </div>
  );
}

/** Experto: horas, atrasos y costo del equipo (horas trabajadas × costo por hora). */
export function VistaEquipo({ sucursalId }: { sucursalId: string | null }) {
  const r = useRango();
  const { data } = useQuery({
    queryKey: ['reportes', 'equipo', sucursalId, r.desde, r.hasta],
    queryFn: async () =>
      apiGet<{
        toleranciaAtrasoMinutos: number;
        filas: { staffId: string; persona: string; jornadas: number; horasProgramadas: number; horasTrabajadas: number; ausencias: number; sinMarcar: number; atrasos: number; minutosAtraso: number; costoPorHora: number; costo: number }[];
      }>(`/reportes/equipo?${qs({ sucursalId, desde: r.desde, hasta: r.hasta })}`),
  });
  const totalCosto = data?.filas.reduce((s, f) => s + f.costo, 0) ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorRango valor={r.preset} onChange={r.setPreset} />
        {data && (
          <BotonCsv
            nombre={`equipo-${r.desde}`}
            columnas={['Persona', 'Jornadas', 'Horas programadas', 'Horas trabajadas', 'Ausencias', 'Sin marcar', 'Atrasos', 'Minutos de atraso', 'Costo por hora', 'Costo']}
            filas={data.filas.map((f) => [f.persona, f.jornadas, f.horasProgramadas, f.horasTrabajadas, f.ausencias, f.sinMarcar, f.atrasos, f.minutosAtraso, f.costoPorHora, f.costo])}
          />
        )}
      </div>
      {!data ? cargando : (
        <>
          <TablaSimple
            columnas={[
              { titulo: 'Persona' },
              { titulo: 'Horas (trabajadas / programadas)', derecha: true },
              { titulo: 'Ausencias', derecha: true },
              { titulo: 'Sin marcar', derecha: true },
              { titulo: 'Atrasos', derecha: true },
              { titulo: 'Costo', derecha: true },
            ]}
            filas={data.filas.map((f) => [
              f.persona,
              `${f.horasTrabajadas} / ${f.horasProgramadas}`,
              f.ausencias,
              f.sinMarcar,
              f.atrasos ? `${f.atrasos} (${f.minutosAtraso} min)` : '0',
              f.costoPorHora ? bs(f.costo) : <span key="s" className="text-xs text-slate-400">Sin costo por hora</span>,
            ])}
            vacio="No hay jornadas del equipo en este período."
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Horas trabajadas = entrada y salida marcadas. Atraso = llegar más de {data.toleranciaAtrasoMinutos} minutos tarde. Costo total: {bs(totalCosto)} (horas trabajadas × costo por hora de cada persona, en Equipo).
          </p>
        </>
      )}
    </div>
  );
}
