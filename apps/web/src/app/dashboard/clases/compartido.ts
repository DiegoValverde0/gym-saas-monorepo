// Tipos y utilidades compartidos por la pantalla de Clases, el asistente
// "Nueva clase" y el diálogo de una sesión.

export interface Disciplina { id: string; nombre: string }
export interface Sucursal { id: string; nombre: string }
export interface Entrenador { id: string; usuario?: { nombreCompleto: string } }
export interface Cliente { id: string; nombre: string; numeroDocumento?: string | null }

export interface Reserva {
  id: string;
  estado: string;
  clienteId: string;
  cliente?: Cliente;
}

// Una sesión (fecha concreta) de una clase.
export interface Clase {
  id: string;
  nombreClase: string;
  salaId?: string | null;
  sala?: { nombre: string } | null;
  descripcion?: string | null;
  capacidadMaxima: number;
  duracionMinutos: number;
  fechaHora: string;
  estado: string;
  sucursalId?: string | null;
  disciplinaId?: string | null;
  entrenadorId?: string | null;
  clasePlantillaId?: string | null;
  disciplina?: Disciplina;
  entrenador?: Entrenador;
  sucursal?: Sucursal;
  reservas?: Reserva[];
}

export interface ClasePlantilla {
  id: string;
  sucursalId: string;
  disciplinaId?: string | null;
  entrenadorId?: string | null;
  nombreClase: string;
  descripcion?: string | null;
  capacidadMaxima: number;
  diaSemana: number;
  horaInicio: string;
  duracionMinutos: number;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
  activa: boolean;
  disciplina?: Disciplina;
  entrenador?: Entrenador;
  sucursal?: Sucursal;
  // Fase 6 (DB-2): sala opcional.
  salaId?: string | null;
  // Fase 6 (DB-1): regla propia de la clase (null = la de su disciplina).
  acceso?: 'ABIERTA' | 'MIEMBROS' | 'PLANES' | null;
  planesAcceso?: { planId: string }[];
}

// Una clase recurrente = varias ClasePlantilla (una por día) con los mismos datos.
export interface SerieClase {
  clave: string;
  ids: string[];
  dias: number[];
  base: ClasePlantilla;
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_EN_FRASE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Lunes primero.
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const ordenDia = (d: number) => (d === 0 ? 7 : d);

export const horaDe = (iso: string) => new Date(iso).toISOString().substring(11, 16);
export const fechaDe = (iso?: string | null) => (iso ? new Date(iso).toISOString().split('T')[0] : '');
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const minutosDeHora = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Mismo criterio que el backend: una reserva con asistencia marcada sigue ocupando su cupo.
export const OCUPA_CUPO = (estado: string) => estado === 'CONFIRMADA' || estado === 'ASISTIO';

export function agruparSeries(plantillas: ClasePlantilla[]): SerieClase[] {
  const grupos = new Map<string, SerieClase>();
  for (const p of plantillas) {
    const clave = [
      p.sucursalId, p.salaId ?? '', p.acceso ?? '', (p.planesAcceso ?? []).map((x) => x.planId).sort().join(','), p.disciplinaId ?? '', p.entrenadorId ?? '', p.nombreClase, p.descripcion ?? '', p.capacidadMaxima,
      horaDe(p.horaInicio), p.duracionMinutos, fechaDe(p.vigenciaDesde), fechaDe(p.vigenciaHasta), p.activa,
    ].join('|');
    const serie = grupos.get(clave) ?? { clave, ids: [], dias: [], base: p };
    serie.ids.push(p.id);
    serie.dias.push(p.diaSemana);
    grupos.set(clave, serie);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, dias: [...new Set(g.dias)].sort((a, b) => ordenDia(a) - ordenDia(b)) }))
    .sort((a, b) => horaDe(a.base.horaInicio).localeCompare(horaDe(b.base.horaInicio)) || a.base.nombreClase.localeCompare(b.base.nombreClase));
}

// "martes y jueves", "lunes, miércoles y viernes"
function listaDias(dias: number[]): string {
  const nombres = [...dias].sort((a, b) => ordenDia(a) - ordenDia(b)).map((d) => DIAS_EN_FRASE[d]);
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// "Martes y jueves de 18:00 a 19:00"
export function describirHorario(dias: number[], inicio: number, duracion: number): string {
  const texto = `${listaDias(dias)} de ${hhmm(inicio)} a ${hhmm(inicio + duracion)}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "YYYY-MM-DDTHH:mm" (lo que espera <input type="datetime-local">) a partir de un ISO.
export function toDatetimeLocal(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const dateInputClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
