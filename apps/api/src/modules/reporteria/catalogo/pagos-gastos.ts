import { Prisma } from '@prisma/client';
import { enHoraLocal, NOMBRES, TipoReporte } from './tipos';

// Pagos: una fila por cada pago recibido (una venta pagada mitad en efectivo
// y mitad con QR son dos pagos). Solo ingresos.
export const PAGOS: TipoReporte = {
  clave: 'pagos',
  nombre: 'Pagos recibidos',
  descripcion: 'Cómo te pagaron: forma de pago, cuenta, monto y quién cobró. Sirve para cuadrar efectivo, QR y transferencias.',
  fila: 'Una fila por cada pago recibido',
  permiso: 'pagos:leer',
  moduloGimnasio: 'puntoVenta',
  tabla: { nombre: 'pagos', alias: 'p', tieneDeletedAt: false },
  obligatorias: ['t'],
  condiciones: ["t.tipo = 'INGRESO'"],
  relaciones: [
    { alias: 't', sql: 'JOIN transacciones t ON t.id = p.transaccion_id AND t.deleted_at IS NULL' },
    { alias: 'cb', sql: 'LEFT JOIN cuentas_bancarias cb ON cb.id = p.cuenta_bancaria_id' },
    { alias: 'c', sql: 'LEFT JOIN clientes c ON c.id = t.cliente_id', requiere: ['t'] },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = t.sucursal_id', requiere: ['t'] },
    { alias: 'u', sql: 'LEFT JOIN usuarios u ON u.id = t.creado_por_id', requiere: ['t'] },
  ],
  sucursal: { sql: 't.sucursal_id', usa: ['t'], opcional: false },
  creadoPor: { sql: 't.creado_por_id', usa: ['t'] },
  fechaPorDefecto: 'fecha',
  columnas: [
    { clave: 'fecha', nombre: 'Fecha y hora', grupo: 'Pago', tipo: 'fechaHora', sql: 'p.fecha_hora' },
    { clave: 'dia', nombre: 'Día', grupo: 'Pago', tipo: 'fecha', sql: (ctx) => Prisma.sql`${enHoraLocal('p.fecha_hora')(ctx)}::date` },
    { clave: 'forma', nombre: 'Forma de pago', grupo: 'Pago', tipo: 'lista', sql: 'p.metodo_pago::text', opciones: NOMBRES.metodoPago },
    { clave: 'monto', nombre: 'Monto', grupo: 'Pago', tipo: 'moneda', sql: 'p.monto' },
    { clave: 'referencia', nombre: 'Referencia', grupo: 'Pago', tipo: 'texto', sql: 'p.referencia', ayuda: 'Número de operación, voucher o código del QR.' },
    { clave: 'cuenta', nombre: 'Cuenta', grupo: 'Pago', tipo: 'texto', sql: 'cb.numero_cuenta', usa: ['cb'] },
    { clave: 'cliente', nombre: 'Cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.nombre', usa: ['c'] },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde y quién', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
    { clave: 'cobradoPor', nombre: 'Cobrado por', grupo: 'Dónde y quién', tipo: 'texto', sql: 'u.nombre_completo', usa: ['u'] },
  ],
  columnasIniciales: ['fecha', 'forma', 'monto', 'cliente', 'cobradoPor'],
};

// Gastos: una fila por cada línea de gasto (EGRESO).
export const GASTOS: TipoReporte = {
  clave: 'gastos',
  nombre: 'Gastos',
  descripcion: 'En qué se gastó: categoría, proveedor, monto y si fue un gasto recurrente.',
  fila: 'Una fila por cada gasto (línea del gasto)',
  permiso: 'transacciones:leer',
  moduloGimnasio: 'controlGastos',
  tabla: { nombre: 'detalles_transaccion', alias: 'd', tieneDeletedAt: false },
  obligatorias: ['t'],
  condiciones: ["t.tipo = 'EGRESO'"],
  relaciones: [
    { alias: 't', sql: 'JOIN transacciones t ON t.id = d.transaccion_id AND t.deleted_at IS NULL' },
    { alias: 'pv', sql: 'LEFT JOIN proveedores pv ON pv.id = t.proveedor_id', requiere: ['t'] },
    { alias: 'gp', sql: 'LEFT JOIN gastos_plantilla gp ON gp.id = d.gasto_plantilla_id' },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = t.sucursal_id', requiere: ['t'] },
    { alias: 'u', sql: 'LEFT JOIN usuarios u ON u.id = t.creado_por_id', requiere: ['t'] },
  ],
  sucursal: { sql: 't.sucursal_id', usa: ['t'], opcional: false },
  creadoPor: { sql: 't.creado_por_id', usa: ['t'] },
  fechaPorDefecto: 'fecha',
  columnas: [
    { clave: 'fecha', nombre: 'Fecha y hora', grupo: 'Gasto', tipo: 'fechaHora', sql: 't.fecha_hora', usa: ['t'] },
    { clave: 'dia', nombre: 'Día', grupo: 'Gasto', tipo: 'fecha', sql: (ctx) => Prisma.sql`${enHoraLocal('t.fecha_hora')(ctx)}::date`, usa: ['t'] },
    { clave: 'categoria', nombre: 'Categoría', grupo: 'Gasto', tipo: 'lista', sql: 'd.tipo_concepto::text', opciones: NOMBRES.concepto },
    { clave: 'detalle', nombre: 'Detalle', grupo: 'Gasto', tipo: 'texto', sql: 'COALESCE(d.descripcion_libre, gp.descripcion)', usa: ['gp'] },
    { clave: 'monto', nombre: 'Monto', grupo: 'Gasto', tipo: 'moneda', sql: 'd.subtotal' },
    { clave: 'recurrente', nombre: 'Es un gasto recurrente', grupo: 'Gasto', tipo: 'booleano', sql: 'd.gasto_plantilla_id IS NOT NULL' },
    { clave: 'proveedor', nombre: 'Proveedor', grupo: 'Proveedor', tipo: 'texto', sql: 'COALESCE(pv.nombre, t.beneficiario)', usa: ['pv'] },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde y quién', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
    { clave: 'registradoPor', nombre: 'Registrado por', grupo: 'Dónde y quién', tipo: 'texto', sql: 'u.nombre_completo', usa: ['u'] },
  ],
  columnasIniciales: ['fecha', 'categoria', 'proveedor', 'detalle', 'monto'],
};
