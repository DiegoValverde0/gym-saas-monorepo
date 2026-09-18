import { TipoConceptoVenta } from '@prisma/client';

// TipoConceptoVenta quedó como único discriminador polimórfico de
// DetalleTransaccion al extenderlo a egresos (ver comentario en
// schema.prisma sobre por qué no se renombró el enum). Compartido entre
// transaccion.service.ts (valida una línea suelta contra el tipo de su
// transacción) y gasto-plantilla (valida que la categoría de una plantilla
// recurrente sea de egreso, nunca de venta).
export const CONCEPTOS_INGRESO = new Set<TipoConceptoVenta>(['MEMBRESIA', 'PRODUCTO', 'SERVICIO', 'OTRO']);
export const CONCEPTOS_EGRESO = new Set<TipoConceptoVenta>([
  'ALQUILER',
  'SERVICIOS_BASICOS',
  'NOMINA',
  'INSUMOS',
  'MANTENIMIENTO',
  'IMPUESTOS',
  'OTRO_GASTO',
]);
