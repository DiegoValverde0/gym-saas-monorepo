import type { RangoFecha } from '@/app/dashboard/reporteria/tipos';

// Las tarjetas del Inicio (docs/plan-inicio.md). Se guardan en
// organizaciones.configuracion.tablero (un diseño por gimnasio, decisión I1);
// la API las valida en update-mi-organizacion.dto.ts (TarjetaTableroDto).

export type TamanoTarjeta = 'chica' | 'mediana' | 'ancha';

export interface TarjetaTablero {
  /** "plantilla:<clave>", "reporte:<id>", "estado-clientes" o "por-vencer". */
  id: string;
  tamano: TamanoTarjeta;
  /** El período con el que se muestra (si no, el del reporte). */
  rango?: RangoFecha;
}

/** El Inicio de quien todavía no lo personalizó (en la fase 4 se adapta a cada gimnasio). */
export const DISENO_SUGERIDO: TarjetaTablero[] = [
  { id: 'plantilla:ingresos-anio-vs-pasado', tamano: 'ancha' },
  { id: 'plantilla:horas-pico', tamano: 'ancha' },
  { id: 'plantilla:ventas-mes-plan', tamano: 'mediana' },
  { id: 'estado-clientes', tamano: 'mediana' },
  { id: 'plantilla:asistencias-por-dia', tamano: 'mediana' },
  { id: 'plantilla:clientes-sin-venir-30', tamano: 'mediana' },
  { id: 'por-vencer', tamano: 'ancha' },
];

export const NOMBRE_TAMANO: Record<TamanoTarjeta, string> = { chica: 'Chica', mediana: 'Mediana', ancha: 'Ancha' };

/** Hasta cuántas tarjetas (lo mismo valida la API). */
export const MAX_TARJETAS = 16;

/** Las tarjetas propias del Inicio (no son reportes), con el permiso que piden. */
export const TARJETAS_PROPIAS: { id: string; nombre: string; descripcion: string; permiso: string; tamano: TamanoTarjeta }[] = [
  { id: 'estado-clientes', nombre: 'Estado de los clientes', descripcion: 'Cuántos están al día, por empezar, vencidos o sin membresía.', permiso: 'clientes:leer', tamano: 'mediana' },
  { id: 'por-vencer', nombre: 'Membresías por vencer esta semana', descripcion: 'A quién avisar para que renueve, con el botón "Avisar".', permiso: 'membresias:leer', tamano: 'ancha' },
];

/** Cuánto ocupa cada tamaño en una grilla de 6 columnas (en el celular, todo el ancho). */
export const CLASE_TAMANO: Record<TamanoTarjeta, string> = {
  chica: 'col-span-6 md:col-span-3 xl:col-span-2',
  mediana: 'col-span-6 lg:col-span-3',
  ancha: 'col-span-6',
};

/** Los períodos que se pueden elegir en una tarjeta. */
export const RANGOS_TARJETA: RangoFecha[] = ['hoy', 'esta_semana', 'ultimos_7', 'este_mes', 'mes_pasado', 'ultimos_30', 'ultimos_90', 'este_anio', 'anio_pasado', 'todo'];
