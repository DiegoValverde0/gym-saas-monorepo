import { ASISTENCIAS } from './asistencias';
import { MEMBRESIAS } from './membresias';
import { TipoReporte } from './tipos';
import { VENTAS } from './ventas';

// Tipos de reporte disponibles. Para agregar uno: un archivo nuevo con su
// TipoReporte y sumarlo aquí (docs/plan-reporteria.md, sección 4).
export const TIPOS_REPORTE: TipoReporte[] = [VENTAS, MEMBRESIAS, ASISTENCIAS];

export const tipoReporte = (clave: string) => TIPOS_REPORTE.find((t) => t.clave === clave);

export * from './tipos';
