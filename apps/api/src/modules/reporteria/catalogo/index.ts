import { ASISTENCIAS } from './asistencias';
import { CIERRES_CAJA, INVENTARIO, JORNADAS } from './caja-stock-jornadas';
import { RESERVAS, SESIONES } from './clases';
import { CLIENTES } from './clientes';
import { MEMBRESIAS } from './membresias';
import { GASTOS, PAGOS } from './pagos-gastos';
import { TipoReporte } from './tipos';
import { VENTAS } from './ventas';

// Tipos de reporte disponibles, en el orden en que se ofrecen. Para agregar
// uno: un archivo con su TipoReporte y sumarlo aquí (docs/plan-reporteria.md,
// sección 4). compilador.spec.ts prueba el filtro de organización de todos.
export const TIPOS_REPORTE: TipoReporte[] = [
  VENTAS,
  PAGOS,
  GASTOS,
  CIERRES_CAJA,
  CLIENTES,
  MEMBRESIAS,
  ASISTENCIAS,
  SESIONES,
  RESERVAS,
  INVENTARIO,
  JORNADAS,
];

export const tipoReporte = (clave: string) => TIPOS_REPORTE.find((t) => t.clave === clave);

export * from './tipos';
