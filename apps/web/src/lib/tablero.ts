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

interface DatosDelGimnasio {
  modulos: { puntoVenta?: boolean; clasesGrupales?: boolean; controlPersonal?: boolean; controlAcceso?: boolean };
  /** Del asistente de inicio: musculacion, box, estudio, artes_marciales u otro. */
  tipoGimnasio?: string;
  /** Quien administra el gimnasio (organizaciones:actualizar) ve primero el dinero. */
  administra: boolean;
  /** Si esta persona puede ver una tarjeta (su permiso y el módulo de su reporte). */
  disponible: (id: string) => boolean;
}

// Los gimnasios que viven de sus clases ven la ocupación arriba.
const DE_CLASES = ['box', 'estudio', 'artes_marciales'];

/**
 * El Inicio de quien todavía no lo personalizó (docs/plan-inicio.md, fase 4):
 * según los módulos encendidos, el tipo de gimnasio y quién mira. El dueño ve
 * primero el dinero; recepción e instructores, lo del día (a quién avisar,
 * quién no viene).
 */
export function disenoSugerido({ modulos, tipoGimnasio, administra, disponible }: DatosDelGimnasio): TarjetaTablero[] {
  const vende = modulos.puntoVenta !== false;
  const acceso = modulos.controlAcceso !== false;
  const clases = !!modulos.clasesGrupales;
  const deClases = clases && DE_CLASES.includes(tipoGimnasio ?? '');
  const t = (id: string, tamano: TamanoTarjeta, si = true): TarjetaTablero | null => (si ? { id, tamano } : null);
  const ocupacion = (si: boolean) => t('plantilla:ocupacion-clases-semana', 'ancha', si);

  const lista = administra
    ? [
        t('plantilla:ingresos-anio-vs-pasado', 'ancha', vende),
        ocupacion(deClases),
        t('plantilla:horas-pico', 'ancha', acceso),
        ocupacion(clases && !deClases),
        t('plantilla:ventas-mes-plan', 'mediana', vende),
        t('estado-clientes', 'mediana'),
        t('plantilla:asistencias-por-dia', 'mediana', acceso),
        t('plantilla:clientes-sin-venir-30', 'mediana', acceso),
        t('plantilla:atrasos-equipo-mes', 'mediana', !!modulos.controlPersonal),
        t('por-vencer', 'ancha'),
      ]
    : [
        t('por-vencer', 'ancha'),
        t('plantilla:clientes-sin-venir-30', 'mediana', acceso),
        t('estado-clientes', 'mediana'),
        ocupacion(clases),
        t('plantilla:horas-pico', 'ancha', acceso),
        t('plantilla:asistencias-por-dia', 'mediana', acceso),
      ];
  return emparejar(lista.filter((x): x is TarjetaTablero => !!x && disponible(x.id)));
}

/**
 * Dos medianas llenan una fila: si quedan sueltas (una sola entre dos anchas),
 * la última se agranda para no dejar un hueco.
 */
export function emparejar(tarjetas: TarjetaTablero[]): TarjetaTablero[] {
  const resultado = [...tarjetas];
  let seguidas = 0;
  for (let i = 0; i <= resultado.length; i++) {
    if (i < resultado.length && resultado[i].tamano === 'mediana') {
      seguidas++;
      continue;
    }
    if (seguidas % 2 === 1) resultado[i - 1] = { ...resultado[i - 1], tamano: 'ancha' };
    seguidas = 0;
  }
  return resultado;
}

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
