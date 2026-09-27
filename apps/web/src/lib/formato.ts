// Formatos y nombres legibles que se repiten en varias pantallas.

export const bs = (n: number) => `Bs. ${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NOMBRE_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  PAGO_MOVIL: 'Pago móvil',
  OTRO: 'Otro',
};

// TipoConceptoVenta del esquema: ingresos y categorías de gasto.
export const NOMBRE_CONCEPTO: Record<string, string> = {
  MEMBRESIA: 'Membresía',
  PRODUCTO: 'Producto',
  SERVICIO: 'Servicio',
  OTRO: 'Otro cobro',
  ALQUILER: 'Alquiler',
  SERVICIOS_BASICOS: 'Servicios básicos',
  NOMINA: 'Nómina',
  INSUMOS: 'Insumos',
  MANTENIMIENTO: 'Mantenimiento',
  IMPUESTOS: 'Impuestos',
  OTRO_GASTO: 'Otro gasto',
};

// "YYYY-MM-DD" de una fecha en la hora local del navegador (toISOString
// daría la de UTC: de noche, el día siguiente).
export const fechaISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
