"use client";

import { useId, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bs } from '@/lib/formato';
import { MAX_SERIES, useColoresGraficos } from '@/lib/colores-graficos';
import { formatearValor, Granularidad, Resultado, Resumen, TipoDato } from './tipos';

// Más que esto no se lee en un gráfico: se muestran los primeros (o los más grandes).
const MAX_PUNTOS = 30;
const MAX_BARRAS_HORIZONTALES = 12;
// Una porción por color de la paleta, contando "Otros".
const MAX_PORCIONES = MAX_SERIES - 1;

const clave = (v: unknown) => JSON.stringify(v ?? null);
type Eje = { clave?: string; tipo: TipoDato; opciones?: Record<string, string>; granularidad?: Granularidad };
const etiqueta = (v: unknown, g: Eje) => {
  if (v === null || v === undefined || v === '') return '(sin dato)';
  // La hora del día (asistencias): "19 h" en vez de "19".
  if (g.clave === 'hora' && g.tipo === 'numero') return `${v} h`;
  return formatearValor(v, g.tipo, g.opciones, g.granularidad);
};

interface Datos {
  puntos: Record<string, string | number | null>[];
  series: { clave: string; nombre: string }[];
  /** Mapa de calor: filas × columnas con su valor. */
  calor?: { filas: string[]; columnas: string[]; valores: number[][] };
  /** Con "destacar": el tramo del mes en curso, punteado (todavía no terminó). */
  parcial?: { clave: string; nombre: string };
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
  if (c && g.tipo === 'calor') {
    const columnas: unknown[] = [];
    for (const r of resultado.resumenes) if (r.conColumna && r.nivel === 0) columnas.push(r.columna);
    const valores = filas.map((f) =>
      columnas.map((col) => {
        const casilla = resultado.resumenes.find((x) => x.conColumna && x.nivel === 1 && clave(x.columna) === clave(col) && clave(x.grupo[0]) === clave(f.grupo[0]));
        return casilla ? valor(casilla) : 0;
      }),
    );
    return {
      puntos: [{}],
      series: [],
      formato,
      medida,
      calor: { filas: filas.map((f) => etiqueta(f.grupo[0], grupo)), columnas: columnas.map((col) => etiqueta(col, c)), valores },
    };
  }
  if (c && g.tipo !== 'torta') {
    const columnas: unknown[] = [];
    for (const r of resultado.resumenes) if (r.conColumna && r.nivel === 0) columnas.push(r.columna);
    // Con "destacar" se quedan las últimas filas (el año actual y los anteriores);
    // si no, las más grandes.
    const elegidas = g.destacar ? filas.slice(-MAX_SERIES) : [...filas].sort((a, b) => valor(b) - valor(a)).slice(0, MAX_SERIES);
    const enOrden = filas.filter((f) => elegidas.includes(f));
    const series = enOrden.map((f, j) => ({ clave: `s${j}`, nombre: etiqueta(f.grupo[0], grupo) }));
    const puntos = columnas.map((col) => {
      const punto: Record<string, string | number | null> = { nombre: etiqueta(col, c) };
      enOrden.forEach((f, j) => {
        const casilla = resultado.resumenes.find((x) => x.conColumna && x.nivel === 1 && clave(x.columna) === clave(col) && clave(x.grupo[0]) === clave(f.grupo[0]));
        // Al comparar años, un mes sin datos (o que todavía no llegó) queda
        // vacío: si no, la línea del año actual cae a 0 en los meses que faltan.
        punto[`s${j}`] = casilla ? valor(casilla) : g.destacar ? null : 0;
      });
      return punto;
    });
    // Comparando años mes a mes, el mes en curso del año actual va a medias:
    // sin avisarlo, la línea destacada "se desploma" al final. Ese tramo va
    // aparte (punteado), desde el mes anterior.
    let parcial: Datos['parcial'];
    const ultima = enOrden[enOrden.length - 1];
    const hoy = new Date();
    if (g.destacar && ultima && grupo?.granularidad === 'anio' && c.clave === 'mesDelAnio' && String(ultima.grupo[0]).startsWith(String(hoy.getFullYear()))) {
      const s = series[series.length - 1];
      const k = columnas.findIndex((col) => Number(col) === hoy.getMonth() + 1);
      if (k >= 0 && puntos[k][s.clave] != null) {
        parcial = { clave: `${s.clave}_parcial`, nombre: `${s.nombre} (en curso)` };
        puntos[k][parcial.clave] = puntos[k][s.clave];
        puntos[k][s.clave] = null;
        if (k > 0) puntos[k - 1][parcial.clave] = puntos[k - 1][s.clave];
      }
    }
    return { puntos, series, parcial, formato, medida, aviso: filas.length > MAX_SERIES ? `Se muestran las ${MAX_SERIES} filas más grandes de ${filas.length}.` : undefined };
  }

