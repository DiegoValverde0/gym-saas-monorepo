"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bs } from '@/lib/formato';
import { formatearValor, Granularidad, Resultado, Resumen, TipoDato } from './tipos';

const COLORES = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
const COLOR_OTROS = '#94a3b8';
// Más que esto no se lee en un gráfico: se muestran los primeros (o los más grandes).
const MAX_PUNTOS = 30;
const MAX_SERIES = 8;
const MAX_PORCIONES = 8;

const clave = (v: unknown) => JSON.stringify(v ?? null);
const etiqueta = (v: unknown, g: { tipo: TipoDato; opciones?: Record<string, string>; granularidad?: Granularidad }) =>
  v === null || v === undefined || v === '' ? '(sin dato)' : formatearValor(v, g.tipo, g.opciones, g.granularidad);

interface Datos {
  puntos: Record<string, string | number>[];
  series: { clave: string; nombre: string }[];
  formato: (n: number) => string;
  medida: string;
  aviso?: string;
}

/** Los números del gráfico, sacados de los subtotales que ya trae el resultado. */
function datosDelGrafico(resultado: Resultado): Datos | null {
  const g = resultado.definicion.grafico;
  if (!g) return null;
  const i = resultado.totales.findIndex((t) => `${t.funcion}:${t.clave}` === g.valor);
  const total = i >= 0 ? resultado.totales[i] : undefined;
  const moneda = total && total.funcion !== 'distintos' && total.tipo === 'moneda';
  const formato = (n: number) => (moneda ? bs(n) : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
  const valor = (r: Resumen) => (total ? Number(r.totales[i] ?? 0) : r.cantidad);
  const medida = total?.nombre ?? 'Registros';
  const grupo = resultado.agrupaciones[0];
  const filas = resultado.resumenes.filter((r) => r.nivel === 1 && !r.conColumna);

  // Tabla cruzada: lo que va en sus columnas (muchas veces, los meses) en el
  // eje, y una serie por cada fila. La torta reparte los totales de las filas.
  const c = resultado.columnaCruzada;
  if (c && g.tipo !== 'torta') {
    const columnas: unknown[] = [];
    for (const r of resultado.resumenes) if (r.conColumna && r.nivel === 0) columnas.push(r.columna);
    const elegidas = [...filas].sort((a, b) => valor(b) - valor(a)).slice(0, MAX_SERIES);
    const enOrden = filas.filter((f) => elegidas.includes(f));
    const series = enOrden.map((f, j) => ({ clave: `s${j}`, nombre: etiqueta(f.grupo[0], grupo) }));
    const puntos = columnas.map((col) => {
      const punto: Record<string, string | number> = { nombre: etiqueta(col, c) };
      enOrden.forEach((f, j) => {
        const casilla = resultado.resumenes.find((x) => x.conColumna && x.nivel === 1 && clave(x.columna) === clave(col) && clave(x.grupo[0]) === clave(f.grupo[0]));
        punto[`s${j}`] = casilla ? valor(casilla) : 0;
      });
      return punto;
    });
    return { puntos, series, formato, medida, aviso: filas.length > MAX_SERIES ? `Se muestran las ${MAX_SERIES} filas más grandes de ${filas.length}.` : undefined };
  }

  if (g.tipo === 'torta') {
    const positivos = filas.filter((f) => valor(f) > 0).sort((a, b) => valor(b) - valor(a));
    const puntos: Record<string, string | number>[] = positivos.slice(0, MAX_PORCIONES).map((f) => ({ nombre: etiqueta(f.grupo[0], grupo), s0: valor(f) }));
    const resto = positivos.slice(MAX_PORCIONES).reduce((s, f) => s + valor(f), 0);
    if (resto > 0) puntos.push({ nombre: 'Otros', s0: resto });
    return { puntos, series: [{ clave: 's0', nombre: medida }], formato, medida };
  }

  const puntos = filas.slice(0, MAX_PUNTOS).map((f) => ({ nombre: etiqueta(f.grupo[0], grupo), s0: valor(f) }));
  return {
    puntos,
    series: [{ clave: 's0', nombre: medida }],
    formato,
    medida,
    aviso: filas.length > MAX_PUNTOS ? `Se muestran los primeros ${MAX_PUNTOS} grupos de ${filas.length}.` : undefined,
  };
}

function Ayuda({ active, payload, label, formato }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: { nombre?: string } }[]; label?: string; formato: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{label ?? payload[0].payload?.nombre}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong className="text-slate-900 dark:text-white">{formato(Number(p.value ?? 0))}</strong>
        </p>
      ))}
    </div>
  );
}

/**
 * Gráfico de un reporte agrupado o de una tabla cruzada (docs/plan-reporteria.md,
 * fase 7): barras, líneas o torta sobre el primer nivel de grupos.
 */
export function GraficoReporte({ resultado }: { resultado: Resultado }) {
  const datos = datosDelGrafico(resultado);
  if (!datos || datos.puntos.length === 0) return null;
  const tipo = resultado.definicion.grafico!.tipo;
  const { puntos, series, formato } = datos;
  const corto = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('es-ES', { notation: 'compact', maximumFractionDigits: 1 }) : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
  const ejes = (
    <>
      <CartesianGrid stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="4 4" vertical={false} />
      <XAxis dataKey="nombre" stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
      <YAxis stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} tickFormatter={corto} width={48} />
      <Tooltip content={<Ayuda formato={formato} />} cursor={{ fill: 'currentColor', className: 'text-slate-100 dark:text-slate-800' }} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
    </>
  );

  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 print:break-inside-avoid">
      <figcaption className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{datos.medida}</figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {tipo === 'torta' ? (
            <PieChart>
              <Pie data={puntos} dataKey="s0" nameKey="nombre" innerRadius="45%" outerRadius="80%" paddingAngle={1} stroke="none" isAnimationActive={false}>
                {puntos.map((p, i) => (
                  <Cell key={i} fill={p.nombre === 'Otros' ? COLOR_OTROS : COLORES[i % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip content={<Ayuda formato={formato} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          ) : tipo === 'lineas' ? (
            <LineChart data={puntos} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              {ejes}
              {series.map((s, i) => (
                <Line key={s.clave} type="monotone" dataKey={s.clave} name={s.nombre} stroke={COLORES[i % COLORES.length]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={puntos} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              {ejes}
              {series.map((s, i) => (
                <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={COLORES[i % COLORES.length]} radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {datos.aviso && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{datos.aviso}</p>}
    </figure>
  );
}
