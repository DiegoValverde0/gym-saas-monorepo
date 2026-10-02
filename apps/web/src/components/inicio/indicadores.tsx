"use client";

import Link from 'next/link';
import { ReactNode, useId } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, ScanFace, Users, Wallet } from 'lucide-react';
import { bs } from '@/lib/formato';
import { useColoresGraficos } from '@/lib/colores-graficos';
import { usePermissions } from '@/hooks/use-permissions';

// Indicadores del Inicio (docs/plan-inicio.md, fase 1): cada número con su
// comparación "a la misma altura" y su tendencia, para saber si es mucho o poco.

export interface Kpis {
  ingresos: {
    hoy: number;
    ayerMismaHora: number;
    mes: number;
    mesPasadoMismaAltura: number;
    mesPasado: number;
    variacionMes: number | null;
    variacionHoy: number | null;
    proyeccionMes: number | null;
    serie: { fecha: string; valor: number }[];
  } | null;
  asistencias: { hoy: number; promedioMismoDia: number | null; serie: { fecha: string; valor: number }[] };
  clientes: { activos: number; totales: number; altasMes: number; altasMesPasadoMismaAltura: number };
  membresiasPorVencer: number;
}

const cantidad = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const diaCorto = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Sube, baja o igual, con flecha y texto: nunca solo el color. */
function Cambio({ porcentaje, texto }: { porcentaje: number | null; texto: string }) {
  if (porcentaje === null) return <p className="text-xs text-slate-500 dark:text-slate-400">{texto}</p>;
  const sube = porcentaje > 0;
  const igual = Math.abs(porcentaje) < 0.5;
  const Icono = igual ? ArrowRight : sube ? ArrowUpRight : ArrowDownRight;
  const color = igual ? 'text-slate-600 dark:text-slate-300' : sube ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500 dark:text-slate-400">
      <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-semibold ${color}`}>
        <Icono className="h-3.5 w-3.5" aria-hidden />
        {igual ? 'Igual' : `${sube ? '+' : ''}${cantidad(porcentaje)} %`}
      </span>
      <span>{texto}</span>
    </p>
  );
}

/** La tendencia de los últimos días, con el valor de cada día al pasar el mouse. */
function Tendencia({ serie, formato, alto = 'h-12', nombre }: { serie: { fecha: string; valor: number }[]; formato: (n: number) => string; alto?: string; nombre: string }) {
  const colores = useColoresGraficos();
  const id = useId().replace(/:/g, '');
  if (serie.length === 0) return null;
  return (
    <div className={`${alto} w-full`} role="img" aria-label={`${nombre}: del ${diaCorto(serie[0].fecha)} al ${diaCorto(serie[serie.length - 1].fecha)}, hoy ${formato(serie[serie.length - 1].valor)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={`tendencia-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colores.acento} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colores.acento} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: colores.grilla, strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <span className="text-slate-500 dark:text-slate-400">{diaCorto(String(payload[0].payload.fecha))}: </span>
                  <strong className="text-slate-900 dark:text-white">{formato(Number(payload[0].value))}</strong>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="valor" stroke={colores.acento} strokeWidth={2} fill={`url(#tendencia-${id})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tarjeta({ titulo, icono: Icono, children, enlace }: { titulo: string; icono: typeof Wallet; children: ReactNode; enlace?: { href: string; texto: string } }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{titulo}</h3>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Icono className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
        </span>
      </div>
      {children}
      {enlace && (
        <Link href={enlace.href} className="mt-auto text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          {enlace.texto}
        </Link>
      )}
    </section>
  );
}

const Numero = ({ children }: { children: ReactNode }) => <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">{children}</p>;

/** Los ingresos del mes, en grande: el número con el que abre el Inicio. */
function IngresosDelMes({ ingresos }: { ingresos: NonNullable<Kpis['ingresos']> }) {
  const sinHistoria = ingresos.mesPasadoMismaAltura === 0;
  return (
    <section aria-label="Ingresos del mes" className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-xs dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-slate-900 dark:to-slate-900 lg:col-span-2 lg:row-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Ingresos del mes</h3>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">
          <Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
        </span>
      </div>
      <p className="whitespace-nowrap text-4xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white sm:text-5xl">{bs(ingresos.mes)}</p>
      <Cambio
        porcentaje={sinHistoria ? null : ingresos.variacionMes}
        texto={sinHistoria ? 'El mes pasado no hubo ventas hasta este día.' : `que a esta altura del mes pasado (${bs(ingresos.mesPasadoMismaAltura)})`}
      />
      <div className="mt-1 flex-1">
        <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Últimos 30 días</p>
        <Tendencia serie={ingresos.serie} formato={bs} alto="h-28" nombre="Ingresos de los últimos 30 días" />
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-indigo-100 pt-3 text-xs dark:border-indigo-500/20">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Al ritmo de este mes cerrarías en</dt>
          <dd className="text-base font-semibold text-slate-900 tabular-nums dark:text-white">
            {ingresos.proyeccionMes === null ? <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Se calcula desde el día 3 del mes</span> : bs(ingresos.proyeccionMes)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">El mes pasado cerró en</dt>
          <dd className="text-base font-semibold text-slate-900 tabular-nums dark:text-white">{bs(ingresos.mesPasado)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function Indicadores({ kpis }: { kpis: Kpis }) {
  const { ingresos, asistencias, clientes } = kpis;
  const { hasPermission } = usePermissions();
  const verMembresias = hasPermission('membresias:leer');
  const nombreDia = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
  const variacionAsistencias = asistencias.promedioMismoDia ? Math.round(((asistencias.hoy - asistencias.promedioMismoDia) / asistencias.promedioMismoDia) * 1000) / 10 : null;

  const tarjetas = (
    <>
      {ingresos && (
        <Tarjeta titulo="Ingresos de hoy" icono={Wallet} enlace={{ href: '/dashboard/transacciones', texto: 'Ver movimientos' }}>
          <Numero>{bs(ingresos.hoy)}</Numero>
          <Cambio porcentaje={ingresos.ayerMismaHora === 0 ? null : ingresos.variacionHoy} texto={ingresos.ayerMismaHora === 0 ? 'Ayer a esta hora no había ventas.' : `que ayer a esta hora (${bs(ingresos.ayerMismaHora)})`} />
        </Tarjeta>
      )}
      <Tarjeta titulo="Asistencias de hoy" icono={ScanFace} enlace={{ href: '/dashboard/asistencias', texto: 'Ver quién está adentro' }}>
        <Numero>{cantidad(asistencias.hoy)}</Numero>
        <Cambio
          porcentaje={variacionAsistencias}
          texto={asistencias.promedioMismoDia === null ? 'Todavía no hay semanas para comparar.' : `que lo normal un ${nombreDia} a esta hora (${cantidad(asistencias.promedioMismoDia)})`}
        />
        <Tendencia serie={asistencias.serie} formato={cantidad} nombre="Asistencias de los últimos 14 días" />
      </Tarjeta>
      <Tarjeta titulo="Clientes activos" icono={Users} enlace={{ href: '/dashboard/clientes', texto: 'Ver clientes' }}>
        <Numero>{cantidad(clientes.activos)}</Numero>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <strong className="font-semibold text-slate-700 dark:text-slate-200">+{cantidad(clientes.altasMes)} nuevos</strong> este mes
          {` (${cantidad(clientes.altasMesPasadoMismaAltura)} a esta altura del mes pasado)`} · {cantidad(clientes.totales)} registrados
        </p>
      </Tarjeta>
      {verMembresias && (
        <Tarjeta titulo="Vencen en 7 días" icono={CalendarClock} enlace={{ href: '/dashboard/membresias', texto: 'Ver membresías' }}>
          <Numero>{cantidad(kpis.membresiasPorVencer)}</Numero>
          <p className="text-xs text-slate-500 dark:text-slate-400">{kpis.membresiasPorVencer === 0 ? 'Nadie vence esta semana.' : 'Avísales para que renueven: abajo están quiénes son.'}</p>
        </Tarjeta>
      )}
    </>
  );

  // Con ingresos: el del mes en grande a la izquierda y cuatro tarjetas al lado.
  // Sin ingresos (el instructor no los ve), solo las tarjetas.
  return ingresos ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <IngresosDelMes ingresos={ingresos} />
      {tarjetas}
    </div>
  ) : (
    <div className={`grid grid-cols-1 gap-4 ${verMembresias ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{tarjetas}</div>
  );
}

export function IndicadoresCargando() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Cargando los indicadores">
      <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800 lg:col-span-2 lg:row-span-2" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}