  if (g.tipo === 'torta') {
    const positivos = filas.filter((f) => valor(f) > 0).sort((a, b) => valor(b) - valor(a));
    const puntos: Record<string, string | number>[] = positivos.slice(0, MAX_PORCIONES).map((f) => ({ nombre: etiqueta(f.grupo[0], grupo), s0: valor(f) }));
    const resto = positivos.slice(MAX_PORCIONES).reduce((s, f) => s + valor(f), 0);
    if (resto > 0) puntos.push({ nombre: 'Otros', s0: resto });
    return { puntos, series: [{ clave: 's0', nombre: medida }], formato, medida };
  }

  if (g.tipo === 'barrasH') {
    // De mayor a menor: se lee como un ranking.
    const ordenadas = [...filas].sort((a, b) => valor(b) - valor(a));
    return {
      puntos: ordenadas.slice(0, MAX_BARRAS_HORIZONTALES).map((f) => ({ nombre: etiqueta(f.grupo[0], grupo), s0: valor(f) })),
      series: [{ clave: 's0', nombre: medida }],
      formato,
      medida,
      aviso: filas.length > MAX_BARRAS_HORIZONTALES ? `Se muestran los ${MAX_BARRAS_HORIZONTALES} más grandes de ${filas.length}.` : undefined,
    };
  }

  const elegidas = filas.slice(0, MAX_PUNTOS);
  const puntos: Datos['puntos'] = elegidas.map((f) => ({ nombre: etiqueta(f.grupo[0], grupo), s0: valor(f) }));
  // Por día, en líneas o área: hoy va a medias y la curva "cae" al final. Ese
  // último tramo va aparte, punteado (como el mes en curso al comparar años).
  let parcial: Datos['parcial'];
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const k = puntos.length - 1;
  if ((g.tipo === 'lineas' || g.tipo === 'area') && grupo?.tipo === 'fecha' && (!grupo.granularidad || grupo.granularidad === 'dia') && k > 0 && String(elegidas[k].grupo[0]).slice(0, 10) === fechaHoy) {
    parcial = { clave: 's0_parcial', nombre: `${medida} (hoy, en curso)` };
    puntos[k].s0_parcial = puntos[k].s0;
    puntos[k].s0 = null;
    puntos[k - 1].s0_parcial = puntos[k - 1].s0;
  }
  return {
    puntos,
    series: [{ clave: 's0', nombre: medida }],
    parcial,
    formato,
    medida,
    aviso: filas.length > MAX_PUNTOS ? `Se muestran los primeros ${MAX_PUNTOS} grupos de ${filas.length}.` : undefined,
  };
}

