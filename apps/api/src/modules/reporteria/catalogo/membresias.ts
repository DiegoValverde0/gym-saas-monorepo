import { Prisma } from '@prisma/client';
import { NOMBRES, TipoReporte } from './tipos';

// "Hoy" en la hora del gimnasio, como fecha (para días restantes).
const hoyLocal = (zonaHoraria: string) => Prisma.sql`(now() AT TIME ZONE ${zonaHoraria})::date`;

// Membresías: una fila por membresía vendida (vigente o no).
export const MEMBRESIAS: TipoReporte = {
  clave: 'membresias',
  nombre: 'Membresías',
  descripcion: 'Las membresías vendidas: plan, fechas, estado, cuánto se cobró y a quién.',
  fila: 'Una fila por cada membresía',
  permiso: 'membresias:leer',
  tabla: { nombre: 'membresias', alias: 'm', tieneDeletedAt: true },
  relaciones: [
    { alias: 'c', sql: 'LEFT JOIN clientes c ON c.id = m.cliente_id' },
    { alias: 'pl', sql: 'LEFT JOIN planes pl ON pl.id = m.plan_id' },
    { alias: 'pro', sql: 'LEFT JOIN promociones pro ON pro.id = m.promocion_id' },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = m.sucursal_id' },
    { alias: 'u', sql: 'LEFT JOIN usuarios u ON u.id = m.creado_por_id' },
  ],
  // Membresías sin sucursal (datos viejos) las ve también quien está limitado a una.
  sucursal: { sql: 'm.sucursal_id', opcional: true },
  creadoPor: { sql: 'm.creado_por_id' },
  fechaPorDefecto: 'fechaInicio',
  columnas: [
    { clave: 'fechaInicio', nombre: 'Empieza', grupo: 'Membresía', tipo: 'fecha', sql: 'm.fecha_inicio' },
    { clave: 'fechaFin', nombre: 'Vence', grupo: 'Membresía', tipo: 'fecha', sql: 'm.fecha_fin' },
    {
      clave: 'diasRestantes',
      nombre: 'Días que le quedan',
      grupo: 'Membresía',
      tipo: 'numero',
      sql: (ctx) => Prisma.sql`GREATEST(m.fecha_fin - ${hoyLocal(ctx.zonaHoraria)}, 0)`,
      ayuda: 'Hasta la fecha de vencimiento, contando desde hoy (0 si ya venció).',
    },
    { clave: 'duracion', nombre: 'Duración (días)', grupo: 'Membresía', tipo: 'numero', sql: 'm.fecha_fin - m.fecha_inicio + 1' },
    { clave: 'estado', nombre: 'Estado', grupo: 'Membresía', tipo: 'lista', sql: 'm.estado::text', opciones: NOMBRES.estadoMembresia },
    { clave: 'pagada', nombre: 'Pagada', grupo: 'Membresía', tipo: 'booleano', sql: 'm.pagada' },
    { clave: 'sesionesRestantes', nombre: 'Sesiones que le quedan', grupo: 'Membresía', tipo: 'numero', sql: "CASE WHEN pl.tipo_plan = 'SESIONES' THEN m.sesiones_restantes END", usa: ['pl'] },
    { clave: 'montoBase', nombre: 'Precio', grupo: 'Cobro', tipo: 'moneda', sql: 'm.monto_base' },
    { clave: 'descuento', nombre: 'Descuento', grupo: 'Cobro', tipo: 'moneda', sql: 'm.descuento_aplicado' },
    { clave: 'monto', nombre: 'Monto cobrado', grupo: 'Cobro', tipo: 'moneda', sql: 'm.monto_final' },
    { clave: 'vendidaEl', nombre: 'Vendida el', grupo: 'Cobro', tipo: 'fechaHora', sql: 'm.created_at' },
    { clave: 'vendidaPor', nombre: 'Vendida por', grupo: 'Cobro', tipo: 'texto', sql: 'u.nombre_completo', usa: ['u'] },
    { clave: 'promocion', nombre: 'Promoción', grupo: 'Cobro', tipo: 'texto', sql: 'pro.nombre', usa: ['pro'] },
    { clave: 'cliente', nombre: 'Cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.nombre', usa: ['c'] },
    { clave: 'clienteDocumento', nombre: 'Documento del cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.numero_documento', usa: ['c'] },
    { clave: 'clienteTelefono', nombre: 'Teléfono del cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.telefono', usa: ['c'] },
    { clave: 'clienteCorreo', nombre: 'Correo del cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.correo', usa: ['c'] },
    { clave: 'plan', nombre: 'Plan', grupo: 'Plan', tipo: 'texto', sql: 'pl.nombre', usa: ['pl'] },
    { clave: 'tipoPlan', nombre: 'Tipo de plan', grupo: 'Plan', tipo: 'lista', sql: 'pl.tipo_plan::text', usa: ['pl'], opciones: NOMBRES.tipoPlan },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde', tipo: 'texto', sql: "COALESCE(s.nombre, 'Sin sucursal')", usa: ['s'] },
  ],
  columnasIniciales: ['cliente', 'plan', 'fechaInicio', 'fechaFin', 'estado', 'monto'],
};
