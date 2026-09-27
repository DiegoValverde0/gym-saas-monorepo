// Tipos y utilidades de la pantalla "Jornadas del equipo" (plan 7.2).

export type EstadoJornada = 'por_empezar' | 'atrasado' | 'en_turno' | 'termino' | 'no_marco' | 'sin_marcar' | 'ausente' | 'cancelado';

export interface JornadaHoy {
  id: string;
  staffId: string;
  staffNombre: string;
  sucursalId: string;
  sucursalNombre: string | null;
  inicio: number; // minutos desde medianoche, hora local de la organización
  fin: number;
  ingresoReal: number | null;
  salidaReal: number | null;
  estado: EstadoJornada;
  minutosAtraso: number;
  motivoAusencia: string | null;
  ausenteHasta: string | null;
}

export interface Ausencia {
  staffId: string;
  staffNombre: string;
  desde: string;
  hasta: string;
  motivo: string;
  dias: number;
}

export interface ClaseAfectada {
  id: string;
  nombreClase: string;
  fecha: string;
  hora: string;
  sucursal: string;
  motivo?: string;
}

export interface StaffBasico {
  id: string;
  usuario?: { nombreCompleto: string };
}

export const MOTIVOS_AUSENCIA = [
  { valor: 'VACACIONES', etiqueta: 'Vacaciones' },
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad' },
  { valor: 'PERMISO', etiqueta: 'Permiso' },
  { valor: 'OTRO', etiqueta: 'Otro' },
] as const;

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// "3 oct" (las fechas son "YYYY-MM-DD" locales: se formatean en UTC para no correrse un día).
export const fechaCorta = (fecha: string) =>
  new Date(`${fecha}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const fechaLarga = (fecha: string) =>
  new Date(`${fecha}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const duracion = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

export const inputClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