function Ayuda({ active, payload, label, formato }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> & { nombre?: string } }[]; label?: string; formato: (n: number) => string }) {
  // Sin los meses vacíos de la comparación de años, ni el tramo "en curso" en
  // el mes anterior (ahí ya está la línea entera con el mismo número).
  payload = payload?.filter((p) => {
    if (p.value == null) return false;
    const k = String(p.dataKey ?? '');
    return !(k.endsWith('_parcial') && p.payload?.[k.replace('_parcial', '')] != null);
  });
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

function MapaDeCalor({ calor, formato, medida }: { calor: NonNullable<Datos['calor']>; formato: (n: number) => string; medida: string }) {
  const colores = useColoresGraficos();
  const [encima, setEncima] = useState<{ fila: number; columna: number } | null>(null);
  const maximo = Math.max(1, ...calor.valores.flat());
  const paso = (v: number) => (v <= 0 ? 0 : Math.min(colores.calor.length - 1, Math.ceil((v / maximo) * (colores.calor.length - 1))));
  const columnasGrilla = `minmax(4.5rem, auto) repeat(${calor.columnas.length}, minmax(1.5rem, 1fr))`;
  const actual = encima ? calor.valores[encima.fila][encima.columna] : null;
  return (
    <div className="space-y-2">
      {/* Qué casilla se está mirando (o una ayuda). */}
      <p className="h-4 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
        {encima ? (
          <>
            {calor.filas[encima.fila]} · {calor.columnas[encima.columna]}: <strong className="text-slate-900 dark:text-white">{formato(actual ?? 0)}</strong> {medida.toLowerCase()}
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Pasa el mouse por una casilla para ver el número.</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-max gap-0.5 text-[11px]" style={{ gridTemplateColumns: columnasGrilla }} role="table" aria-label={`Mapa de calor: ${medida}`} onMouseLeave={() => setEncima(null)}>
          <div role="row" className="contents">
            <span role="columnheader" />
            {calor.columnas.map((col) => (
              <span key={col} role="columnheader" className="text-center text-slate-500 dark:text-slate-400">
                {col}
              </span>
            ))}
          </div>
          {calor.filas.map((fila, i) => (
            <div key={fila} role="row" className="contents">
              <span role="rowheader" className="truncate pr-2 text-slate-600 dark:text-slate-300">
                {fila}
              </span>
              {calor.valores[i].map((v, j) => (
                <span
                  key={j}
                  role="cell"
                  aria-label={`${fila}, ${calor.columnas[j]}: ${formato(v)}`}
                  onMouseEnter={() => setEncima({ fila: i, columna: j })}
                  className={`h-7 rounded-[4px] transition-shadow ${encima?.fila === i && encima.columna === j ? 'ring-2 ring-slate-900 dark:ring-white' : ''}`}
                  style={{ background: colores.calor[paso(v)] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400" aria-hidden>
        <span>Menos</span>
        {colores.calor.map((c) => (
          <span key={c} className="h-3 w-5 rounded-[3px]" style={{ background: c }} />
        ))}
        <span>Más ({formato(maximo)})</span>
      </div>
    </div>
  );
}

/**
 * Gráfico de un reporte agrupado o de una tabla cruzada (docs/plan-reporteria.md,
 * fase 7; formas nuevas en el plan del Inicio, fase 2): barras, barras
 * horizontales, líneas, área, torta o mapa de calor. `enTarjeta`: sin marco
 * propio, para ir dentro de una tarjeta del Inicio.
 */
export function GraficoReporte({ resultado, enTarjeta = false }: { resultado: Resultado; enTarjeta?: boolean }) {
  const colores = useColoresGraficos();
  const gradiente = `area-${useId().replace(/:/g, '')}`;
  const datos = datosDelGrafico(resultado);
  if (!datos || datos.puntos.length === 0) return null;
  const { tipo, destacar } = resultado.definicion.grafico!;
  const { puntos, series, formato } = datos;
  // "Destacar": la última serie en el color principal y las demás en gris.
  const colorSerie = (i: number) => (destacar ? (i === series.length - 1 ? colores.acento : colores.gris) : colores.series[i]);
  const corto = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('es-ES', { notation: 'compact', maximumFractionDigits: 1 }) : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
  const ejes = (
    <>
      <CartesianGrid stroke={colores.grilla} vertical={false} />
      <XAxis dataKey="nombre" stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
      <YAxis stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} tickFormatter={corto} width={64} />
      <Tooltip content={<Ayuda formato={formato} />} cursor={{ fill: 'currentColor', className: 'text-slate-100 dark:text-slate-800' }} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
    </>
  );

  const marco = enTarjeta ? '' : 'rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 print:break-inside-avoid';
  if (datos.calor) {
    return (
      <figure className={marco}>
        {!enTarjeta && <figcaption className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{datos.medida}</figcaption>}
        <MapaDeCalor calor={datos.calor} formato={formato} medida={datos.medida} />
      </figure>
    );
  }
  const altoBarrasH = Math.max(160, puntos.length * 30 + 30);

  return (
    <figure className={marco}>
      <figcaption className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{datos.medida}</figcaption>
      <div className={tipo === 'barrasH' ? 'w-full' : enTarjeta ? 'h-56 w-full' : 'h-64 w-full'} style={tipo === 'barrasH' ? { height: altoBarrasH } : undefined}>
        <ResponsiveContainer width="100%" height="100%">
          {tipo === 'barrasH' ? (
            <BarChart data={puntos} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid stroke={colores.grilla} horizontal={false} />
              <XAxis type="number" stroke="currentColor" className="text-slate-500 dark:text-slate-400" fontSize={12} tickLine={false} axisLine={false} tickFormatter={corto} />
              <YAxis type="category" dataKey="nombre" stroke="currentColor" className="text-slate-600 dark:text-slate-300" fontSize={12} tickLine={false} axisLine={false} width={130} />
              <Tooltip content={<Ayuda formato={formato} />} cursor={{ fill: 'currentColor', className: 'text-slate-100 dark:text-slate-800' }} />
              <Bar dataKey="s0" name={series[0].nombre} fill={colores.acento} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          ) : tipo === 'area' ? (
            <AreaChart data={puntos} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colores.acento} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={colores.acento} stopOpacity={0} />
                </linearGradient>
              </defs>
              {ejes}
              <Area type="monotone" dataKey="s0" name={series[0].nombre} stroke={colores.acento} strokeWidth={2} fill={`url(#${gradiente})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              {datos.parcial && (
                <Area type="monotone" dataKey={datos.parcial.clave} name={datos.parcial.nombre} stroke={colores.acento} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4 }} legendType="none" isAnimationActive={false} />
              )}
            </AreaChart>
          ) : tipo === 'torta' ? (
            <PieChart>
              {/* Un borde del color del fondo separa las porciones (2 px). */}
              <Pie data={puntos} dataKey="s0" nameKey="nombre" innerRadius="45%" outerRadius="80%" stroke={colores.superficie} strokeWidth={2} isAnimationActive={false}>
                {puntos.map((p, i) => (
                  <Cell key={i} fill={p.nombre === 'Otros' ? colores.gris : colores.series[i]} />
                ))}
              </Pie>
              <Tooltip content={<Ayuda formato={formato} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          ) : tipo === 'lineas' ? (
            <LineChart data={puntos} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              {ejes}
              {series.map((s, i) => (
                <Line key={s.clave} type="monotone" dataKey={s.clave} name={s.nombre} stroke={colorSerie(i)} strokeWidth={destacar && i === series.length - 1 ? 3 : 2} dot={{ r: 4 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              ))}
              {datos.parcial && (
                <Line type="monotone" dataKey={datos.parcial.clave} name={datos.parcial.nombre} stroke={colores.acento} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} activeDot={{ r: 5 }} legendType="none" isAnimationActive={false} />
              )}
            </LineChart>
          ) : (
            <BarChart data={puntos} margin={{ top: 5, right: 12, bottom: 5, left: 0 }} barGap={2}>
              {ejes}
              {series.map((s, i) => (
                <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={colorSerie(i)} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {datos.aviso && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{datos.aviso}</p>}
    </figure>
  );
}
