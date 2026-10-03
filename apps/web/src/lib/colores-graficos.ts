"use client";

import { useTheme } from 'next-themes';

// Colores de los gráficos (docs/plan-inicio.md, fase 1). Paleta de categorías
// validada con el validador de la guía de visualización de datos: el índigo de
// la marca primero y sin rojo ni ámbar, que quedan para los avisos (faltante,
// por vencer). Peor par vecino para daltonismo: ΔE 13,1 (mínimo 8); para la
// vista normal: ΔE 20,4 (mínimo 15); todos con contraste de 3:1 o más contra el
// fondo. El modo oscuro tiene sus propios pasos, validados contra slate-900.
// El ORDEN es parte de la validación: no se reordena ni se agregan colores.

const SERIES_CLARO = ['#4f46e5', '#eb6834', '#2a78d6', '#008300', '#7c3aed', '#0d9488'] as const;
const SERIES_OSCURO = ['#6366f1', '#d95926', '#3987e5', '#008300', '#9085e9', '#0f9b8e'] as const;

/**
 * Mapa de calor: un solo color (el índigo), de "casi nada" a "lo más lleno".
 * Validadas como escala ordinal (luminosidad pareja, pasos visibles, un solo
 * tono); el paso más bajo se confunde a propósito con el fondo: es "casi nadie".
 * En oscuro, más es más brillante.
 */
const CALOR_CLARO = ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#4f46e5', '#3730a3'] as const;
const CALOR_OSCURO = ['#1e1b4b', '#312e81', '#4338ca', '#6366f1', '#818cf8', '#a5b4fc'] as const;

/** Más series que colores: el resto se junta en "Otros", en gris. */
export const MAX_SERIES = SERIES_CLARO.length;

interface ColoresGraficos {
  series: readonly string[];
  /** El color principal (un solo dato o el destacado). */
  acento: string;
  /** Lo que acompaña sin competir (el año pasado, "Otros"). */
  gris: string;
  /** Líneas de la grilla y ejes. */
  grilla: string;
  texto: string;
  /** El fondo de la tarjeta: separa porciones y barras vecinas (2 px). */
  superficie: string;
  calor: readonly string[];
}

const CLARO: ColoresGraficos = { series: SERIES_CLARO, acento: SERIES_CLARO[0], gris: '#cbd5e1', grilla: '#e2e8f0', texto: '#64748b', superficie: '#ffffff', calor: CALOR_CLARO };
const OSCURO: ColoresGraficos = { series: SERIES_OSCURO, acento: SERIES_OSCURO[0], gris: '#475569', grilla: '#1e293b', texto: '#94a3b8', superficie: '#0f172a', calor: CALOR_OSCURO };

/** Los colores del tema que se ve (claro u oscuro). */
export function useColoresGraficos(): ColoresGraficos {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? OSCURO : CLARO;
}
